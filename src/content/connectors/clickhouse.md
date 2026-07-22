---
title: "Load Data into ClickHouse with Datanika"
description: "Step-by-step guide to set up ClickHouse as a destination in Datanika — create a database user, add the connection, configure a pipeline, run, and schedule."
source: "clickhouse"
source_name: "ClickHouse"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases:
  - "postgresql-to-clickhouse"
  - "stripe-to-clickhouse"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

ClickHouse is the fastest-growing analytics destination on Datanika — teams choose it for sub-second queries over billions of rows at a fraction of the cost of traditional cloud warehouses. This guide walks you end-to-end: create a dedicated database user in ClickHouse, wire it into Datanika as a destination, configure a pipeline from any source to ClickHouse, run the first load, and put it on a schedule.

> **ClickHouse is a destination, not a source.** In Datanika, ClickHouse receives data — it's where your raw tables land. To extract data *from* a source, you'll set up a source connection separately (e.g., [PostgreSQL](/docs/connectors/postgresql), [Stripe](/docs/connectors/stripe)). This guide covers the destination side.

> **Looking for the connector spec?** For the full field-by-field reference — supported engines, ordering keys, partitioning, load modes — see the [ClickHouse connector page](/connectors/clickhouse).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **ClickHouse instance** — self-hosted (single node or cluster) or ClickHouse Cloud. If you're starting from scratch: [clickhouse.com/cloud](https://clickhouse.com/cloud) for managed, or the [ClickHouse docs](https://clickhouse.com/docs/en/install) for self-hosted.
- A **source connection** already set up in Datanika (e.g., PostgreSQL, Stripe, CSV). ClickHouse is destination-only — you need something to pipe data *from*.
- **Database user** with permission to create tables and insert data in the target database. For ClickHouse Cloud, the default user works; for self-hosted, create a dedicated user (see Step 1).
- **Network reachability** from Datanika to your ClickHouse instance on the HTTP port (default `8443` for TLS, `8123` for plain HTTP). For ClickHouse Cloud, allowlist Datanika's egress IPs in the service's IP access list.

## Step 1 — Create a database user in ClickHouse

Create a **dedicated loader user** rather than reusing the `default` admin account. This keeps permissions auditable and revocable.

1. Connect to ClickHouse using `clickhouse-client` or the ClickHouse Cloud SQL console:
   ```bash
   clickhouse-client --host <host> --port 9440 --secure --user default
   ```
