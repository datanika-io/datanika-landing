---
title: "How to Build a Stripe Revenue Dashboard with dbt"
description: "Stripe's dashboard can't do MRR, churn, or LTV the way you need. Here's how to pipe Stripe into your warehouse and model revenue metrics with dbt, step by step."
date: 2026-07-20
updatedDate: 2026-08-31
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "stripe", "dbt", "revenue", "mrr", "analytics"]
heroImage: "/logo.png"
---

Stripe's built-in dashboard is genuinely good — for operations. You can see today's charges, chase a failed payment, and eyeball gross volume. But the moment finance asks "what was net MRR in March, split by plan, excluding trials and after refunds?" you're exporting CSVs and fighting a pivot table. Stripe's reporting is deliberately shallow because Stripe is a payments processor, not an analytics warehouse.

The fix is the same one every serious SaaS team eventually lands on: **get Stripe's raw objects into a warehouse, model them with dbt, and point a BI tool at the result.** Once the data is modeled, MRR, churn, ARR, LTV, and cohort retention are just SQL — recomputed every morning, joinable against product usage, and auditable line by line.

This is the end-to-end tutorial. We'll land Stripe in a warehouse with [Datanika](/connectors/stripe/) (which wraps `dlt` for extract and `dbt-core` for transform in one app), write the staging and mart models, add tests, schedule the refresh, and connect a dashboard. Every SQL snippet below is real and runnable — adjust the column names to match what lands in your Catalog and you're done.

## What we're building

```
Stripe API
   │  (dlt, via Datanika)
   ▼
raw_stripe.*          ← raw objects: customers, invoices, subscriptions, charges
   │  (dbt staging: clean + cast)
   ▼
stg_stripe__*         ← typed, renamed, cents → dollars, epoch → timestamp
   │  (dbt marts: business logic)
   ▼
revenue_by_month      ┐
active_subscriptions  ├→  Metabase / Looker / your BI tool
customer_ltv          ┘
```

Three layers, one principle: **raw data lands untouched, staging cleans it, marts hold the business logic.** When someone disputes an MRR number six months from now, you can trace it from the dashboard tile all the way back to a specific Stripe invoice.

## Step 1 — Land Stripe in your warehouse

We won't repeat the full connector walkthrough here — the [Stripe setup guide](/docs/connectors/stripe/) covers it end to end (create a read-only restricted key, add the connection, pick resources, run, schedule). The short version:

1. In Stripe, create a **restricted key** (`Developers → API keys → Create restricted key`) with **Read** permission on `Customers`, `Charges`, `Invoices`, `Subscriptions`, `Products`, and `Prices`. Never use a standard secret key — Datanika only ever reads.
2. In Datanika, open **`/connections`**, pick **Stripe**, and paste the key (stored encrypted at rest with Fernet).
3. Create the upload. Because Stripe is a SaaS source, the form shows **Select endpoints to load** — a checkbox each for `charges`, `customers`, `invoices`, `prices`, `products` and `subscriptions`, all ticked by default. Untick what you don't need; each ticked endpoint becomes its own table.
4. Click **Run now** and watch the per-resource row counts in the **Runs** tab.

> **Where it lands, and why there's no field for it.** A SaaS source has **no write-disposition, load-mode, source-schema or table-name control** — those are rendered only for SQL database sources, and the endpoint checkboxes are the equivalent. So the destination schema is derived, not typed:
>
> - **BigQuery, Snowflake, Databricks** — it's the **Dataset** / **Schema** field on the *destination connection*, not on the upload.
> - **Postgres, MySQL, DuckDB and the rest** — it's the **upload's own name, snake-cased**. Upload names accept letters, digits and spaces only, so you can't type `raw_stripe` directly: name the upload **`Raw Stripe`** and you get the schema `raw_stripe`.
>
> This tutorial assumes you did one of those two things and ended up with `raw_stripe`. If you named the upload something else, substitute your schema everywhere below.

