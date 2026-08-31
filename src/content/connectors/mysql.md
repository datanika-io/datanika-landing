---
title: "Connect MySQL to Datanika"
description: "Step-by-step guide to sync MySQL with Datanika — create a read-only user, add the connection, pick tables, run, and schedule."
source: "mysql"
source_name: "MySQL"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-18"
related_use_cases:
  - "mysql-to-bigquery"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

MySQL is one of the most common operational databases our users sync into their warehouse. It works as both a source (extract data from MySQL) and a load destination (land data into MySQL). This guide covers the most common use case: extracting data from MySQL into a cloud warehouse.

> **MySQL works as a source and as a load destination.** Datanika auto-detects the direction. This guide focuses on MySQL as a *source*. To load data *into* MySQL, the same connection works — pick it as the **Destination connection** on an upload at `/uploads` (Step 3 below).

> **MySQL is not a transformation target.** `/pipelines` and `/transformations` run [dbt](https://www.getdbt.com), and no maintained dbt adapter for MySQL exists — the only one ever published was last released in April 2024 and pins dbt-core 1.7. So you can extract *from* MySQL and land data *in* MySQL, but you cannot run dbt models, tests or snapshots *against* a MySQL database. Transform in a warehouse instead: PostgreSQL, SQL Server, ClickHouse, DuckDB, BigQuery, Snowflake and Redshift are all [supported dbt targets](/docs/transformations).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika (BigQuery, Snowflake, PostgreSQL, etc.).
- **MySQL 5.7+** with network reachability from Datanika.
- Access to MySQL with permission to `CREATE USER` and `GRANT`.

## Step 1 — Create credentials in MySQL

1. Connect to MySQL as a superuser: `mysql -h <host> -u root -p`.
2. Create a dedicated read-only user:
   ```sql
   CREATE USER 'datanika_readonly'@'%' IDENTIFIED BY '<strong-password>';
   GRANT SELECT ON <database>.* TO 'datanika_readonly'@'%';
   FLUSH PRIVILEGES;
   ```
3. For future tables: `GRANT SELECT` applies only to existing tables. To cover tables created later, re-run the grant periodically or use a stored procedure.
4. Copy the host, port, username, password, and database name.

> **Least privilege.** Only grant `SELECT`. Datanika never needs write access to the source.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `mysql`.
3. Fill in the form:
   - **Connection Name** — a label you'll recognize later, e.g. `mysql-prod-readonly`.
   - **Host** — the hostname or IP of your MySQL server.
   - **Port** — usually `3306`.
   - **Database** — the database you granted access to in Step 1.
   - **User** — `datanika_readonly`.
   - **Password** — the password from Step 1. Stored encrypted at rest with Fernet.
4. Click **Test Connection**. You should see a green ✅ within a few seconds.
5. Click **Create Connection**.

![Adding MySQL in Datanika](/docs/connectors/mysql/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `orders-daily-sync` becomes `ordersdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the MySQL connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because the source is a SQL database, you also get:
   - **Load Mode** — `full_database` (the default) or `single_table`.
   - **Write Disposition** — `append` (the default), `replace`, or `merge`.
   - **Source schema** *(optional)* — In MySQL a *schema* and a *database* are the same thing, so leave **Source schema** blank unless you want to read from a database other than the one on the connection.
   - **Table names** *(optional, comma-separated)* — restrict the sync to specific tables. Blank means every table the role can read.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **These four controls exist only because the source is a SQL database.** They are hidden for every non-SQL source — files, SaaS APIs, MongoDB, Google Sheets, REST and Kafka.

> **Tip.** Start with one or two small tables via **Table names** to validate the flow end-to-end before syncing everything. A failed 8-hour run is much more expensive to debug than a failed 30-second one.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `ordersdailysync` creates schema `ordersdailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `ordersdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `Access denied for user 'datanika_readonly'`
**Fix.** Re-run the `GRANT SELECT` statement and `FLUSH PRIVILEGES`.

### Connection test times out
**Fix.** Check firewall rules and MySQL's `bind-address` config. Ensure Datanika's IP can reach the MySQL host on port 3306.

## Related

- **Use cases:** [MySQL → BigQuery](/use-cases/mysql-to-bigquery)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** [Transformations guide](/docs/transformations-guide) — for models you build in the warehouse you loaded into, not in MySQL itself
- **Connector reference:** [MySQL connector spec](/connectors/mysql)
