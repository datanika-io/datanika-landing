---
title: "Connect Stripe to Datanika"
description: "Step-by-step guide to pipe Stripe into your warehouse with Datanika — create a restricted key, add the connection, pick resources, run, and schedule."
source: "stripe"
source_name: "Stripe"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases:
  - "stripe-to-bigquery"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Stripe is the highest buyer-intent source we ship — most Datanika teams start here because landing Stripe in a warehouse is what turns raw payments data into revenue dashboards, cohort analyses, and finance-ops reports. This guide walks you end-to-end: create a read-only restricted key in Stripe, wire it into Datanika, pick which resources to sync, run the first backfill, and put it on a schedule. Expect 5–10 minutes for a first run against a small account.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported endpoints, load modes, incremental strategy — see the [Stripe connector page](/connectors/stripe).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role in the target organization).
- A **destination warehouse** already connected in Datanika (PostgreSQL, BigQuery, Snowflake, Redshift, ClickHouse, or DuckDB). If you don't have one yet, follow the [Getting Started guide](/docs/getting-started) first. Stripe is **source-only** — you can't use it as a destination.
- **Stripe account access** with permission to create restricted API keys. On the Stripe dashboard this is **Developers → API keys → Create restricted key**. You'll need either an owner/admin role or an organization-level permission to manage keys.
- A **test-mode** Stripe account to validate the flow end-to-end before pointing it at live data — strongly recommended, not required.

## Step 1 — Create credentials in Stripe

Create a **dedicated restricted key** instead of reusing your secret key. Restricted keys let you grant the minimum set of read permissions Datanika needs, and you can revoke the key in one click without touching anything else.

1. Sign in to the Stripe dashboard and open **Developers → API keys**.
2. Click **+ Create restricted key**.
3. Name it something you'll recognize later, e.g. `datanika-readonly`.
4. Grant **Read** permission (not Write) on every resource you plan to sync. The resources Datanika reads by default are:
   - **Core** — `Customers`, `Charges`, `Invoices`, `Products`, `Prices`, `Subscriptions`
   - Add any others you want to sync (e.g. `Payouts`, `Disputes`, `Refunds`, `BalanceTransactions`) with **Read** permission as well.
5. Leave all **Write** permissions set to *None*. Datanika never writes to Stripe.
6. Click **Create key** and copy the value. It starts with `rk_live_…` (live mode) or `rk_test_…` (test mode). **This is your only chance to copy the key** — Stripe shows it exactly once.

> **Least privilege.** If you're ever prompted to paste a standard secret key (`sk_live_…`), stop. Datanika only needs a restricted key with `Read` permissions. A standard secret key grants write access to your entire Stripe account and is never required.