When it finishes, open **Catalog → your warehouse** and find the schema. You should see one table per resource: `customers`, `invoices`, `subscriptions`, `charges`, and so on, alongside dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. **Confirm the schema name here before you write `sources.yml`** — it is the single most common reason the models below fail to resolve. Keep that Catalog tab open; you'll use it to check exact column names as you write models too.

> **Two things to know about Stripe's data before you model it.** (1) **Amounts are integers in the smallest currency unit** — `2000` means $20.00 in USD. You divide by 100 in staging (except zero-decimal currencies like JPY — more on that below). (2) **Timestamps are Unix epoch seconds** — `1719792000`, not `2024-07-01`. `dlt` sometimes types these as proper timestamps during normalization and sometimes lands them as integers; check your Catalog and convert in staging if needed.

## Step 2 — Declare the source

In Datanika, dbt models live under **Transformations**. Start by telling dbt where the raw data is. Create a `sources.yml` (or add to your existing one):

```yaml
# models/staging/stripe/sources.yml
version: 2

sources:
  - name: raw_stripe
    description: "Raw Stripe objects loaded by Datanika/dlt"
    tables:
      - name: customers
      - name: invoices
      - name: subscriptions
      - name: charges
      - name: prices
```

Now `{{ source('raw_stripe', 'invoices') }}` resolves to the landed table, and dbt tracks the dependency in its DAG.

## Step 3 — Staging models: clean and cast

Staging models are thin views, one per raw table. They do exactly four things: **rename** to your conventions, **cast** types, **convert** cents and epochs, and **drop** columns you'll never use. No business logic — that's the marts' job.

Stripe stores foreign keys under the object's own name (`customer`, `subscription`), so we rename them to `_id` for clarity.

```sql
-- models/staging/stripe/stg_stripe__invoices.sql
{{ config(materialized='view') }}

select
    id                                          as invoice_id,
    customer                                    as customer_id,
    subscription                                as subscription_id,
    status,
    currency,

    -- cents → major units. Guard zero-decimal currencies (JPY, KRW…):
    amount_paid / 100.0                         as amount_paid,
    amount_due  / 100.0                         as amount_due,
    total       / 100.0                         as total,

    -- Unix epoch → timestamp (BigQuery). See dialect notes below.
    timestamp_seconds(created)                  as created_at,
    timestamp_seconds(period_start)             as period_start,
    timestamp_seconds(period_end)               as period_end
from {{ source('raw_stripe', 'invoices') }}
```

```sql
-- models/staging/stripe/stg_stripe__subscriptions.sql
{{ config(materialized='view') }}

select
    id                                          as subscription_id,
    customer                                    as customer_id,
    status,                                     -- active, trialing, past_due, canceled…
    timestamp_seconds(created)                  as created_at,
    timestamp_seconds(current_period_start)     as current_period_start,
    timestamp_seconds(current_period_end)       as current_period_end,
    case when canceled_at is not null
         then timestamp_seconds(canceled_at) end as canceled_at
from {{ source('raw_stripe', 'subscriptions') }}
```

```sql
-- models/staging/stripe/stg_stripe__customers.sql
{{ config(materialized='view') }}

select
    id                          as customer_id,
    email,
    name,
    currency,
    timestamp_seconds(created)  as created_at
from {{ source('raw_stripe', 'customers') }}
```

> **Warehouse dialect.** The `timestamp_seconds()` above is BigQuery. On **Postgres/Redshift** use `to_timestamp(created)`; on **Snowflake** use `to_timestamp(created)`; on **DuckDB** use `to_timestamp(created)` or `make_timestamp(created * 1000000)`. If `dlt` already landed these as timestamps, drop the wrapper entirely. This is the one place warehouse portability actually bites — everything downstream is plain SQL.

## Step 4 — The revenue marts

Now the fun part. Each mart is a `table` (materialized, because BI tools query it repeatedly).

### Collected revenue by month

