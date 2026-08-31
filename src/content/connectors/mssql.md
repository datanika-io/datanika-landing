---
title: "Connect SQL Server (MSSQL) to Datanika"
description: "Step-by-step guide to use Microsoft SQL Server as a source or destination in Datanika — extract data from SQL Server into your warehouse, or load data into SQL Server tables."
source: "mssql"
source_name: "SQL Server"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-18"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Microsoft SQL Server works as both a **source** (extract data from SQL Server into your warehouse) and a **destination** (load data from any source into SQL Server). Datanika auto-detects the direction based on how you use the connection in your pipeline. This guide covers both — source first, then destination.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported versions, data types, schema handling — see the [SQL Server connector page](/connectors/mssql).

---

## Part A — SQL Server as a Source

Extract data from SQL Server into a cloud warehouse (BigQuery, Snowflake, PostgreSQL, ClickHouse, etc.) or a local destination (DuckDB, CSV).

### Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. If you don't have one yet, follow the [Getting Started guide](/docs/getting-started) first.
- **SQL Server 2016 or newer** (or Azure SQL Database, Amazon RDS for SQL Server, Azure SQL Managed Instance).
- Access to SQL Server as a user that can `CREATE LOGIN` and `GRANT SELECT` — usually a DBA or the `sysadmin` login.
- **Network reachability** from Datanika to your SQL Server host on port `1433`. For Datanika Cloud, expose the instance on a public endpoint with TLS, or allowlist Datanika's egress IPs. Self-hosted Datanika just needs the container to reach the host.

### Step 1 — Create credentials in SQL Server

Create a **dedicated read-only login** rather than reusing an existing account. This keeps blast radius low and makes audit logs readable.

1. Connect to your SQL Server instance using SSMS, Azure Data Studio, or `sqlcmd`.
2. Create a login and database user:
   ```sql
   CREATE LOGIN datanika_readonly WITH PASSWORD = '<strong-password>';
   USE <your_database>;
   CREATE USER datanika_readonly FOR LOGIN datanika_readonly;
   ```
3. Grant the minimum privileges needed to read data:
   ```sql
   GRANT SELECT ON SCHEMA::dbo TO datanika_readonly;
   ```
   Repeat for any additional schemas you want to sync (e.g., `GRANT SELECT ON SCHEMA::sales TO datanika_readonly;`).
4. If you want Datanika to introspect table metadata (recommended for auto-discovery):
   ```sql
   GRANT VIEW DEFINITION ON SCHEMA::dbo TO datanika_readonly;
   ```

> **Least privilege.** Datanika never needs `INSERT`, `UPDATE`, `DELETE`, or DDL on your source. If you're asked for higher privileges, something is wrong.

> **Windows Authentication caveat.** Datanika connects via `pymssql` which uses SQL Server Authentication (username + password). Windows Authentication / Integrated Security is not supported. Make sure your SQL Server instance has **Mixed Mode authentication** enabled (Server Properties → Security → SQL Server and Windows Authentication mode).

### Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page.
2. From the **type dropdown** at the top, pick `mssql`.
3. Fill in:
   - **Connection Name** — e.g. `mssql-erp-readonly` or `sqlserver-prod`.
   - **Host** — the hostname or IP address. For Azure SQL, use `<server>.database.windows.net`.
   - **Port** — default `1433`. Change only if your instance uses a non-standard port.
   - **Database** — the database to extract from, e.g. `erp_prod` or `sales`.
   - **User** — `datanika_readonly` (from Step 1).
   - **Password** — the password for the login. Stored encrypted at rest with Fernet.
4. Click **Test Connection**. You should see a green success message.
5. Click **Create Connection**.

![Adding SQL Server in Datanika](/docs/connectors/mssql/02-add-connection.png)

> **TrustServerCertificate.** If your SQL Server uses a self-signed certificate and the connection test fails with a TLS/SSL error, the instance may require `TrustServerCertificate=yes` in the connection string. Datanika handles this automatically via `pymssql` defaults. If you still see errors, check that the SQL Server instance's TLS certificate is valid or that the `encrypt` setting matches your environment.

### Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `sales-daily-sync` becomes `salesdailysync`) and an optional **Description**.
3. Pick the **Source connection** — the SQL Server connection from Step 2 — and the **Destination connection**. Each picker opens a dialog listing entries as `16 — myconnection (mssql)`, i.e. id, name, type.
4. Because the source is a SQL database, you also get:
   - **Load Mode** — `full_database` (the default) or `single_table`.
   - **Write Disposition** — `append` (the default), `replace`, or `merge`.
   - **Source schema** *(optional)* — set it to the owning schema, `dbo` unless you have moved things.
   - **Table names** *(optional, comma-separated)* — restrict the sync to specific tables. Blank means every table the login can read.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **These four controls exist only because the source is a SQL database.** They are hidden for every non-SQL source — files, SaaS APIs, MongoDB, Google Sheets, REST and Kafka.

