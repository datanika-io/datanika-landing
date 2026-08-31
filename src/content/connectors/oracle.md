---
title: "Connect Oracle to Datanika"
description: "Step-by-step guide to sync Oracle Database with Datanika — create a read-only user, add the connection, pick tables, run, and schedule."
source: "oracle"
source_name: "Oracle"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Oracle Database is the system of record for a huge share of enterprise ERP, finance, and back-office workloads. This guide extracts Oracle tables into a cloud warehouse (BigQuery, Snowflake, PostgreSQL, etc.) so you can build analytics without hammering the production OLTP box or buying a heavyweight replication tool. Create a read-only user, wire it into Datanika, pick tables, run, and schedule.

> **Looking for the connector spec?** This is the hands-on setup guide. For the field-by-field reference — connection identifiers, incremental cursors, supported versions — see the [Oracle connector page](/connectors/oracle).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Oracle is used here as a **source**.
- **Oracle Database 12c (12.1) or newer** reachable from Datanika over the network (the `oracledb` thin driver used by Datanika requires 12.1+).
- A database account with `CREATE USER` / `GRANT` privileges to provision the read-only user in Step 1.
- Your **connection identifier**: host, port (default `1521`), and the **service name** of the database you're syncing — a pluggable database (PDB) like `XEPDB1`, or a RAC / Autonomous service. Datanika connects **by service name by default**; there's a **Connect by SID** toggle for legacy single-instance databases (see Step 2).

## Step 1 — Create a read-only user in Oracle

Datanika's Oracle source uses the `oracledb` thin driver, so no Oracle Instant Client is required on either side. Connect as a privileged user (e.g. via SQL*Plus or SQLcl) and create a dedicated read-only account:

```sql
-- In 12c+ connect to the target PDB first, e.g.:  ALTER SESSION SET CONTAINER = your_pdb;
CREATE USER datanika_readonly IDENTIFIED BY "<strong-password>";
GRANT CREATE SESSION TO datanika_readonly;

-- Grant SELECT on the specific tables you plan to sync (least privilege):
GRANT SELECT ON sales.orders     TO datanika_readonly;
GRANT SELECT ON sales.customers  TO datanika_readonly;
-- ...or, if you accept broader read access:
-- GRANT SELECT ANY TABLE TO datanika_readonly;
```

Copy the host, port, service name, username, and password.

> **Least privilege.** Only grant `SELECT`. Datanika never needs write access to the source. `GRANT SELECT` covers existing tables only — re-run it when you add tables to the sync, or use `SELECT ANY TABLE` if you'd rather not maintain the list.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is rendered inline on the page.
2. From the **type dropdown**, pick **`oracle`**.
3. Fill in:
   - **Connection Name** — a label for this connection, e.g. `oracleerp`.
   - **Host** — your Oracle host.
   - **Port** — the listener port (auto-fills to `1521` when you pick Oracle).
   - **User / Password** — the `datanika_readonly` account. The password is stored encrypted at rest with Fernet.
   - **Database** — the Oracle **service name** from Step 1 (e.g. `ORCLPDB1` for a pluggable database, or your RAC / Autonomous service).
   - **Connect by SID (legacy single-instance)** — leave this **unchecked** for service-name connections (the default). Only tick it if your database is a legacy single-instance addressed by SID (see the note below).
4. Click **Test Connection** — for a reachable database you'll see a success message.
5. Click **Create Connection**.

> **Datanika connects to Oracle by service name by default.** The **Database** field is your Oracle **service name** — pluggable databases (PDBs), RAC, and Autonomous all work. For a **legacy single-instance** database addressed by SID, tick **Connect by SID (legacy single-instance)** and put the SID in the **Database** field instead.

![Adding Oracle in Datanika](/docs/connectors/oracle/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `finance-daily-sync` becomes `financedailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Oracle connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because the source is a SQL database, you also get:
   - **Load Mode** — `full_database` (the default) or `single_table`.
   - **Write Disposition** — `append` (the default), `replace`, or `merge`.
   - **Source schema** *(optional)* — Set **Source schema** to the schema owner, which Oracle stores **upper-case** (e.g. `HR`). Table names are upper-cased for you.
   - **Table names** *(optional, comma-separated)* — restrict the sync to specific tables. Blank means every table the role can read.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **These four controls exist only because the source is a SQL database.** They are hidden for every non-SQL source — files, SaaS APIs, MongoDB, Google Sheets, REST and Kafka.

> **Tip.** Start with one or two small tables via **Table names** to validate the flow end-to-end before syncing everything. A failed 8-hour run is much more expensive to debug than a failed 30-second one.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `financedailysync` creates schema `financedailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `financedailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `ORA-12505: TNS:listener does not currently know of SID given in connect descriptor`
**Cause.** **Connect by SID** is ticked, but the value in the **Database** field isn't a SID the listener recognizes — commonly because the database is actually reached by a *service name* (most 12c+ PDBs, RAC, and Autonomous only expose a service name).
**Fix.** Untick **Connect by SID** and put the **service name** in the **Database** field — the default path, which covers PDBs, RAC, and Autonomous. List available services with `lsnrctl status` or `SELECT name FROM v$services;`. Only use **Connect by SID** (with the SID from `SELECT instance_name FROM v$instance;`) for legacy single-instance databases.

### `ORA-01017: invalid username/password; logon denied`
**Cause.** Wrong credentials, or the user was created in a different container/PDB than the one you're connecting to.
**Fix.** Verify the username/password and that the `datanika_readonly` user exists in the target PDB (re-run Step 1 inside `ALTER SESSION SET CONTAINER`).

### `ORA-00942: table or view does not exist`
**Cause.** The read-only user hasn't been granted `SELECT` on that table, or the owner/schema prefix is wrong.
**Fix.** Re-run `GRANT SELECT ON <owner>.<table> TO datanika_readonly;`. Remember Oracle identifiers are uppercase unless they were created quoted.

### Connection test fails with `ORA-12541: TNS:no listener` or a timeout
**Cause.** Datanika can't reach the Oracle listener — firewall, wrong port, or the listener isn't running.
**Fix.** Confirm port `1521` (or your custom port) is open from Datanika's egress and that the listener is up (`lsnrctl status`).

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** model `raw_oracle` into clean staging tables — see the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Oracle connector spec](/connectors/oracle)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
