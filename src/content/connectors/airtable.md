---
title: "Connect Airtable to Datanika"
description: "Step-by-step guide to sync Airtable bases into your warehouse with Datanika — create a personal access token, add the connection, pick tables, run, and schedule."
source: "airtable"
source_name: "Airtable"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating a personal access token in Airtable](/docs/connectors/airtable/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Airtable**.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `airtable-crm` or `airtable-content-calendar`.
   - **Airtable personal access token** — paste the PAT from Step 1 (`pat…`). Stored encrypted at rest with Fernet.
   - **Base ID** — the `app…` string from the Airtable URL of the base you want to sync.
4. Click **Create Connection**.

> **No "Test connection" button.** Airtable is an HTTP-API source — the credential is validated on the first pipeline run, not at save time.

![Adding the Airtable connection in Datanika](/docs/connectors/airtable/02-add-connection.png)

## Step 3 — Configure tables and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_airtable` to keep it separate from modeled data.
3. Datanika discovers all tables in the base automatically. Select which ones to sync.
4. For each table, choose a **Write disposition**:
   - `replace` — full refresh on every run. Simple and correct for most Airtable use cases where the base is small enough to reload.
   - `merge` — upserts changed rows using Airtable's record ID as the primary key. Better for large bases where full reloads are slow.
5. Save the pipeline configuration.

> **Tip.** Start with one small table to validate the schema lands correctly, then enable the rest. Airtable field types (single select, linked records, attachments) are flattened into warehouse-compatible columns by the loader.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Watch the **Runs** tab. Airtable syncs are usually fast — the API returns up to 100 records per page, so a 10k-record base typically finishes in under a minute.
3. If the PAT is missing a required scope or doesn't have access to the base, the run fails immediately with an Airtable API error naming the missing permission. Fix it at [airtable.com/create/tokens](https://airtable.com/create/tokens) — you can edit an existing token's scopes without regenerating it.
4. When the run finishes, open **Catalog → `<your warehouse>` → `raw_airtable`** and browse the landed tables. You should see one table per Airtable table you enabled.
5. Spot-check: compare row counts in Datanika against the record count shown at the bottom of the Airtable table view.

![First Airtable run](/docs/connectors/airtable/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence. Airtable data changes at human speed, so daily or every 6 hours is typical:
   - **Every 6 hours** — operational dashboards, team-facing metrics.
   - **Daily at 03:00** — batch reporting, weekly syncs into a warehouse-wide job.
   - **Hourly** — only if your workflow involves frequent programmatic updates to Airtable (e.g., Zapier/Make writing records throughout the day).
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications** so broken runs surface before downstream dashboards go stale.

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
