---
title: "Connect SQL Server (MSSQL) to Datanika"
description: "Step-by-step guide to use Microsoft SQL Server as a destination in Datanika — configure credentials, add the connection, set up pipelines to load data, and schedule."
source: "mssql"
source_name: "SQL Server"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Microsoft SQL Server is the warehouse of choice for many enterprise teams — especially those already running on the Microsoft stack (Azure, Power BI, SSRS). This guide walks you through adding SQL Server as a destination in Datanika so you can land data from any source (SaaS APIs, databases, files) into SQL Server tables for downstream analytics. Configure credentials, add the connection, build a pipeline, run, and schedule. Under 10 minutes if you already have a SQL Server instance running.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported data types, schema handling, bulk insert behavior — see the [SQL Server connector page](/connectors/mssql).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **SQL Server instance** accessible from Datanika's network (on-prem, Azure SQL, Amazon RDS for SQL Server, or a Docker container).
- A **database user** with `CREATE TABLE`, `INSERT`, `SELECT`, and `ALTER` permissions on the target database. Datanika needs write access because it's a **destination**.
- **Network access**: Datanika must be able to reach the SQL Server host on its configured port (default `1433`). If the instance is behind a firewall, allowlist Datanika's egress IPs or set up a VPN/tunnel.

## Step 1 — Prepare SQL Server credentials

Create a dedicated login for Datanika with only the permissions it needs.

1. Connect to your SQL Server instance using SSMS, Azure Data Studio, or `sqlcmd`.
2. Create a login and user:
   ```sql
   CREATE LOGIN datanika_writer WITH PASSWORD = '<strong-password>';
   USE <your_database>;
   CREATE USER datanika_writer FOR LOGIN datanika_writer;
   ```
3. Grant the minimum permissions:
   ```sql
   -- Schema-level permissions (replace 'dbo' with your target schema if different)
   GRANT CREATE TABLE TO datanika_writer;
   GRANT ALTER ON SCHEMA::dbo TO datanika_writer;
   GRANT INSERT ON SCHEMA::dbo TO datanika_writer;
   GRANT SELECT ON SCHEMA::dbo TO datanika_writer;
   ```
4. If you want Datanika to create its own schema (e.g., `raw_stripe`), also grant:
   ```sql
   GRANT CREATE SCHEMA TO datanika_writer;
   ```

> **Least privilege.** Don't grant `db_owner` or `sysadmin`. Datanika needs write access to the target schema only — not server-level or database-level admin.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **SQL Server**.
3. Fill in:
   - **Connection Name** — e.g. `mssql-analytics` or `sqlserver-prod`.
   - **SQL Server hostname** — the hostname or IP address, e.g. `sql.example.com` or `10.0.1.50`. For Azure SQL, use `<server>.database.windows.net`.
   - **Port number** — default `1433`. Change only if your instance uses a non-standard port or named instances.
   - **Database name** — the target database, e.g. `analytics` or `datawarehouse`.
   - **Username** — `datanika_writer` (from Step 1).
   - **Password** — the password for the login. Stored encrypted at rest with Fernet.
4. Click **Test Connection**. You should see a green success message.
5. Click **Create Connection**.

![Adding SQL Server in Datanika](/docs/connectors/mssql/02-add-connection.png)

## Step 3 — Use SQL Server as a pipeline destination

SQL Server is a **destination** — you select it when configuring a pipeline's target, not as a source.

1. Open or create a pipeline from any source (e.g., Stripe, PostgreSQL, CSV).
2. In **Configure pipeline**, pick the SQL Server connection as the **destination**.
3. Choose a **target schema** — e.g., `raw_stripe`. If the schema doesn't exist, Datanika creates it (requires `CREATE SCHEMA` permission).
4. Configure write dispositions per table as usual (`replace`, `append`, or `merge`).
5. Save.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Load performance depends on the source data volume and SQL Server's throughput — a 100k-row initial load typically finishes in under a minute.
3. Common first-run failures:
   - `Login failed for user` — wrong username or password.
   - `Cannot open database` — wrong database name, or the user doesn't have access to the specified database.
   - `A network-related or instance-specific error` — SQL Server is unreachable. Check host, port, and firewall rules.
4. When finished, query the landed tables directly in SQL Server or use Datanika's **SQL Editor** / **Data Catalog**.

![First run to SQL Server](/docs/connectors/mssql/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence based on how fresh you need the data in SQL Server:
   - **Hourly** — operational dashboards, Power BI DirectQuery.
   - **Every 6 hours** — standard reporting.
   - **Daily at 03:00** — batch warehouse loads.
3. Choose a **timezone** and save.

## Troubleshooting

### `Login failed for user 'datanika_writer'`
**Cause.** Wrong password, the login is disabled, or SQL Server authentication mode is set to "Windows only."
**Fix.** Verify the password. Ensure SQL Server is configured for **SQL Server and Windows Authentication mode** (mixed mode) in Server Properties → Security.

### `Cannot open database '<name>' requested by the login`
**Cause.** The database name is wrong, or the user doesn't have a mapping in that database.
**Fix.** Double-check the database name. Run `USE <database>; CREATE USER datanika_writer FOR LOGIN datanika_writer;` if the user mapping is missing.

### `A network-related or instance-specific error`
**Cause.** SQL Server is unreachable — wrong host/port, firewall blocking, or the SQL Server Browser service isn't running (for named instances).
**Fix.** Test connectivity with `telnet <host> 1433` or `Test-NetConnection -ComputerName <host> -Port 1433`. For Azure SQL, ensure the client IP is in the server's firewall rules.

### `CREATE TABLE permission denied`
**Cause.** The database user doesn't have `CREATE TABLE` permission.
**Fix.** Grant: `GRANT CREATE TABLE TO datanika_writer;`. See Step 1.

### Bulk insert is slow
**Cause.** SQL Server's default transaction isolation and logging can slow down large inserts.
**Fix.** Ensure the target database is in **Simple** recovery model for the initial load, or use a dedicated filegroup with minimal logging. Switch back to Full after the backfill if needed.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** staging models for SQL Server in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [SQL Server connector spec](/connectors/mssql)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
