---
title: "Connect Notion to Datanika"
description: "Step-by-step guide to sync Notion databases into your warehouse with Datanika — create an internal integration, add the connection, pick databases, run, and schedule."
source: "notion"
source_name: "Notion"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Notion databases are where teams track everything from sprint boards to CRM contacts to content calendars. This guide lands that data in your warehouse so you can query it with SQL, join it with production data, and build dashboards that don't depend on Notion's built-in views. Create an internal integration, wire it into Datanika, pick which databases to sync, run, and schedule. Under 5 minutes for a typical workspace.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported property types, pagination, rate limits — see the [Notion connector page](/connectors/notion).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika (PostgreSQL, BigQuery, Snowflake, etc.). Notion is **source-only**.
- A **Notion workspace** where you have permission to create integrations (workspace owner or member with integration management rights).
- At least one **Notion database** (not a page — databases have the table/board/gallery/calendar view). The integration needs to be explicitly shared with each database you want to sync.

## Step 1 — Create an internal integration in Notion

Notion uses "internal integrations" for programmatic access. Each integration gets a token scoped to the databases you explicitly share with it.

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations) and click **New integration**.
2. Name it `datanika-readonly` and select the workspace it belongs to.
3. Under **Capabilities**, ensure:
   - **Read content** — enabled (required)
   - **Update content** — disabled (Datanika never writes to Notion)
   - **Insert content** — disabled
4. Click **Submit** and copy the **Internal Integration Secret**. It starts with `ntn_…` (or `secret_…` on older integrations).
5. **Share each database with the integration.** Open the database page in Notion, click the `•••` menu in the top-right → **Connections → Connect to → `datanika-readonly`**. Repeat for every database you want to sync. Databases not explicitly shared are invisible to the integration.

> **Least privilege.** Only enable "Read content." The integration cannot access any database you haven't explicitly shared with it, so even an overly broad read permission is effectively scoped by sharing.
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `notion`.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `notion-workspace` or `notion-product-team`.
   - **API Key (optional)** — paste the integration secret from Step 1 (`ntn_…`). Stored encrypted at rest with Fernet.
4. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **Credentials are validated on the first run.** Notion is an HTTP-API source, so the **Test Connection** button reports *"Test not applicable for this type"* — the token is validated for real when the first pipeline runs.

![Adding the Notion connection in Datanika](/docs/connectors/notion/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `notion-daily-sync` becomes `notiondailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Notion connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Notion is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Notion the list is `databases`, `pages`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all — though unticking *every* box loads the full set rather than nothing.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Notion rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `notiondailysync` creates schema `notiondailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `notiondailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `Could not find database with ID: …`
**Cause.** The database wasn't shared with the integration, or it was moved to trash.
**Fix.** Open the database in Notion → `•••` → **Connections** → verify `datanika-readonly` is listed. If the database was trashed, restore it first.

### `401 Unauthorized` or `Invalid token`
**Cause.** The integration token was revoked or pasted incorrectly.
**Fix.** Go to [notion.so/my-integrations](https://www.notion.so/my-integrations), regenerate the secret, and update the connection in Datanika.

### `API rate limit exceeded` (HTTP 429)
**Cause.** Notion enforces 3 requests per second per integration. Large workspaces with many databases can hit this.
**Fix.** dlt retries with backoff automatically. If persistent, split into separate pipelines: one for high-priority databases, one for the rest.

### Relation properties show page IDs instead of titles
**Cause.** Notion's API returns relation properties as arrays of page IDs (`{"id": "…"}`), not the page title. This is an API limitation.
**Fix.** Sync both databases and join them in dbt: `SELECT a.*, b.title FROM raw_notion.tasks a LEFT JOIN raw_notion.projects b ON b._notion_page_id = ANY(a.project_ids)`.

### Formula and rollup columns are empty
**Cause.** Notion computes formula and rollup values on read, but the API sometimes returns them as `null` for freshly created or bulk-imported pages.
**Fix.** Wait a few minutes and re-run. If the issue persists, the formula may reference a relation that isn't shared with the integration — share the related database.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** starter staging models for `raw_notion` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Notion connector spec](/connectors/notion)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