> **Tip.** Start with one or two small tables via **Table names** to validate the flow end-to-end before syncing everything. A failed 8-hour run is much more expensive to debug than a failed 30-second one.

### Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `salesdailysync` creates schema `salesdailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source (`SELECT COUNT(*) FROM <schema>.<table>`). **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

### Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `salesdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly for operational dashboards and Power BI DirectQuery, `0 */6 * * *` for standard reporting, `0 3 * * *` for batch warehouse loads.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

---

## Part B — SQL Server as a Destination

Load data from any source (SaaS APIs, other databases, files) into SQL Server tables.

> **Same connection, different direction.** The connection you created in Part A works as a destination too. You just select it as the **Destination connection** on an upload. If you're only using SQL Server as a destination, create the connection with a **write-capable** login instead.

### Destination-specific credentials

If your SQL Server connection is for destination use only, the login needs write permissions:

```sql
CREATE LOGIN datanika_writer WITH PASSWORD = '<strong-password>';
USE <your_database>;
CREATE USER datanika_writer FOR LOGIN datanika_writer;
GRANT CREATE TABLE TO datanika_writer;
GRANT ALTER ON SCHEMA::dbo TO datanika_writer;
GRANT INSERT ON SCHEMA::dbo TO datanika_writer;
GRANT SELECT ON SCHEMA::dbo TO datanika_writer;
-- If you want Datanika to create its own schema:
GRANT CREATE SCHEMA TO datanika_writer;
```

### Using SQL Server as a destination

1. Open **`/uploads`** and fill in the **New Upload** form, picking any source (e.g. Stripe, PostgreSQL, CSV).
2. Set the **Destination connection** to the SQL Server connection.
3. **You do not choose a target schema.** The upload lands in a schema **named after the upload** — an upload called `stripedailysync` creates schema `stripedailysync`. Datanika creates it if it doesn't exist, which is why the login needs `CREATE SCHEMA`.
4. **Write Disposition** is a single form-level dropdown (`append` / `replace` / `merge`), not a per-table setting — and it appears **only when the source is a SQL database**. For a SaaS, file, MongoDB, Google Sheets, REST or Kafka source it is hidden, and the load takes whatever shape the source produces. SQL Server honours what it is handed either way.
5. Run and schedule as described in Steps 4–5 above.

---

## Troubleshooting

### `Login failed for user`
**Cause.** Wrong password, the login is disabled, or SQL Server authentication mode is set to "Windows only."
**Fix.** Verify the password. Ensure SQL Server is configured for **SQL Server and Windows Authentication mode** (mixed mode) in Server Properties → Security.

### `Cannot open database '<name>' requested by the login`
**Cause.** The database name is wrong, or the user doesn't have a mapping in that database.
**Fix.** Double-check the database name. Run `USE <database>; CREATE USER <user> FOR LOGIN <user>;` if the user mapping is missing.

### `A network-related or instance-specific error`
**Cause.** SQL Server is unreachable — wrong host/port, firewall blocking, or the SQL Server Browser service isn't running (for named instances).
**Fix.** Test connectivity with `telnet <host> 1433` or `Test-NetConnection -ComputerName <host> -Port 1433`. For Azure SQL, ensure the client IP is in the server's firewall rules.

### Connection test times out
**Cause.** Datanika uses `login_timeout=5` for SQL Server connections. If the server doesn't respond within 5 seconds, the test fails.
**Fix.** Check network latency. For Azure SQL, ensure the server's firewall allows connections from your Datanika instance's IP.

### `permission denied for table <name>`
**Cause.** The login doesn't have `SELECT` (source) or `INSERT`/`CREATE TABLE` (destination) permission.
**Fix.** Grant the appropriate permissions — see Step 1 (source) or Destination-specific credentials above.

### Collation mismatch errors
**Cause.** Source tables use different collations (e.g., `Latin1_General_CI_AS` vs `SQL_Latin1_General_CP1_CI_AS`). This can cause comparison and join errors in the destination.
**Fix.** This is a SQL Server-specific issue. Most destination warehouses (BigQuery, Snowflake, PostgreSQL) handle string data without collation constraints. If loading into another SQL Server, ensure the target database collation matches the source, or use `COLLATE DATABASE_DEFAULT` in downstream queries.

### `rowversion` / `timestamp` columns
**Cause.** SQL Server's `rowversion` (formerly `timestamp`) columns are auto-generated binary values that change on every row update. They're useful as incremental cursors but cannot be used as primary keys.
**Fix.** Use `rowversion` as the **incremental cursor** in merge mode, but set a different column (e.g., the actual `INT` primary key) as the **primary key** for upsert logic.

### Bulk insert is slow (destination)
**Cause.** SQL Server's default transaction isolation and logging can slow down large inserts.
**Fix.** Ensure the target database is in **Simple** recovery model for the initial load, or use a dedicated filegroup with minimal logging. Switch back to Full after the backfill if needed.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** staging models for SQL Server in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [SQL Server connector spec](/connectors/mssql)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
