---
title: "A Customer 360 from HubSpot and Stripe: the Join Is the Work"
description: "Two connectors and a sources.yml is the easy half. The two systems share no identifier, so the real question is what fraction of your customers actually match — and what you do with the rest."
date: 2026-09-07
publishedAt: 2026-09-07
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "dbt", "hubspot", "stripe", "data-modeling", "analytics"]
---

Every "customer 360" tutorial shows you the easy half. Sync your CRM, sync your billing system, write a `sources.yml`, and then — with no ceremony at all — this line:

```sql
join hubspot_contacts hc on hc.email = sc.email
```

That line is where the tutorial ends and the work starts. HubSpot and Stripe share **no identifier**. Not one. There is no HubSpot ID in Stripe and no Stripe ID in HubSpot unless somebody deliberately put it there. The only overlapping *value* is an email address, typed by a human into two different forms, possibly years apart, possibly not the same address.

So the question this post answers is not "how do I join these." It is **what fraction of your customers actually match, how do you find out, and what do you do with the ones that don't** — because in every real dataset there are some, and the difference between a trustworthy customer 360 and a misleading one is entirely in how honestly you handle them.

If you want the Stripe-only revenue modelling first — MRR, churn, LTV — that is [a separate post](/blog/stripe-revenue-dashboard-dbt/). This one assumes you have Stripe landed and adds HubSpot beside it.

## What the two systems actually give you

Worth being precise, because half the tutorials out there join against tables that don't exist.

In Datanika, HubSpot and Stripe are SaaS sources, so the upload form shows **Select endpoints to load** — a checkbox per resource. The full lists:

| Source | Endpoints |
|---|---|
| **HubSpot** | `companies`, `contacts`, `deals` |
| **Stripe** | `charges`, `customers`, `invoices`, `prices`, `products`, `subscriptions` |

Nine tables. Scan them for a shared key and you will not find one. `hubspot.contacts` has an email and an associated company; `stripe.customers` has an email and a name. That is the entire overlap, and both sides are free text.

