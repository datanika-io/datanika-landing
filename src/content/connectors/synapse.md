---
title: "Connect Azure Synapse Analytics to Datanika"
description: "Step-by-step guide to use Azure Synapse as a destination in Datanika — configure SQL pool credentials, add the connection, set up pipelines to load data, and schedule."
source: "synapse"
source_name: "Azure Synapse"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-18"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Azure Synapse Analytics (formerly SQL Data Warehouse) is Microsoft's cloud-native analytics warehouse — it combines SQL pools with Spark, data integration, and Power BI in one service. This guide walks you through adding a Synapse dedicated SQL pool as a destination in Datanika so you can land data from any source into Synapse tables. Configure credentials, add the connection, build a pipeline, run, and schedule. Under 10 minutes if you already have a Synapse workspace with a dedicated SQL pool provisioned.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported data types, distribution strategies, PolyBase behavior — see the [Synapse connector page](/connectors/synapse).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- An **Azure Synapse workspace** with a **dedicated SQL pool** (not serverless — dedicated pools support external writes). The serverless SQL pool is read-only from external tools.
- A **SQL user** with write access to the target database (created in Step 1).
- **Network access**: Datanika must reach the Synapse SQL endpoint on port `1433`. Add Datanika's egress IPs to the Synapse workspace firewall, or enable "Allow Azure services" if Datanika runs inside Azure.

## Step 1 — Create a SQL user in Synapse

Create a dedicated user for Datanika with only the permissions it needs.

1. Connect to your Synapse dedicated SQL pool using Azure Data Studio, SSMS, or the Synapse Studio built-in query editor.
2. Create a login and user:
   ```sql
   -- Run in the master database
   CREATE LOGIN datanika_writer WITH PASSWORD = '<strong-password>';

   -- Switch to your dedicated SQL pool database
   CREATE USER datanika_writer FOR LOGIN datanika_writer;
   ```
3. Grant permissions:
   ```sql
   -- Schema-level write access
   GRANT CREATE TABLE TO datanika_writer;
   GRANT ALTER ON SCHEMA::dbo TO datanika_writer;
   GRANT INSERT ON SCHEMA::dbo TO datanika_writer;
   GRANT SELECT ON SCHEMA::dbo TO datanika_writer;
   
   -- If you want Datanika to create schemas (e.g., raw_stripe)
   GRANT CREATE SCHEMA TO datanika_writer;
   ```

> **Least privilege.** Don't grant `db_owner`. Datanika needs write access to the target schema only.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `synapse`.
3. Fill in:
   - **Connection Name** — e.g. `synapse-analytics` or `synapse-prod`.
   - **Host** — the dedicated SQL pool endpoint, e.g. `<workspace>.sql.azuresynapse.net`. Find it in the Azure portal under **Synapse workspace → Overview → Dedicated SQL endpoint**.
   - **Port** — default `1433`. Rarely needs changing.
   - **Database** — the name of the dedicated SQL pool, e.g. `analytics_pool` or `dwh`.
   - **User** — `datanika_writer`.
   - **Password** — stored encrypted at rest with Fernet.
4. Click **Test Connection**.
5. Click **Create Connection**.

![Adding Synapse in Datanika](/docs/connectors/synapse/02-add-connection.png)

## Step 3 — Use Synapse as a destination

A destination is chosen per **upload**, at **`/uploads`** — not on the connection, and not on a pipeline page. There is no "Configure pipeline" button; `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type) and an optional **Description**.
3. Pick the **Source connection** you want to read from, and set the **Destination connection** to the Synapse connection from Step 2. Each picker opens a dialog listing entries as `17 — mywarehouse (synapse)`, i.e. id, name, type.
4. **What else the form shows depends on the *source*, not on Synapse.** **Load Mode**, **Write Disposition**, **Source schema** and **Table names** appear only when the source is a SQL database; for a file, SaaS, MongoDB, Google Sheets, REST or Kafka source they are hidden and the load takes whatever shape the source produces. Synapse honours what it is handed either way.
5. Click **Create Upload**. It appears in the table below with status `draft`.

![The New Upload form with Synapse as the destination](/docs/connectors/synapse/03-configure-upload.png)

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `warehousedailyload` creates schema `warehousedailyload` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `warehousedailyload`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `Login failed for user 'datanika_writer'`
**Cause.** Wrong password, or the login doesn't exist in the master database of the Synapse workspace.
**Fix.** Connect to `master` and verify: `SELECT name FROM sys.server_principals WHERE name = 'datanika_writer'`. Create the login if missing.

### `Cannot open database` / `Database '<name>' does not exist`
**Cause.** The dedicated SQL pool name is wrong or the pool is paused.
**Fix.** Check the pool name in the Azure portal. If paused, resume it — Synapse doesn't auto-resume on login attempts from external tools.

### Firewall error (`Cannot open server`)
**Cause.** Datanika's IP isn't in the Synapse workspace firewall allowlist.
**Fix.** In Azure portal → Synapse workspace → Networking → add the client IP range. Or enable "Allow Azure services and resources to access this workspace" if Datanika runs in Azure.

### Loads are slow
**Cause.** The DWU scale is too low for the data volume, or the target tables have suboptimal distributions.
**Fix.** Scale up the SQL pool temporarily for the initial backfill (e.g., DW100c → DW500c), then scale back down. For ongoing loads, ensure target tables use `ROUND_ROBIN` distribution (the default) for raw landing.

### `CREATE TABLE permission denied`
**Cause.** The user doesn't have `CREATE TABLE` permission.
**Fix.** Grant: `GRANT CREATE TABLE TO datanika_writer;`. See Step 1.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** Synapse-specific materializations in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Azure Synapse connector spec](/connectors/synapse)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