![Creating a restricted key in the Stripe dashboard](/docs/connectors/stripe/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Stripe**.
3. Fill in the form:
   - **Name** — a label you'll recognize later, e.g. `stripe-prod` or `stripe-test`.
   - **API key** — paste the restricted key from Step 1 (`rk_live_…` or `rk_test_…`). Stored encrypted at rest with Fernet.
4. Click **Save**.

> **Stripe connections don't expose a "Test connection" button.** Stripe is an HTTP-API source, so there's no `SELECT 1` equivalent to validate the credential offline. The credential is validated for real on the first pipeline run — see Step 4. If the key is bad, the run fails immediately with a clear Stripe API error.

![Adding the Stripe connection in Datanika](/docs/connectors/stripe/02-add-connection.png)

## Step 3 — Configure resources and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_stripe` so it's obvious where the data came from. Keep raw landing data separated from modeled data.
3. **Resources** — Datanika's Stripe source ships with the canonical set of endpoints:
   - `customers` — one row per Customer object
   - `charges` — every Charge, one row per event
   - `invoices` — Invoices, usually the table your finance team cares most about
   - `subscriptions` — current + historical Subscriptions
   - `products` — your Product catalog
   - `prices` — Prices attached to Products

   Pick the subset you need. Narrowing to 2–3 resources is the right move for the first run so you can validate the flow before pulling the full history.
4. **Start date** (optional) — Stripe backfills can be large. If you only care about the last 12 months of data, set a `start_date` to cut down initial-run time and API quota usage. Leave it empty to backfill all history.
5. **Write disposition** — `merge` is the right choice for every Stripe resource. Stripe records are identified by their `id` field, and `merge` upserts changed rows on each run (e.g. when an Invoice transitions from `open` to `paid`).
6. Save the pipeline configuration.

> **Tip.** Start with `customers` + `charges` on a test-mode account for the first run. Once you see the schemas land correctly in your warehouse, enable the full resource list against live data.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. You'll see per-resource row counts stream in as dlt extracts and loads each one. A typical first run against a small Stripe account is under 60 seconds; accounts with hundreds of thousands of charges can take several minutes.
3. If the restricted key is missing a required `Read` permission, the run fails with a Stripe API error naming the resource and permission. Fix it in the Stripe dashboard (Step 1), re-save the key in Datanika (Step 2), and re-run.
4. When the run finishes, open **Catalog → `<your warehouse>` → `raw_stripe`** and browse the landed tables. You should see one table per resource you enabled — `customers`, `charges`, `invoices`, and so on.
5. Spot-check: `SELECT count(*) FROM raw_stripe.customers;` should roughly match the customer count shown in the Stripe dashboard for the same time window.

![First run in the Runs tab](/docs/connectors/stripe/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence. Stripe data changes continuously, so freshness usually matters:
   - **Hourly** — revenue dashboards, finance-ops Slack alerts, near-real-time subscription metrics.
   - **Every 6 hours** — weekly/monthly finance reporting, cohort analysis.
   - **Daily at 03:00** — long-running warehouse batch jobs where Stripe is one of many sources.
3. Choose a **timezone** — matters when your cadence is daily or weekly.
4. Save. The next scheduled run appears in the **Runs** tab.
5. Wire up failure alerts in **Settings → Notifications** so broken runs page your finance/data team before stakeholders notice the dashboards are stale.

![Configuring the schedule](/docs/connectors/stripe/05-schedule.png)

## Troubleshooting

### `Stripe source requires 'api_key'`
**Cause.** The connection was saved without a credential, or the credential field was blanked out on edit.
**Fix.** Open the connection in Datanika, paste the restricted key again, and save. The error surfaces on the first run, not at save time — Stripe credentials can't be validated offline.

### `Invalid API Key provided: rk_live_*`
**Cause.** The restricted key has been revoked in the Stripe dashboard, or it was copied incorrectly (a missing character at the end is a common one).
**Fix.** Create a new restricted key in Stripe (Step 1), paste it into the connection, re-run. Old keys cannot be "rotated" — Stripe only supports create + revoke.

### `This API call requires read permission on <resource>`
**Cause.** The restricted key is missing `Read` permission on a resource you enabled in the pipeline. For example, you enabled `invoices` sync but the key only grants read on `customers` and `charges`.
**Fix.** Open the restricted key in Stripe, grant `Read` on the missing resource, save. The key value itself doesn't change — your Datanika connection keeps working without re-pasting.

### Run succeeds but only a handful of rows landed
**Cause.** You set a `start_date` in Step 3 that cuts out most of your history. Stripe respects `start_date` strictly — events before the cutoff are not fetched.
**Fix.** Clear `start_date` and re-run to backfill the full history, or set an earlier date. Subsequent incremental runs only fetch new/changed rows regardless of `start_date`.

### Incremental runs seem to miss recently-updated invoices
**Cause.** Stripe webhook events can arrive minutes after the underlying object update. If a run queries Stripe during that lag window, the updated row may be missed until the next run.
**Fix.** Nothing to fix — just accept that there's a short eventual-consistency window. If strict real-time accuracy matters, use Stripe webhooks directly for your most time-sensitive fields and keep Datanika on hourly/daily for the bulk warehouse load.

### Rate limited by Stripe (`Too many requests`)
**Cause.** Stripe enforces a default rate limit of ~100 read requests/second in live mode (lower in test mode). Large backfills against busy accounts can briefly hit it.
**Fix.** dlt's Stripe source retries with backoff automatically — most rate-limit errors are invisible. If you see persistent failures, split the pipeline into two: one for bulk historical resources (`charges`, `invoices`) on a slow cadence, one for lightweight resources (`customers`, `products`) on a fast cadence.

## Related

- **Use cases:** [Stripe → BigQuery](/use-cases/stripe-to-bigquery)
- **Comparisons:** [Datanika vs Fivetran for Stripe](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** starter staging models for `raw_stripe` and dbt best practices in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Stripe connector spec](/connectors/stripe)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
