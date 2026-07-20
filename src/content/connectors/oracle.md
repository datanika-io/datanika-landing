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

## Step 3 — Configure tables and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_oracle`.
3. Select the tables to sync. Oracle stores schema (owner) and table names in **UPPERCASE** by default — pick them from the discovered list rather than typing them.
4. For each table, choose a **Write disposition**:
   - `merge` — recommended for tables that change, using the primary key plus an **incremental cursor** (a monotonic `NUMBER` id or a `DATE`/`TIMESTAMP` like `LAST_UPDATED`).
   - `replace` — fine for small reference/lookup tables.
5. Save.

> **Tip.** Start with one or two tables to validate the flow end-to-end before enabling a wide sync. Very wide `NUMBER` columns without precision/scale land as high-precision decimals — cast them in a dbt staging model if your warehouse is strict.

## Step 4 — First run

1. Click **Run now** and watch the **Runs** tab.
2. When the run finishes, open **Catalog → `raw_oracle`** and browse the landed tables.
3. Spot-check: `SELECT count(*) FROM raw_oracle.orders` should match `SELECT count(*) FROM sales.orders` in Oracle.

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence — **hourly** for operational reporting, **every 6 hours** for finance dashboards, **daily at 03:00** for warehouse-wide batch loads.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications**.

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
