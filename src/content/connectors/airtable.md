---
title: "Connect Airtable to Datanika"
description: "Step-by-step guide to sync Airtable bases into your warehouse with Datanika — create a personal access token, add the connection, pick tables, run, and schedule."
source: "airtable"
source_name: "Airtable"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Airtable sits in the gap between spreadsheets and databases — teams use it for CRM trackers, project boards, content calendars, and inventory lists. This guide walks you through landing Airtable data in your warehouse so you can join it with the rest of your stack: create a personal access token, wire it into Datanika, pick which tables to sync, run the first backfill, and put it on a schedule. Expect under 5 minutes for a small base.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported field types, pagination behavior, rate limits — see the [Airtable connector page](/connectors/airtable).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika (PostgreSQL, BigQuery, Snowflake, etc.). Airtable is **source-only** — you can't use it as a destination.
- An **Airtable account** on any plan (Free, Team, Business, or Enterprise). You need permission to create personal access tokens — workspace owners and creators have this by default.
- The **base ID** of the base you want to sync. You can find it in the Airtable URL: `https://airtable.com/<BASE_ID>/...` — it starts with `app`.

## Step 1 — Create a personal access token in Airtable

Personal access tokens (PATs) replaced the legacy API key in 2024. They're scoped per base and per permission level, so you can grant Datanika read-only access to exactly the bases it needs.

1. Go to [airtable.com/create/tokens](https://airtable.com/create/tokens) (or **Account → Developer hub → Personal access tokens**).
2. Click **Create new token**.
3. Name it something recognizable, e.g. `datanika-readonly`.
4. Under **Scopes**, grant:
   - `data.records:read` — read records from tables
   - `schema.bases:read` — read base schema (table names, field types)
5. Under **Access**, add the specific base(s) you want to sync. Avoid granting access to "All current and future bases" unless you have a reason.
6. Click **Create token** and copy the value. It starts with `pat…`. **This is your only chance to copy it** — Airtable shows it exactly once.

> **Least privilege.** Only grant `read` scopes. Datanika never writes to Airtable. If you're syncing multiple bases, you can either create one token with access to all of them or one token per base — one-per-base is easier to revoke without disrupting other pipelines.
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `airtable`.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `airtable-crm` or `airtable-content-calendar`.
   - **API Key (optional)** — paste the Airtable personal access token from Step 1 (`pat…`). Stored encrypted at rest with Fernet.
   - **Base ID** — the `app…` string from the Airtable URL of the base you want to sync.
4. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **Credentials are validated on the first run.** Airtable is an HTTP-API source, so the **Test Connection** button reports *"Test not applicable for this type"* — the PAT is validated for real when the first pipeline runs.

![Adding the Airtable connection in Datanika](/docs/connectors/airtable/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `airtable-daily-sync` becomes `airtabledailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Airtable connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Airtable is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Airtable the list is `tables`. Untick anything you do not want; each ticked endpoint becomes its own table in the destination.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Airtable rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `airtabledailysync` creates schema `airtabledailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `airtabledailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND`
**Cause.** The PAT doesn't have `data.records:read` or `schema.bases:read` scope, or it doesn't have access to the base specified in the connection.
**Fix.** Edit the token at [airtable.com/create/tokens](https://airtable.com/create/tokens) — add the missing scope and/or add the base under **Access**. No need to regenerate the token or update it in Datanika.

### `NOT_FOUND` on a specific table
**Cause.** The table was renamed or deleted in Airtable after the pipeline was configured.
**Fix.** Re-open the pipeline configuration (Step 3) and re-select tables. Datanika rediscovers the base schema each time you open the config.

### `INVALID_REQUEST_UNKNOWN` or `401 Unauthorized`
**Cause.** The token was revoked or is malformed (truncated during copy-paste).
**Fix.** Create a new PAT in Airtable (Step 1), update the connection in Datanika with the new token, re-run.

### Rate limited (`429 Too Many Requests`)
**Cause.** Airtable enforces 5 requests per second per base. Large bases with many tables can hit this during a full sync.
**Fix.** dlt retries with exponential backoff automatically. If you see persistent 429s, split the pipeline into two: one for high-priority tables on a fast cadence, one for the rest on daily.

### Linked record fields show record IDs instead of display values
**Cause.** Airtable's API returns linked records as arrays of record IDs (`rec…`), not the display value from the linked table. This is an API-level limitation, not a Datanika bug.
**Fix.** Sync both tables and join them in a dbt model: `SELECT a.*, b.name FROM raw_airtable.tasks a LEFT JOIN raw_airtable.projects b ON b._airtable_id = ANY(a.project)`.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** starter staging models for `raw_airtable` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Airtable connector spec](/connectors/airtable)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