> **Where the tables land.** A SaaS source has no write-disposition, load-mode or target-schema field — those are rendered only for SQL database sources. On **BigQuery / Snowflake / Databricks** the schema is the **Dataset**/**Schema** field on the *destination connection*. On **Postgres / MySQL / DuckDB** it is the **upload's own name, snake-cased** — and upload names accept letters, digits and spaces only, so you name the upload **`Raw Hubspot`** and get the schema `raw_hubspot`. Check the **Schema** column in **Models** — the sidebar entry for Datanika's data catalog, at **`/models`** — for the real name before writing `sources.yml`; a wrong schema name is the most common reason the models below don't resolve.

Two uploads, two schemas:

```yaml
# models/staging/sources.yml
version: 2

sources:
  - name: raw_stripe
    tables: [{name: customers}, {name: subscriptions}, {name: invoices}]
  - name: raw_hubspot
    tables: [{name: contacts}, {name: companies}, {name: deals}]
```

> **HubSpot returns default properties only.** If `email` or `domain` is missing from a landed table, it is not a Datanika bug — HubSpot's API returns a default property set unless the pipeline asks for more. Add the custom properties you need to the resource config before you go hunting through dbt.

## Step 1 — Normalize the identifiers before you join anything

Never join on a raw email column. Email is case-insensitive in the domain part, effectively case-insensitive at every provider anyone uses, frequently has trailing whitespace from a paste, and Gmail ignores dots and `+tags`. Two staging models, one job each: produce a `match_email` you can trust and a `email_domain` you can fall back to.

```sql
-- models/staging/stg_hubspot__contacts.sql
{{ config(materialized='view') }}

select
    hs_object_id                              as contact_id,
    associatedcompanyid                       as company_id,
    email                                     as email_raw,
    lower(trim(email))                        as match_email,
    split(lower(trim(email)), '@')[offset(1)] as email_domain,   -- BigQuery
    firstname,
    lastname,
    createdate                                as created_at
from {{ source('raw_hubspot', 'contacts') }}
where email is not null
```

```sql
-- models/staging/stg_stripe__customers.sql  (extends the version in the revenue post)
{{ config(materialized='view') }}

select
    id                                        as customer_id,
    email                                     as email_raw,
    lower(trim(email))                        as match_email,
    split(lower(trim(email)), '@')[offset(1)] as email_domain,
    name,
    -- the exact join key, when someone was disciplined enough to write it
    json_value(metadata, '$.hubspot_contact_id') as hubspot_contact_id_from_metadata,
    timestamp_seconds(created)                as created_at
from {{ source('raw_stripe', 'customers') }}
```

> **Dialect.** `split(...)[offset(1)]` and `json_value` are BigQuery. Snowflake: `split_part(lower(trim(email)), '@', 2)` and `metadata:hubspot_contact_id::string`. Postgres/DuckDB: `split_part(...)` and `metadata ->> 'hubspot_contact_id'`. Everything after staging is plain SQL.

The two remaining HubSpot models are thin. Note that `companies.domain` gets the same `lower(trim(...))` treatment — it is the Tier C join key, and a stray capital there costs you matches for no reason:

```sql
-- models/staging/stg_hubspot__companies.sql
{{ config(materialized='view') }}

select
    hs_object_id        as company_id,
    name,
    lower(trim(domain)) as domain
from {{ source('raw_hubspot', 'companies') }}
where domain is not null
```

```sql
-- models/staging/stg_hubspot__deals.sql
{{ config(materialized='view') }}

select
    hs_object_id       as deal_id,
    associatedcompanyid as company_id,   -- see the caveat below
    dealname,
    amount,
    dealstage,
    closedate
from {{ source('raw_hubspot', 'deals') }}
```

> **Check the deal→company column before you trust it.** In HubSpot, a deal's link to a company is an *association*, not a plain property, and which column (if any) lands depends on the properties your pipeline requests. Open **Models** and look at the landed `deals` table. If there is no company column, either add the association to the resource config or drop the two deal columns from the final model — the customer 360 is still worth building without them. Do not join deals on company *name*.

## Step 2 — Three joins, in descending order of trust

This is the part worth reading twice. There is not one join. There are three, they have very different reliability, and a customer 360 that treats them as interchangeable is quietly wrong.

### Tier A — an explicit key in Stripe `metadata` (exact)

Stripe lets you attach arbitrary `metadata` to a customer. If your signup flow writes the HubSpot contact ID there, you have a real foreign key and none of the rest of this post applies to those rows.

Almost nobody has this on day one, because it has to be decided *before* the customers exist. **If you take one action from this post, make it this one**: start writing `hubspot_contact_id` into Stripe customer metadata today. It does nothing for your backlog and it makes every future row exact.

### Tier B — normalized email (good, and incomplete)

The workhorse. Matches whenever the human typed the same address into both systems.

It fails in ways worth knowing, because each one is a real customer in your unmatched pile:

- signed up with `dana@acme.com`, billing goes through `accounts-payable@acme.com`
- signed up with a personal address, expensed it later
- the company was acquired and the domain changed
- one side has a typo

### Tier C — email domain → company domain (recovers real customers, over-matches on public domains)

When the emails differ but both live at `acme.com`, HubSpot's `companies.domain` bridges them. This is how you catch the `accounts-payable@` case, and it is the tier that needs a guard:

**`gmail.com` is not a company.** Join two consumer addresses on their domain and you will merge unrelated people into one "customer" with a straight face. Exclude free providers explicitly, and treat a domain matching many distinct Stripe customers as a signal to stop rather than a bigger match.

```sql
-- models/marts/customer_identity_map.sql
{{ config(materialized='table') }}

with stripe as (select * from {{ ref('stg_stripe__customers') }}),
     contacts as (select * from {{ ref('stg_hubspot__contacts') }}),
     companies as (select * from {{ ref('stg_hubspot__companies') }}),

free_domains as (
    select domain from unnest([
        'gmail.com','googlemail.com','yahoo.com','outlook.com','hotmail.com',
        'live.com','icloud.com','me.com','proton.me','protonmail.com','aol.com'
    ]) as domain
),

-- Tier C is only trustworthy where the domain identifies ONE company. A domain
-- shared by many Stripe customers is either a free provider we missed or an
-- agency billing for several clients; both should fall through to unmatched.
safe_domains as (
    select email_domain
    from stripe
    where email_domain not in (select domain from free_domains)
    group by email_domain
    having count(distinct customer_id) = 1
),

tier_a as (
    select s.customer_id, c.contact_id, 'A_metadata' as match_tier
    from stripe s
    join contacts c on c.contact_id = s.hubspot_contact_id_from_metadata
),

tier_b as (
    select s.customer_id, c.contact_id, 'B_email' as match_tier
    from stripe s
    join contacts c on c.match_email = s.match_email
    where s.customer_id not in (select customer_id from tier_a)
),

tier_c as (
    select s.customer_id, c.contact_id, 'C_domain' as match_tier
    from stripe s
    join safe_domains d on d.email_domain = s.email_domain
    join companies co on co.domain = s.email_domain
    join contacts c on c.company_id = co.company_id
    where s.customer_id not in (select customer_id from tier_a)
      and s.customer_id not in (select customer_id from tier_b)
),

unmatched as (
    select s.customer_id, cast(null as string) as contact_id, 'UNMATCHED' as match_tier
    from stripe s
    where s.customer_id not in (select customer_id from tier_a)
      and s.customer_id not in (select customer_id from tier_b)
      and s.customer_id not in (select customer_id from tier_c)
)

select * from tier_a
union all select * from tier_b
union all select * from tier_c
union all select * from unmatched
```

Two design choices worth stating, because they are the difference between this and the one-liner:

1. **Every Stripe customer appears exactly once**, including the ones that matched nothing. A map that silently drops rows turns "we couldn't match 18% of your revenue" into "revenue is 18% lower than Stripe says," and someone will spend a day on that.
2. **`match_tier` is a column, not a comment.** It travels downstream, so any number built on this map can be recomputed for exact matches only.

## Step 3 — Measure the match rate; don't assume it

Here is the model that makes this a system instead of a query. It answers *"how much of this do I believe?"* and it answers it every run.

```sql
-- models/marts/customer_identity_coverage.sql
{{ config(materialized='table') }}

select
    match_tier,
    count(*)                                                    as customers,
    round(100.0 * count(*) / sum(count(*)) over (), 1)          as pct_of_customers
from {{ ref('customer_identity_map') }}
group by match_tier
```

Then turn the number into a gate. dbt tests fail builds; that is the point:

```yaml
# models/marts/schema.yml
version: 2

models:
  - name: customer_identity_map
    columns:
      - name: customer_id
        tests: [not_null, unique]        # a fan-out here means a duplicate contact
      - name: match_tier
        tests:
          - accepted_values:
              values: ['A_metadata', 'B_email', 'C_domain', 'UNMATCHED']
```

```sql
-- tests/assert_identity_coverage_above_threshold.sql
-- Fails when unmatched customers exceed 25%. Set the threshold to a little worse
-- than today's real number, then tighten it as you fix the data. A threshold you
-- have never been near is not a test — it is decoration.
select 1
from (
    select
        countif(match_tier = 'UNMATCHED') / count(*) as unmatched_rate
    from {{ ref('customer_identity_map') }}
)
where unmatched_rate > 0.25
```

Run it the first time and read the number before you set the threshold. Whatever it is, it is *your* number, and it is the most useful single fact in this entire pipeline: nobody who joins on email has any idea what theirs is.

## Step 4 — Now the 360 is boring, which is the goal

With a map that every row goes through, the customer view is a straightforward assembly:

```sql
-- models/marts/customer_360.sql
{{ config(materialized='table') }}

select
    m.customer_id,
    m.match_tier,
    sc.email_raw                    as billing_email,
    sc.name                         as billing_name,
    hc.firstname, hc.lastname,
    co.name                         as company_name,
    co.domain                       as company_domain,

    -- billing side
    count(distinct sub.subscription_id)                          as subscriptions,
    countif(sub.status = 'active')                               as active_subscriptions,
    coalesce(sum(inv.amount_paid), 0)                            as lifetime_revenue,
    min(sc.created_at)                                           as billing_since,

    -- CRM side
    count(distinct d.deal_id)                                    as deals,
    max(d.closedate)                                             as last_deal_closed_at

from {{ ref('customer_identity_map') }} m
left join {{ ref('stg_stripe__customers') }}    sc using (customer_id)
left join {{ ref('stg_hubspot__contacts') }}    hc on hc.contact_id = m.contact_id
left join {{ ref('stg_hubspot__companies') }}   co on co.company_id = hc.company_id
left join {{ ref('stg_stripe__subscriptions') }} sub using (customer_id)
left join {{ ref('stg_stripe__invoices') }}     inv on inv.customer_id = m.customer_id
                                                   and inv.status = 'paid'
left join {{ ref('stg_hubspot__deals') }}       d  on d.company_id = co.company_id
group by 1,2,3,4,5,6,7,8
```

Every join is a `left join` **from the map**, so an unmatched Stripe customer still produces a row with real billing figures and null CRM fields. That is the honest shape: you know what you know.

## Step 5 — Ship the unmatched list to the humans

The unmatched bucket is not an error state. It is a work queue, and it is the highest-value output of the whole build — every row is a paying customer your CRM cannot see.

```sql
-- models/marts/unmatched_paying_customers.sql
select
    c.customer_id,
    c.billing_email,
    c.billing_name,
    c.lifetime_revenue
from {{ ref('customer_360') }} c
where c.match_tier = 'UNMATCHED'
  and c.lifetime_revenue > 0
order by c.lifetime_revenue desc
```

Sorted by revenue, because the ten unmatched customers who pay you the most are worth an afternoon of manual reconciliation and the long tail is worth an automation. Every row someone fixes moves permanently into Tier A if they write the metadata back.

## What this does not do

- **It is not identity resolution as a product.** No fuzzy name matching, no phonetic keys, no probabilistic scoring. Deterministic tiers with an explicit unmatched bucket beat a similarity threshold you cannot explain to finance.
- **It does not deduplicate within a system.** Two HubSpot contacts for the same person will both match the same Stripe customer and trip the `unique` test on `customer_id` — deliberately. Fix the CRM; don't paper over it in SQL.
- **It has no opinion on which side is right** when HubSpot and Stripe disagree about a name or a company. The model keeps both columns and lets you choose.
- **Tier C is a heuristic.** The `count(distinct customer_id) = 1` guard and the free-domain list make it defensible, not correct. If a number would embarrass you at 5% error, compute it on Tier A and B only — `match_tier` is right there.

## Wire it up

1. Two connections — [HubSpot](/docs/connectors/hubspot/) (private app token, `crm.objects.{contacts,companies,deals}.read`) and [Stripe](/docs/connectors/stripe/) (a **restricted** read key, never a secret key).
2. Two uploads. Name them so the schemas come out right, and confirm in **Models**.
3. The models above under **Transformations**, then schedule the transform to depend on **both** uploads — a 360 built from a fresh Stripe and yesterday's HubSpot is a 360 that disagrees with itself. See the [scheduling guide](/docs/scheduling/).
4. Point a dashboard at `customer_360` and `customer_identity_coverage`. Put the coverage number on the dashboard, not in a runbook. A match rate nobody looks at drifts.

Datanika meters **bytes processed**; both of these are narrow JSON sources and the [Free plan](/pricing/) includes 10 GB/month. Check **Usage** for your own figures.

## Next steps

- **[Stripe revenue dashboard with dbt](/blog/stripe-revenue-dashboard-dbt/)** — MRR, churn and LTV on the Stripe half.
- **[HubSpot setup guide](/docs/connectors/hubspot/)** · **[Stripe setup guide](/docs/connectors/stripe/)**
- **[Transformations](/docs/transformations/)** — how models, tests and schedules fit together.
- **[All connectors](/connectors/)** — the same identity map takes a third source the day you add one.

The join is the work. Measure it, publish the number, and hand the leftovers to a human.
