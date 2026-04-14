---
title: "Load Data into Snowflake with Datanika"
description: "Step-by-step guide to set up Snowflake as a destination in Datanika — create a service user, add the connection, configure a pipeline, run, and schedule."
source: "snowflake"
source_name: "Snowflake"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases:
  - "postgresql-to-snowflake"
  - "mongodb-to-snowflake"
  - "hubspot-to-snowflake"
  - "s3-to-snowflake"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Snowflake is the second most-requested warehouse destination on Datanika, right behind BigQuery. This guide walks you end-to-end: create a dedicated Snowflake user and role, wire them into Datanika as a destination, configure a pipeline from any source, run the first load, and put it on a schedule.

> **Snowflake is a destination, not a source.** In Datanika, Snowflake receives data — it's where your raw tables land. To extract data *from* a source, set up a source connection separately (e.g., [PostgreSQL](/docs/connectors/postgresql), [Stripe](/docs/connectors/stripe)). This guide covers the destination side.

> **Looking for the connector spec?** For the full field-by-field reference — supported authentication methods, warehouse sizing, role-based access — see the [Snowflake connector page](/connectors/snowflake).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **Snowflake account** with the ability to create users, roles, and warehouses — typically `ACCOUNTADMIN` or `SECURITYADMIN` + `SYSADMIN`.
- A **source connection** already set up in Datanika. Snowflake is destination-only — you need something to pipe data *from*.
- Your **Snowflake account identifier** — the `<orgname>-<account_name>` or `<locator>.<region>.<cloud>` string visible in the Snowflake URL (e.g., `xy12345.us-east-1`).

## Step 1 — Create a dedicated user and role in Snowflake

Create a **dedicated user and role** rather than reusing a personal login. This scopes permissions, simplifies audit logs, and lets you revoke access without touching anyone else's credentials.

1. Sign in to the Snowflake web UI (Snowsight) as `ACCOUNTADMIN` or `SECURITYADMIN`.
2. Open a SQL worksheet and run:
   ```sql
   -- Create a role for Datanika
   CREATE ROLE IF NOT EXISTS DATANIKA_LOADER;

   -- Create a warehouse (or reuse an existing one)
   CREATE WAREHOUSE IF NOT EXISTS DATANIKA_WH
     WITH WAREHOUSE_SIZE = 'X-SMALL'
     AUTO_SUSPEND = 60
     AUTO_RESUME = TRUE;

   -- Grant the role access to the warehouse
   GRANT USAGE ON WAREHOUSE DATANIKA_WH TO ROLE DATANIKA_LOADER;

   -- Create (or pick) the target database
   CREATE DATABASE IF NOT EXISTS RAW;
   GRANT USAGE ON DATABASE RAW TO ROLE DATANIKA_LOADER;
   GRANT CREATE SCHEMA ON DATABASE RAW TO ROLE DATANIKA_LOADER;
   GRANT ALL ON ALL SCHEMAS IN DATABASE RAW TO ROLE DATANIKA_LOADER;

   -- Create the Datanika user
   CREATE USER IF NOT EXISTS DATANIKA_USER
     PASSWORD = '<generate-a-strong-one>'
     DEFAULT_ROLE = DATANIKA_LOADER
     DEFAULT_WAREHOUSE = DATANIKA_WH;

   GRANT ROLE DATANIKA_LOADER TO USER DATANIKA_USER;
   ```
3. Copy the account identifier, username (`DATANIKA_USER`), and password — you'll paste them into Datanika next.

> **Least privilege.** `USAGE` on the warehouse + `CREATE SCHEMA` on the database is the minimum set. Datanika creates schemas and tables dynamically per pipeline. Do not grant `ACCOUNTADMIN` — Datanika never needs account-level operations.

