---
title: "Load Data into Databricks with Datanika"
description: "Step-by-step guide to set up Databricks as a destination in Datanika — create a service principal, add the connection, configure a pipeline, run, and schedule."
source: "databricks"
source_name: "Databricks"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Databricks is the enterprise lakehouse platform — teams choose it when they need a single environment for data engineering, ML, and BI on top of Delta Lake. This guide walks you end-to-end: create a service principal or personal access token in Databricks, wire it into Datanika as a destination, configure a pipeline from any source to Databricks, run the first load, and put it on a schedule.

> **Databricks is a destination, not a source.** In Datanika, Databricks receives data — it's where your raw tables land in Delta Lake format. To extract data *from* a source, you'll set up a source connection separately (e.g., [PostgreSQL](/docs/connectors/postgresql), [Salesforce](/docs/connectors/salesforce)). This guide covers the destination side.

> **Looking for the connector spec?** For the full field-by-field reference — supported catalog types, Unity Catalog, load modes, staging — see the [Databricks connector page](/connectors/databricks).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **Databricks workspace** on AWS, Azure, or GCP. If you're starting from scratch: create a workspace through your cloud provider's marketplace or [accounts.cloud.databricks.com](https://accounts.cloud.databricks.com/).
- A **SQL Warehouse** or **All-Purpose Cluster** running in the workspace. Datanika connects via Databricks SQL (the HTTP endpoint), so a SQL Warehouse is the most cost-effective option.
- A **source connection** already set up in Datanika (e.g., PostgreSQL, Stripe, CSV). Databricks is destination-only — you need something to pipe data *from*.
- **Credentials**: a personal access token (simpler) or a service principal (recommended for production). This guide covers both.

## Step 1 — Create credentials in Databricks

### Option A — Personal Access Token (quick start)

1. In the Databricks workspace, click your username in the top-right → **Settings → Developer → Access tokens**.
2. Click **Generate new token**.
3. Set a descriptive comment, e.g. `datanika-loader`, and an expiration (90 days is reasonable; set a calendar reminder to rotate).
4. Copy the token. **This is your only chance** — Databricks shows it once.

### Option B — Service Principal (recommended for production)

1. Go to **Account Console → User management → Service principals → Add service principal**.
2. Name it `datanika-loader`.
3. In the workspace, add the service principal and grant it:
   - **USE CATALOG** on the target catalog (e.g., `main`).
   - **USE SCHEMA**, **CREATE TABLE**, **MODIFY** on the target schema.
4. Generate a secret (OAuth or personal access token) for the service principal.

> **Least privilege.** Datanika needs `CREATE TABLE`, `MODIFY` (insert/update/delete), and `USE SCHEMA` on the target schema. It does not need workspace admin, cluster management, or access to other catalogs. Use Unity Catalog grants to scope permissions tightly.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `databricks`.
3. Fill in the form:
   - **Connection Name** — e.g. `databricks-prod` or `databricks-lakehouse`.
   - **Host** — the workspace URL hostname, e.g. `adb-1234567890.12.azuredatabricks.net`.
   - **HTTP Path** — the SQL Warehouse or cluster HTTP path, e.g. `/sql/1.0/warehouses/abc123`. Find this in the warehouse's **Connection details** tab.
   - **Access Token** — the personal access token or service principal secret from Step 1. Stored encrypted at rest with Fernet.
   - **Catalog** — the Unity Catalog catalog name, e.g. `main`. Leave blank for legacy hive_metastore.
   - **Schema** — the default landing schema, e.g. `raw_data`.
4. Click **Test Connection**. Datanika verifies it can connect to the SQL endpoint and access the catalog. You should see a green checkmark.
5. Click **Create Connection**.

![Adding Databricks as a destination in Datanika](/docs/connectors/databricks/02-add-connection.png)

> **Test connection fails?** Jump to [Troubleshooting](#troubleshooting) — most first-time failures are an expired token, wrong HTTP path, or the SQL Warehouse being stopped.

## Step 3 — Use Databricks as a destination

A destination is chosen per **upload**, at **`/uploads`** — not on the connection, and not on a pipeline page. There is no "Configure pipeline" button; `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type) and an optional **Description**.
3. Pick the **Source connection** you want to read from, and set the **Destination connection** to the Databricks connection from Step 2. Each picker opens a dialog listing entries as `17 — mywarehouse (databricks)`, i.e. id, name, type.
4. **What else the form shows depends on the *source*, not on Databricks.** **Load Mode**, **Write Disposition**, **Source schema** and **Table names** appear only when the source is a SQL database; for a file, SaaS, MongoDB, Google Sheets, REST or Kafka source they are hidden and the load takes whatever shape the source produces. Databricks honours what it is handed either way.
5. Click **Create Upload**. It appears in the table below with status `draft`.

![The New Upload form with Databricks as the destination](/docs/connectors/databricks/03-configure-upload.png)

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `lakehousedailyload` creates schema `lakehousedailyload` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `lakehousedailyload`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `Test connection failed: Invalid access token`
**Cause.** The personal access token is expired, revoked, or was copied incorrectly.
**Fix.** Generate a new token in Databricks (Step 1) and paste it into the connection. Check the expiration date — Databricks tokens have a configurable TTL and silently expire.

### `Test connection failed: Connection timed out`
**Cause.** The SQL Warehouse is stopped, or network connectivity is blocked.
**Fix.** In the Databricks workspace, verify the SQL Warehouse is running (or set to auto-start). Check that no network policies (VPC, private link, IP access lists) block Datanika's egress IPs.

### `HTTP path not found: /sql/1.0/warehouses/…`
**Cause.** The HTTP path in the connection form is wrong — typically copied from the wrong warehouse, or includes extra whitespace.
**Fix.** Open the SQL Warehouse in Databricks → **Connection details** tab → copy the **HTTP path** exactly. It looks like `/sql/1.0/warehouses/<id>` for SQL Warehouses or `/sql/protocolv1/o/<org-id>/<cluster-id>` for all-purpose clusters.

### `PERMISSION_DENIED: User does not have USE SCHEMA on schema`
**Cause.** The token's user or service principal doesn't have the required Unity Catalog grants.
**Fix.** As a catalog admin, run: `GRANT USE SCHEMA, CREATE TABLE, MODIFY ON SCHEMA main.raw_data TO \`datanika-loader\`;`. Replace `main.raw_data` with your catalog.schema.

### Run succeeds but tables aren't visible in Data Explorer
**Cause.** The tables were created in `hive_metastore` (legacy) instead of your Unity Catalog. This happens when the **Catalog** field is left blank.
**Fix.** Edit the connection in Datanika and set the **Catalog** field explicitly (e.g., `main`). Re-run the pipeline — dlt will create the tables in the correct catalog.

### Loads are slow (minutes for small datasets)
**Cause.** SQL Warehouse cold start. If the warehouse was idle and auto-suspended, the first query in a run triggers a startup that takes 30–90 seconds.
**Fix.** This is normal for the first query. Subsequent queries within the same run are fast. For time-sensitive loads, increase the warehouse's auto-suspend timeout or set a minimum cluster size > 0 to keep it warm.

## Related

- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** Databricks-specific materializations (Delta, liquid clustering) in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Databricks connector spec](/connectors/databricks)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