The most-asked-for chart: how much did we actually collect, by month? Paid invoices are the source of truth — a charge can succeed without an invoice, and an invoice can exist without being paid, so we filter to `status = 'paid'`.

```sql
-- models/marts/finance/revenue_by_month.sql
{{ config(materialized='table') }}

select
    timestamp_trunc(period_start, month) as month,  -- BigQuery TIMESTAMP_TRUNC; Postgres: date_trunc('month', period_start)
    currency,
    count(distinct invoice_id)       as invoices_paid,
    count(distinct customer_id)      as paying_customers,
    sum(amount_paid)                 as revenue
from {{ ref('stg_stripe__invoices') }}
where status = 'paid'
group by 1, 2
order by 1
```

That's recognized, collected revenue — the number finance reconciles against the bank. Group by `period_start` (the service period) rather than `created_at` if you want revenue attributed to the month it covers instead of the month it was billed.

### Active subscriptions and churn

MRR movement starts with counting subscriptions in each state. This model gives you active counts and a monthly churn signal straight from the top-level subscription fields:

```sql
-- models/marts/finance/subscription_movement.sql
{{ config(materialized='table') }}

with subs as (
    select * from {{ ref('stg_stripe__subscriptions') }}
),

started as (
    select timestamp_trunc(created_at, month) as month,
           count(*) as new_subscriptions
    from subs
    group by 1
),

churned as (
    select timestamp_trunc(canceled_at, month) as month,
           count(*) as churned_subscriptions
    from subs
    where canceled_at is not null
    group by 1
)

select
    coalesce(s.month, c.month)                        as month,
    coalesce(s.new_subscriptions, 0)                  as new_subscriptions,
    coalesce(c.churned_subscriptions, 0)              as churned_subscriptions,
    coalesce(s.new_subscriptions, 0)
        - coalesce(c.churned_subscriptions, 0)        as net_new_subscriptions
from started s
full outer join churned c using (month)
order by month
```

For a point-in-time active count, filter `stg_stripe__subscriptions` to `status in ('active', 'trialing')` — that's your live subscriber base right now.

### Customer lifetime value

LTV to date is just total collected per customer. Join to `customers` for the email/name so the dashboard is readable:

```sql
-- models/marts/finance/customer_ltv.sql
{{ config(materialized='table') }}

select
    c.customer_id,
    c.email,
    c.created_at                     as signed_up_at,
    count(distinct i.invoice_id)     as invoices_paid,
    sum(i.amount_paid)               as lifetime_revenue,
    min(i.created_at)                as first_payment_at,
    max(i.created_at)                as last_payment_at
from {{ ref('stg_stripe__customers') }} c
left join {{ ref('stg_stripe__invoices') }} i
       on i.customer_id = c.customer_id
      and i.status = 'paid'
group by 1, 2, 3
order by lifetime_revenue desc
```

### True MRR from subscription items (the honest caveat)

Everything above uses top-level, high-confidence columns. **Normalized MRR is the one metric where your schema will differ from mine**, because a subscription's price lives in a *nested* array (`items.data[]`), and `dlt` flattens nested arrays into a child table — often something like `subscriptions__items__data`. Open your Catalog and find the real name before writing this model.

Once you've located it, MRR is: for every active subscription item, take `unit_amount × quantity`, normalize it to a monthly figure by the price's billing interval, and sum:

```sql
-- models/marts/finance/mrr.sql  ── adjust the source table name to your Catalog
{{ config(materialized='table') }}

select
    sum(
        (item.unit_amount / 100.0) * item.quantity
        * case item.recurring_interval          -- price's recurring.interval
              when 'month' then 1.0
              when 'year'  then 1.0 / 12
              when 'week'  then 52.0 / 12
              when 'day'   then 365.0 / 12
          end
    ) as mrr
from {{ source('raw_stripe', 'subscription_items') }} item   -- ← your actual child-table name
join {{ ref('stg_stripe__subscriptions') }} s
     on s.subscription_id = item.subscription_id
where s.status in ('active', 'trialing')
```