![Creating the user and role in Snowsight](/docs/connectors/snowflake/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Snowflake**.
3. Fill in the form:
   - **Account** — the Snowflake account identifier, e.g. `xy12345.us-east-1`.
   - **User** — `DATANIKA_USER` (or whatever you named it).
   - **Password** — the password from Step 1. Stored encrypted at rest with Fernet.
   - **Database** — the target database, e.g. `RAW`.
   - **Warehouse** — the compute warehouse, e.g. `DATANIKA_WH`. If left empty, the user's default warehouse is used.
   - **Role** — the Snowflake role, e.g. `DATANIKA_LOADER`. If left empty, the user's default role is used.
   - **Schema** — optional; most users leave this empty and let Datanika create schemas per pipeline (e.g., `raw_postgres`, `raw_stripe`).
4. Click **Test connection**. Datanika opens a real Snowflake session and verifies connectivity. You should see a green ✅.
5. Click **Save**.

![Adding Snowflake as a destination in Datanika](/docs/connectors/snowflake/02-add-connection.png)

## Step 3 — Configure a pipeline to Snowflake

1. Open the **source connection** (e.g., PostgreSQL, Stripe, CSV) and click **Configure pipeline**.
2. Pick **Snowflake** as the destination warehouse.
3. Choose a **target schema** — e.g. `RAW_POSTGRES`, `RAW_STRIPE`. Snowflake schemas are created automatically if the role has `CREATE SCHEMA`.
4. Select the tables/endpoints to sync. For each:
   - **Write disposition** — `replace` (full refresh) or `merge` (incremental upsert).
   - **Primary key** — required for `merge`.
   - **Incremental cursor** — e.g. `updated_at`.
5. Save.

> **Cost tip.** Snowflake charges by compute-seconds when the warehouse is active. Use `AUTO_SUSPEND = 60` (set in Step 1) so the warehouse hibernates between pipeline runs. For large incremental loads, consider an `X-SMALL` warehouse — dlt streams data efficiently and doesn't need large warehouses for most ELT workloads.

## Step 4 — First run

1. Click **Run now** on the pipeline page.
2. Watch the **Runs** tab. dlt uses Snowflake's `COPY INTO` or `PUT`/`COPY` for bulk loading — expect fast ingestion even for large tables.
3. When done, open **Catalog → Snowflake → `RAW_POSTGRES`** (or your schema) and browse.
4. Spot-check: in Snowsight, run `SELECT count(*) FROM RAW.RAW_POSTGRES.<table>;` and compare to the source row count.
5. Check **Query History** in Snowsight to confirm queries ran under the `DATANIKA_LOADER` role and `DATANIKA_WH` warehouse.

![First run landing data in Snowflake](/docs/connectors/snowflake/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence:
   - **Hourly** — operational dashboards, near-real-time analytics.
   - **Every 6 hours** — standard reporting.
   - **Daily at 03:00** — full warehouse refresh, lowest compute cost window.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications**.

> **Warehouse auto-suspend matters.** If your schedule runs every 6 hours and your warehouse auto-suspends after 60 seconds, you'll pay for ~2 minutes of compute per run (spin-up + load + suspend). This is significantly cheaper than leaving a warehouse running 24/7.

![Configuring the schedule](/docs/connectors/snowflake/05-schedule.png)

## Troubleshooting

### `Test connection failed: Incorrect username or password`
**Cause.** Wrong password, or the user doesn't exist in this Snowflake account.
**Fix.** Verify the account identifier is correct (including region). Then reset the password: `ALTER USER DATANIKA_USER SET PASSWORD = '<new>';`. Note: Snowflake account identifiers are case-insensitive but region suffixes matter.

### `Test connection failed: could not connect to Snowflake`
**Cause.** The account identifier is wrong or Snowflake is unreachable. Common when the identifier is missing the region suffix.
**Fix.** Your account identifier should look like `xy12345.us-east-1` (with region) or `orgname-accountname` (new format). Check the URL in your browser when signed into Snowsight — the identifier is the subdomain.

### `Insufficient privileges to operate on database 'RAW'`
**Cause.** The `DATANIKA_LOADER` role doesn't have `USAGE` or `CREATE SCHEMA` on the target database.
**Fix.** As `ACCOUNTADMIN`, run: `GRANT USAGE ON DATABASE RAW TO ROLE DATANIKA_LOADER; GRANT CREATE SCHEMA ON DATABASE RAW TO ROLE DATANIKA_LOADER;`

### `Warehouse 'DATANIKA_WH' does not exist or not authorized`
**Cause.** The warehouse name is misspelled, or the role lacks `USAGE` on it.
**Fix.** Verify the warehouse exists: `SHOW WAREHOUSES;`. Then grant: `GRANT USAGE ON WAREHOUSE DATANIKA_WH TO ROLE DATANIKA_LOADER;`

### Run succeeds but only the schema is created — no tables
**Cause.** The source returned no data (empty table, or incremental cursor filtered everything out), or the pipeline was saved without selecting any tables.
**Fix.** Re-open the pipeline config and verify at least one table is selected. If using incremental with a `start_date`, try clearing it for a full-refresh test run.

### Snowflake costs seem high for small data volumes
**Cause.** The warehouse is oversized for the workload, or `AUTO_SUSPEND` is set too high (e.g., 300 seconds when loads finish in 10 seconds).
**Fix.** Resize to `X-SMALL` and set `AUTO_SUSPEND = 60`. For very small loads, consider sharing one warehouse across multiple pipelines.

## Related

- **Use cases:** [PostgreSQL → Snowflake](/use-cases/postgresql-to-snowflake), [MongoDB → Snowflake](/use-cases/mongodb-to-snowflake), [HubSpot → Snowflake](/use-cases/hubspot-to-snowflake), [S3 → Snowflake](/use-cases/s3-to-snowflake)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** Snowflake-specific materializations and incremental strategies in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Snowflake connector spec](/connectors/snowflake)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
