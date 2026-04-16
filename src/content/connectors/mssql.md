---
title: "Connect SQL Server (MSSQL) to Datanika"
description: "Step-by-step guide to use Microsoft SQL Server as a source or destination in Datanika — extract data from SQL Server into your warehouse, or load data into SQL Server tables."
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

![Creating the read-only login in SSMS](/docs/connectors/mssql/01-credentials.png)

### Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page.
2. From the **type dropdown** at the top, pick **SQL Server**.
3. Fill in:
   - **Connection Name** — e.g. `mssql-erp-readonly` or `sqlserver-prod`.
   - **SQL Server hostname** — the hostname or IP address. For Azure SQL, use `<server>.database.windows.net`.
   - **Port number** — default `1433`. Change only if your instance uses a non-standard port.
   - **Database name** — the database to extract from, e.g. `erp_prod` or `sales`.
   - **Username** — `datanika_readonly` (from Step 1).
   - **Password** — the password for the login. Stored encrypted at rest with Fernet.
4. Click **Test Connection**. You should see a green success message.
5. Click **Create Connection**.

![Adding SQL Server in Datanika](/docs/connectors/mssql/02-add-connection.png)

> **TrustServerCertificate.** If your SQL Server uses a self-signed certificate and the connection test fails with a TLS/SSL error, the instance may require `TrustServerCertificate=yes` in the connection string. Datanika handles this automatically via `pymssql` defaults. If you still see errors, check that the SQL Server instance's TLS certificate is valid or that the `encrypt` setting matches your environment.

### Step 3 — Configure tables and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_mssql` so it's obvious where the data came from.
3. Datanika introspects the source and shows every table you have `SELECT` on. For each table:
   - **Write disposition**
     - `replace` — drops and reloads the target table on every run. Safe and simple; fine for small lookup tables.
     - `merge` — upserts changed rows into the target. The right choice for anything that grows over time.
   - **Primary key** — required for `merge`. Datanika auto-detects it from SQL Server metadata; override if needed.
   - **Incremental cursor** — a column that only ever increases. `updated_at` is the canonical choice; an `IDENTITY` column works for append-only tables. Without a cursor, `merge` still works but every run is a full scan.
4. Save the pipeline configuration.

> **Tip.** Start with 1–2 small tables to validate end-to-end before enabling the full sync.

![Selecting tables and load modes](/docs/connectors/mssql/03-configure-tables.png)

### Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. You'll see per-table row counts stream in as dlt extracts and loads each one.
3. A typical first run takes minutes for small OLTP databases and hours for databases in the hundreds of GB. Subsequent incremental runs are much faster.
4. When the run finishes, open **Catalog → `<your warehouse>` → `raw_mssql`** and browse the landed tables.
5. Spot-check row counts against the source: `SELECT COUNT(*) FROM <schema>.<table>` on both sides should match.

![First source run from SQL Server](/docs/connectors/mssql/04-first-run.png)

### Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence:
   - **Hourly** — operational dashboards, Power BI DirectQuery.
   - **Every 6 hours** — standard reporting.
   - **Daily at 03:00** — batch warehouse loads.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

![Configuring the schedule](/docs/connectors/mssql/05-schedule.png)

---

## Part B — SQL Server as a Destination

Load data from any source (SaaS APIs, other databases, files) into SQL Server tables.

> **Same connection, different direction.** The connection you created in Part A works as a destination too. You just select it as the **destination** when configuring a pipeline. If you're only using SQL Server as a destination, create the connection with a **write-capable** login instead.

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

1. Open or create a pipeline from any source (e.g., Stripe, PostgreSQL, CSV).
2. In **Configure pipeline**, pick the SQL Server connection as the **destination**.
3. Choose a **target schema** — e.g., `raw_stripe`. If the schema doesn't exist, Datanika creates it (requires `CREATE SCHEMA` permission).
4. Configure write dispositions per table (`replace`, `append`, or `merge`).
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
