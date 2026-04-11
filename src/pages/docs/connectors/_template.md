---
title: "Connect <Source> to Datanika"
description: "Set up a <Source> connection in Datanika: create credentials, add the connection, pick tables, run, and schedule."
source: "<source-slug>"
source_name: "<Source>"
category: "<database | saas | file | api>"
verified_by: ""
verified_date: ""
related_use_cases: []
related_comparisons: []
---

# Connect <Source> to Datanika

One-paragraph intro: what this connector does, what data it extracts, and what the end result looks like after following this guide (e.g., "raw <Source> tables landed in your warehouse, ready to transform with dbt").

## Prerequisites

- A Datanika account with permission to create connections (Admin or Editor role).
- A destination warehouse already connected in Datanika (PostgreSQL, BigQuery, Snowflake, etc.).
- Access to <Source> with permission to `<required permission>`.
- `<any tool, CLI, or network access requirement>`.

## Step 1 — Create credentials in <Source>

Walk the reader through creating the credentials/API key/service account in the **source system's UI**. Keep it step-by-step with exact menu paths.

1. Sign in to <Source> and go to **<Menu> → <Submenu>**.
2. Click **<Button>** and give it a descriptive name (e.g., `datanika-readonly`).
3. Grant the following scopes/permissions:
   - `<scope 1>`
   - `<scope 2>`
4. Copy the generated `<API key | client ID + secret | connection string>` — you'll paste it into Datanika in the next step.

> **Least privilege:** only grant read access to the objects you plan to sync. Datanika never needs write permissions on the source.

![Creating credentials in <Source>](/docs/connectors/<source-slug>/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **Connections → New connection**.
2. Select **<Source>** from the connector list.
3. Fill in the connection form:
   - **Name** — a label you'll recognize (e.g., `<source>-prod`).
   - **<Field 1>** — `<what to paste>`
   - **<Field 2>** — `<what to paste>`
4. Click **Test connection**. You should see a green ✅ success message.
5. Click **Save**.

![Adding the connection in Datanika](/docs/connectors/<source-slug>/02-add-connection.png)

## Step 3 — Configure tables and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the destination warehouse and target schema (e.g., `raw_<source>`).
3. Select the tables/endpoints to sync. For each one, choose:
   - **Write disposition** — `replace` (full refresh) or `merge` (incremental).
   - **Primary key** — required for `merge`.
   - **Incremental cursor** — a monotonically increasing column (e.g., `updated_at`, `id`).
4. Save the pipeline configuration.

> **Tip:** start with 1–2 small tables to validate the flow end-to-end before enabling the full sync.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Watch the **Runs** tab for progress. A typical first run takes `<range>` depending on data volume.
3. When the run finishes, open **Catalog → <warehouse> → `raw_<source>`** to browse the landed tables.
4. Spot-check row counts and a few sample rows against the source system.

![Inspecting the first run](/docs/connectors/<source-slug>/04-first-run.png)

## Step 5 — Schedule it

1. Open the pipeline and click **Schedule**.
2. Pick a cadence — common choices:
   - **Hourly** — for operational dashboards
   - **Every 6 hours** — for marketing/finance reporting
   - **Daily at 03:00** — for warehouse-wide batch jobs
3. Choose a timezone and save.
4. The next scheduled run appears in the **Runs** tab. Failed runs trigger notifications if you've set them up in **Settings → Notifications**.

## Troubleshooting

### `<Error message 1>`
**Cause:** `<short explanation>`
**Fix:** `<concrete steps>`

### `<Error message 2>`
**Cause:** `<short explanation>`
**Fix:** `<concrete steps>`

### `<Error message 3>`
**Cause:** `<short explanation>`
**Fix:** `<concrete steps>`

### Connection test fails with a timeout
**Cause:** Datanika can't reach <Source> — usually a firewall or IP allowlist issue.
**Fix:** Allowlist Datanika's egress IPs (see [Self-hosting networking](/docs/self-hosting)) or expose <Source> on a reachable endpoint.

### Incremental run is pulling everything every time
**Cause:** The incremental cursor column isn't actually monotonic, or the pipeline was set to `replace` instead of `merge`.
**Fix:** Verify the cursor column in Step 3 and switch the write disposition to `merge` with a correct primary key.

## Related

- **Use cases:** [<Source> to PostgreSQL](/use-cases/<source-slug>-to-postgres), [<Source> to BigQuery](/use-cases/<source-slug>-to-bigquery)
- **Comparisons:** [Datanika vs Airbyte for <Source>](/compare/airbyte), [Datanika vs Fivetran for <Source>](/compare/fivetran)
- **dbt tips:** starter models for `raw_<source>` — see [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [<Source> connector spec](/connectors/<source-slug>)
