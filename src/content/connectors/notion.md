---
title: "Connect Notion to Datanika"
description: "Step-by-step guide to sync Notion databases into your warehouse with Datanika — create an internal integration, add the connection, pick databases, run, and schedule."
source: "notion"
source_name: "Notion"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating an internal integration in Notion](/docs/connectors/notion/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Notion**.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `notion-workspace` or `notion-product-team`.
   - **Notion integration token** — paste the secret from Step 1 (`ntn_…`). Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **No "Test connection" button.** Notion is an HTTP-API source — the token is validated on the first pipeline run, not at save time.

![Adding the Notion connection in Datanika](/docs/connectors/notion/02-add-connection.png)

## Step 3 — Configure databases and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_notion`.
3. Datanika discovers all databases shared with the integration. Select which ones to sync.
4. For each database, choose a **Write disposition**:
   - `replace` — full refresh. Simple and correct for most Notion databases, which are typically under 100k rows.
   - `merge` — upserts using Notion's page ID as the primary key. Use for large databases where full reloads are slow.
5. Save the pipeline configuration.

> **Tip.** Notion property types (select, multi-select, relation, rollup, formula) are flattened into warehouse-compatible columns. Relation properties land as arrays of page IDs — join them with the related database's table in a dbt model.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Watch the **Runs** tab. Notion's API returns 100 pages per request, so a 5k-row database typically finishes in under a minute.
3. If a database wasn't shared with the integration (Step 1.5), it won't appear in the results — no error, just missing data. Go back to Notion and share it.
4. When the run finishes, open **Catalog → `<your warehouse>` → `raw_notion`** and browse the tables. One table per database.
5. Spot-check: compare row counts against the record count in Notion's database view.

![First Notion run](/docs/connectors/notion/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence. Notion data changes at human speed:
   - **Daily at 03:00** — standard for reporting dashboards.
   - **Every 6 hours** — if your team updates Notion throughout the day and you need fresher data in the warehouse.
   - **Hourly** — rarely needed unless Notion is updated programmatically (e.g., via Zapier or the Notion API).
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications**.

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
