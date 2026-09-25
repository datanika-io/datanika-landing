---
title: "Connect Stripe to Datanika"
description: "Step-by-step guide to pipe Stripe into your warehouse with Datanika — create a restricted key, add the connection, pick resources, run, and schedule."
source: "stripe"
source_name: "Stripe"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-08-31"
related_use_cases:
  - "stripe-to-bigquery"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Stripe is the highest buyer-intent source we ship — most Datanika teams start here because landing Stripe in a warehouse is what turns raw payments data into revenue dashboards, cohort analyses, and finance-ops reports. This guide walks you end-to-end: create a read-only restricted key in Stripe, wire it into Datanika, pick which resources to sync, run the first backfill, and put it on a schedule. Expect 5–10 minutes for a first run against a small account.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported endpoints and load modes — see the [Stripe connector page](/connectors/stripe).

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
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `stripe`.
3. Fill in the form:
   - **Connection Name** — a label you'll recognize later, e.g. `stripe-prod` or `stripe-test`.
   - **API Key (optional)** — paste the restricted key from Step 1 (`rk_live_…` or `rk_test_…`). Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **Test Connection really checks this credential.** Clicking it sends one authenticated request to the Stripe API (it lists a single customer). A revoked, mistyped or suspended key comes back **red**, naming the status Stripe returned — it is no longer styled as a pass. What it does not check is **scope**: a restricted key that passes here can still lack the permissions that the resources you name on the upload require, and that surfaces on the first run.

![Adding the Stripe connection in Datanika](/docs/connectors/stripe/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters, digits and spaces — anything else is stripped as you type, so `stripe-daily-sync` becomes `stripedailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Stripe connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Stripe is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Stripe the list is `charges`, `customers`, `invoices`, `prices`, `products`, `subscriptions`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all — though unticking *every* box loads the full set rather than nothing.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Stripe rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `stripedailysync` creates schema `stripedailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

![The Data preview on the landed customers table, showing ten Stripe customers read live from the destination warehouse](/docs/connectors/stripe/04-first-run.png)

> **Why the screenshot says `Rows: 10`.** It was captured on 2026-08-31, before a fix to how Datanika pages through Stripe. Stripe's list endpoints return 10 records per page and set `"has_more": true` when there are more; that day's loader stopped after the first page, so an account with 15 customers landed 10 on a green run. The loader now follows Stripe's cursor to the end of each list ([core#823](https://github.com/datanika-io/datanika-core/issues/823)).
>
> ⚠️ **Self-hosting a tagged release? `v0.1.3` and every earlier release still stop at the first page**, and the run still goes green — see *Exactly 10 rows landed, on a self-hosted release* under Troubleshooting. Datanika Cloud, builds from `master`, and releases after `v0.1.3` follow the cursor. Either way, step 4's check stands: a green run says the load finished, not that it moved everything.

> **An endpoint that returns no records creates no table, and that is not a failed load.** Every endpoint is ticked by default, so finding fewer tables than boxes is normal: all of them were fetched, and dlt creates a table only for a resource that actually yields rows. On a new or lightly-used account that is the common case.
>
> Tell the two apart before assuming a bug: a table that is **missing** means that endpoint returned no records; a table that **exists but is short** means rows were dropped. Checking the count in Stripe itself is the fastest way to settle it.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `stripedailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

**What a scheduled run does to your tables:** each run replaces the upload's tables with what that run fetched, so a schedule keeps one copy of each record instead of adding another. A record the API no longer returns is gone after the next run, and so are rows only an earlier run had loaded. To keep every run's rows, the upload needs an explicit `"write_disposition": "append"` in its raw JSON config.

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

**Check the count first.** If exactly **10** rows landed for a resource that has more, and you run a self-hosted release, see the next entry.

**Cause.** The key reads a different Stripe mode from the one you are looking at. A `rk_test_…` key reads **test-mode** data only — often a small fraction of what the live dashboard shows — and a `rk_live_…` key never sees test objects.
**Fix.** Compare the key's prefix with the dashboard's **Test mode** toggle, and paste a key from the mode whose data you want.

### Exactly 10 rows landed, on a self-hosted release — [core#823]

**Cause.** Releases up to and including `v0.1.3` fetch only the first page of each Stripe list. Stripe returns 10 records per page and signals `"has_more": true`; those releases do not follow the cursor, so the run goes green with the first 10. It applies per resource, so one run can be complete for `products` and truncated for `customers`. Datanika Cloud, builds from `master`, and releases after `v0.1.3` follow the cursor and are not affected.

**Fix.** Move to a build that includes the fix ([core#823](https://github.com/datanika-io/datanika-core/issues/823)). On those releases a `paginator` supplied through **Use raw JSON config** is accepted and ignored, so it is not a workaround; until you upgrade, keep the affected resource under 10 records or load it through the [REST API connector](/docs/connectors/rest-api), where a paginator is honoured.

### Rate limited by Stripe (`Too many requests`)
**Cause.** Stripe enforces a default rate limit of ~100 read requests/second in live mode (lower in test mode). Large backfills against busy accounts can briefly hit it.
**Fix.** Datanika reads Stripe through dlt's generic REST client, and configures no rate-limit handling of its own — so how a burst is handled is that client's default behaviour, not anything tuned for Stripe. If you see persistent failures, split the pipeline into two: one for bulk historical resources (`charges`, `invoices`) on a slow cadence, one for lightweight resources (`customers`, `products`) on a fast cadence.

## Related

- **Use cases:** [Stripe → BigQuery](/use-cases/stripe-to-bigquery)
- **Comparisons:** [Datanika vs Fivetran for Stripe](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** starter staging models for `raw_stripe` and dbt best practices in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Stripe connector spec](/connectors/stripe)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
