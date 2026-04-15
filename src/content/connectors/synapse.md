---
title: "Connect Azure Synapse Analytics to Datanika"
description: "Step-by-step guide to use Azure Synapse as a destination in Datanika — configure SQL pool credentials, add the connection, set up pipelines to load data, and schedule."
source: "synapse"
source_name: "Azure Synapse"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
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
2. From the **type dropdown** at the top of the form, pick **Azure Synapse**.
3. Fill in:
   - **Connection Name** — e.g. `synapse-analytics` or `synapse-prod`.
   - **Synapse SQL endpoint** — the dedicated SQL pool endpoint, e.g. `<workspace>.sql.azuresynapse.net`. Find it in the Azure portal under **Synapse workspace → Overview → Dedicated SQL endpoint**.
   - **Port number** — default `1433`. Rarely needs changing.
   - **Database/pool name** — the name of the dedicated SQL pool, e.g. `analytics_pool` or `dwh`.
   - **Username** — `datanika_writer`.
   - **Password** — stored encrypted at rest with Fernet.
4. Click **Test Connection**.
5. Click **Create Connection**.

![Adding Synapse in Datanika](/docs/connectors/synapse/02-add-connection.png)

## Step 3 — Use Synapse as a pipeline destination

Synapse is a **destination** — you select it when configuring a pipeline's target.

1. Open or create a pipeline from any source (e.g., Salesforce, PostgreSQL, S3).
2. In **Configure pipeline**, pick the Synapse connection as the **destination**.
3. Choose a **target schema** — e.g., `raw_salesforce`. Datanika creates it if it doesn't exist.
4. Configure write dispositions per table (`replace`, `append`, or `merge`).
5. Save.

> **Tip.** For large initial loads, use `replace` with heap tables (Synapse default). Add distribution keys and clustered columnstore indexes in a dbt model after the raw data lands — optimizing the raw layer prematurely slows down loads.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Synapse load speed depends on the SQL pool's DWU (Data Warehouse Unit) scale — a DW100c handles modest loads; DW1000c+ handles large-scale ingestion.
3. Common first-run failures:
   - `Login failed` — wrong credentials or the login doesn't exist in the master database.
   - `Cannot open database` — wrong pool name, or the pool is paused.
   - `Network-related error` — firewall blocking. Add the client IP in the Synapse workspace firewall settings.
4. When finished, query the tables in Synapse Studio, Azure Data Studio, or Datanika's SQL Editor.

![First run to Synapse](/docs/connectors/synapse/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Consider the SQL pool's auto-pause behavior:
   - **Daily at 03:00** — standard for batch loads. Ensure the pool is active at run time (set an auto-resume schedule in Azure, or disable auto-pause).
   - **Every 6 hours** — mid-frequency reporting. Auto-pause must be disabled or set to > 6 hours.
   - **Hourly** — near-real-time. Only practical with auto-pause disabled and a DWU scale that handles continuous writes.
3. Choose a **timezone** and save.

> **Cost tip.** If you schedule daily loads, configure the SQL pool to auto-pause after 60 minutes of inactivity. The pool resumes automatically when Datanika connects, runs the load, then pauses again — you only pay for the active minutes.

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