If most of your subscriptions carry a single price (typical for simpler SaaS), you can skip the nested table and read the price fields directly off the subscription. Either way, the interval-normalization `CASE` is the part people get wrong — a yearly plan is not $1,200 of MRR, it's $100.

## Step 5 — Test what you built

dbt tests turn "I think this is right" into CI. Add a `schema.yml` next to your models:

```yaml
# models/marts/finance/schema.yml
version: 2

models:
  - name: revenue_by_month
    columns:
      - name: revenue
        tests:
          - not_null
  - name: customer_ltv
    columns:
      - name: customer_id
        tests: [not_null, unique]
```

Run them from the Transformations UI. A failing `unique` on `customer_id` means a fan-out bug in your join; a `not_null` on `revenue` means an invoice slipped through with a null amount. Catch it here, not in a board deck.

## Step 6 — Schedule the whole pipeline

A dashboard is only as fresh as its slowest step. In Datanika, wire the extract and the transform into one dependency chain so transforms run **only after** the Stripe load succeeds:

1. Schedule the **Stripe upload** — hourly for revenue-ops dashboards, or daily at `03:00` if Stripe is one of many batch sources. (See the [Scheduling guide](/docs/scheduling/) for cron syntax and timezones.)
2. Schedule the **transformation pipeline** to depend on that upload. Datanika's DAG guarantees dbt won't run against half-loaded data.
3. Wire failure alerts in **Settings → Notifications** so a broken run pages your team before finance notices the numbers are stale — here's the [Slack alerts walkthrough](/blog/slack-alerts-pipeline-failures/).

## Step 7 — Point a dashboard at the marts

Your marts are just tables in the warehouse now, so any BI tool works. With **Metabase** (open source, free, runs on the same box if you self-host):

- **Revenue trend** — line chart on `revenue_by_month` (`month` × `revenue`).
- **MRR** — a single big-number tile on `mrr`.
- **Net subscriber movement** — bar chart on `subscription_movement` (`new` vs `churned` per month).
- **Top customers** — table on `customer_ltv` sorted by `lifetime_revenue`.

Because the logic lives in dbt, not in Metabase, every tile shares one definition of "revenue." Swap Metabase for Looker or Superset tomorrow and the numbers don't move.

## What you get

- **Metrics Stripe won't give you** — MRR, churn, net revenue retention, LTV, cohorts — defined once in SQL and recomputed every morning.
- **A full audit trail** — dashboard tile → mart → staging → the exact Stripe invoice. No black-box reporting.
- **Joinable data** — Stripe now sits in the same warehouse as your product usage and CRM, so "revenue by feature adoption" becomes one query.
- **No per-seat transform tax** — it's `dbt-core`, running on your schedule.

## What it costs

Datanika meters **bytes processed**, not rows or connectors. The [Free plan](/pricing/) includes **10 GB/month**. Pro is **$79/mo with 100 GB included** and **$0.50/GB** beyond that. A Stripe account's daily refresh is small — Stripe objects are narrow JSON — so for most teams the bill here is the subscription, not the volume. Check your own numbers in **Usage** rather than trusting that sentence.

Compare that to [Fivetran](/compare/fivetran/), which counts each Stripe object as monthly active rows and adds a per-connection minimum — the exact pricing model this whole tutorial routes around.

## Next steps

- **[Connect Stripe →](/docs/connectors/stripe/)** the full setup guide (restricted key, resources, first run).
- **[Stripe → BigQuery use case](/use-cases/stripe-to-bigquery/)** — the reference architecture for this pipeline.
- **[Transformations guide](/docs/transformations/)** — models, tests, snapshots, and materializations in Datanika.
- **[Browse all connectors](/connectors/)** — join Stripe against HubSpot, your product Postgres, Facebook Ads, and more.

Stripe gives you the payments. dbt gives you the metrics. Datanika is the ten-minute bridge between them.

[Start free at app.datanika.io](https://app.datanika.io/)
