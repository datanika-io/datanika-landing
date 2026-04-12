---
title: "Load Data into Databricks with Datanika"
description: "Step-by-step guide to set up Databricks as a destination in Datanika — create a service principal, add the connection, configure a pipeline, run, and schedule."
source: "databricks"
source_name: "Databricks"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases:
  - "postgresql-to-databricks"
  - "salesforce-to-databricks"
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

![Creating credentials in Databricks](/docs/connectors/databricks/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **Connections → New connection**.
2. Pick **Databricks** from the connector list.
3. Fill in the form:
   - **Name** — e.g. `databricks-prod` or `databricks-lakehouse`.
   - **Server hostname** — the workspace URL hostname, e.g. `adb-1234567890.12.azuredatabricks.net`.
   - **HTTP path** — the SQL Warehouse or cluster HTTP path, e.g. `/sql/1.0/warehouses/abc123`. Find this in the warehouse's **Connection details** tab.
   - **Access token** — the personal access token or service principal secret from Step 1. Stored encrypted at rest with Fernet.
   - **Catalog** — the Unity Catalog catalog name, e.g. `main`. Leave blank for legacy hive_metastore.
   - **Schema** — the default landing schema, e.g. `raw_data`.
4. Click **Test connection**. Datanika verifies it can connect to the SQL endpoint and access the catalog. You should see a green checkmark.
5. Click **Save**.

![Adding Databricks as a destination in Datanika](/docs/connectors/databricks/02-add-connection.png)

> **Test connection fails?** Jump to [Troubleshooting](#troubleshooting) — most first-time failures are an expired token, wrong HTTP path, or the SQL Warehouse being stopped.

## Step 3 — Configure a pipeline to Databricks

1. Open the **source connection** you want to pipe data from and click **Configure pipeline**.
2. Pick **Databricks** as the destination.
3. Choose a **target schema**. We recommend a schema name that reflects the source — e.g. `raw_postgres`, `raw_stripe` — so it's obvious where the data came from. Keep raw landing data separated from modeled data.
4. Select the tables/endpoints to sync from the source. For each:
   - **Write disposition** — `replace` (full refresh) or `merge` (incremental upsert).
   - **Primary key** — required for `merge`. Used for Delta Lake `MERGE INTO` operations.
   - **Incremental cursor** — a monotonically increasing column (e.g. `updated_at`).
5. Save the pipeline configuration.

> **Tip.** Databricks SQL Warehouses auto-suspend after idle time. If your warehouse is stopped when a run starts, dlt will wait for it to start up (typically 30–90 seconds). Factor this into your schedule timing expectations.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. dlt stages data and uses Databricks SQL to load it into Delta tables.
3. When the run finishes, open **Catalog → Databricks → `raw_<source>`** to browse the landed tables.
4. Spot-check in the Databricks SQL editor: `SELECT count(*) FROM main.raw_postgres.orders;` should match the row count Datanika reports.
5. Verify in Databricks: **Data Explorer → catalog → schema → table → History** to see the Delta transaction log entries from the load.

![First run landing data in Databricks](/docs/connectors/databricks/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence:
   - **Hourly** — operational dashboards, near-real-time lakehouse analytics.
   - **Every 6 hours** — standard reporting, ML feature store updates.
   - **Daily at 03:00** — batch warehouse refresh, cost-optimized.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications** so broken runs surface before dashboards go stale.

> **Cost tip.** Databricks charges by DBU (Databricks Unit) per second of compute. SQL Warehouses are the cheapest option for load-only workloads. Auto-suspend after 10 minutes is the default — your warehouse won't run between scheduled loads. For very frequent schedules (every 15 min), consider increasing the auto-suspend timeout to avoid repeated cold starts.

![Configuring the schedule](/docs/connectors/databricks/05-schedule.png)

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

- **Use cases:** [PostgreSQL → Databricks](/use-cases/postgresql-to-databricks), [Salesforce → Databricks](/use-cases/salesforce-to-databricks)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** Databricks-specific materializations (Delta, liquid clustering) in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Databricks connector spec](/connectors/databricks)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