2. Create a dedicated database for raw data (if it doesn't exist):
   ```sql
   CREATE DATABASE IF NOT EXISTS raw_data;
   ```
3. Create a user with a strong password and grant the minimum permissions:
   ```sql
   CREATE USER datanika_loader IDENTIFIED BY '<generate-a-strong-one>';
   GRANT SELECT, INSERT, CREATE TABLE, ALTER TABLE, DROP TABLE
     ON raw_data.* TO datanika_loader;
   ```
4. If you plan to use multiple landing databases (e.g., `raw_postgres`, `raw_stripe`), repeat the `CREATE DATABASE` and `GRANT` statements for each.

> **Least privilege.** Datanika needs `CREATE TABLE` (first run), `INSERT` (every run), `ALTER TABLE` (schema evolution), and `DROP TABLE` (for `replace` mode). It does not need `SYSTEM`, `CLUSTER`, or access to other databases.

> **ClickHouse Cloud.** If you're using ClickHouse Cloud, the default user already has full permissions. You can skip user creation and use the credentials from your ClickHouse Cloud service page directly — but we still recommend creating a dedicated user for audit purposes.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `clickhouse`.
3. Fill in the form:
   - **Connection Name** — e.g. `clickhouse-prod` or `clickhouse-analytics`.
   - **Host** — the hostname, e.g. `abc123.clickhouse.cloud` or `clickhouse.internal`.
   - **Port** — `8443` (ClickHouse Cloud / TLS) or `8123` (self-hosted plain HTTP).
   - **User** — `datanika_loader` (or `default` for ClickHouse Cloud).
   - **Password** — the password from Step 1. Stored encrypted at rest with Fernet.
   - **Database** — the target database, e.g. `raw_data`.
   - **Use HTTPS (TLS)** — tick this for TLS/HTTPS endpoints (ClickHouse Cloud, or any instance on the secure `8443` port). Leave unchecked for plain HTTP on `8123`.
   - **Enable cluster replication** — tick this only if you're loading into a replicated ClickHouse cluster (`ON CLUSTER` DDL). Leave unchecked for single-node instances.
4. Click **Test Connection**. Datanika runs a `SELECT 1` to verify connectivity. You should see a green checkmark.
5. Click **Create Connection**.

> **ClickHouse Cloud / TLS.** For TLS endpoints (ClickHouse Cloud, or the secure `8443` port), tick **Use HTTPS (TLS)** in the form above. Self-hosted ClickHouse on the plain HTTP port `8123` works with the checkbox left unchecked.

![Adding ClickHouse as a destination in Datanika](/docs/connectors/clickhouse/02-add-connection.png)

> **Test connection fails?** Jump to [Troubleshooting](#troubleshooting) — most first-time failures are port mismatches (native vs HTTP) or missing IP allowlist entries.

## Step 3 — Use ClickHouse as a destination

A destination is chosen per **upload**, at **`/uploads`** — not on the connection, and not on a pipeline page. There is no "Configure pipeline" button; `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type) and an optional **Description**.
3. Pick the **Source connection** you want to read from, and set the **Destination connection** to the ClickHouse connection from Step 2. Each picker opens a dialog listing entries as `17 — mywarehouse (clickhouse)`, i.e. id, name, type.
4. **What else the form shows depends on the *source*, not on ClickHouse.** **Load Mode**, **Write Disposition**, **Source schema** and **Table names** appear only when the source is a SQL database; for a file, SaaS, MongoDB, Google Sheets, REST or Kafka source they are hidden and the load takes whatever shape the source produces. ClickHouse honours what it is handed either way.
5. Click **Create Upload**. It appears in the table below with status `draft`.

![The New Upload form with ClickHouse as the destination](/docs/connectors/clickhouse/03-configure-upload.png)

> **ClickHouse can also be a *source*.** Pick it as the **Source connection** instead and the SQL controls above apply to it — Load Mode, Write Disposition, Source schema and Table names all appear.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `eventsdailyload` creates schema `eventsdailyload` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `eventsdailyload`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `Test connection failed: Connection refused`
**Cause.** Wrong port. ClickHouse has two interfaces: native TCP (9000/9440) and HTTP (8123/8443). Datanika uses the HTTP interface.
**Fix.** Change the port to `8443` (ClickHouse Cloud / TLS) or `8123` (self-hosted plain HTTP). The native TCP port will refuse HTTP connections.

### `Test connection failed: Connection timed out`
**Cause.** Datanika can't reach the ClickHouse host — firewall, security group, or IP allowlist issue.
**Fix.** For ClickHouse Cloud: open the service settings and add Datanika's egress IPs to the IP access list (see [Self-hosting & network](/docs/self-hosting#egress-ips)). For self-hosted: check your firewall rules allow inbound on the HTTP port from Datanika's host.

### `Authentication failed for user 'datanika_loader'`
**Cause.** Wrong password, or the user doesn't exist on this ClickHouse instance.
**Fix.** Connect as admin and verify: `SELECT name FROM system.users;`. If the user exists, reset the password: `ALTER USER datanika_loader IDENTIFIED BY '<new>';`.

### `Table doesn't exist` on subsequent runs
**Cause.** Another process dropped the table between runs, or the database was recreated.
**Fix.** Datanika auto-creates tables on first run. If a table was manually dropped, just re-run — dlt will recreate it. For `replace` mode, dropping and recreating is the normal flow.

### Queries return duplicate rows after `merge` loads
**Cause.** ClickHouse's `ReplacingMergeTree` deduplicates rows during background merges, not at insert time. Until a merge runs, `SELECT` may return old and new versions of the same row.
**Fix.** Use `FINAL` in your queries: `SELECT * FROM table FINAL;` — this forces deduplication at read time. For dashboards, add `FINAL` to your BI tool's query template. Background merges typically complete within minutes, so this is a short window.

### Loads are slower than expected
**Cause.** ClickHouse Cloud may be auto-suspended (idle scaling). The first query after wake-up includes a cold-start delay of a few seconds.
**Fix.** No action needed — subsequent batches within the same run are fast. For time-sensitive SLAs, configure minimum idle timeout in ClickHouse Cloud settings to keep the service warm during expected load windows.

## Related

- **Use cases:** [PostgreSQL → ClickHouse](/use-cases/postgresql-to-clickhouse), [Stripe → ClickHouse](/use-cases/stripe-to-clickhouse)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** ClickHouse-specific materializations (table engines, ORDER BY keys) in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [ClickHouse connector spec](/connectors/clickhouse)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
