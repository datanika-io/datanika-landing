---
title: "Load Data into ClickHouse with Datanika"
description: "Step-by-step guide to set up ClickHouse as a destination in Datanika — create a database user, add the connection, configure a pipeline, run, and schedule."
source: "clickhouse"
source_name: "ClickHouse"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating the loader user in ClickHouse](/docs/connectors/clickhouse/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **Connections → New connection**.
2. Pick **ClickHouse** from the connector list.
3. Fill in the form:
   - **Name** — e.g. `clickhouse-prod` or `clickhouse-analytics`.
   - **Host** — the hostname, e.g. `abc123.clickhouse.cloud` or `clickhouse.internal`.
   - **Port** — `8443` (ClickHouse Cloud / TLS) or `8123` (self-hosted plain HTTP).
   - **Database** — the target database, e.g. `raw_data`.
   - **User** — `datanika_loader` (or `default` for ClickHouse Cloud).
   - **Password** — the password from Step 1. Stored encrypted at rest with Fernet.
   - **Secure** — enable for ClickHouse Cloud and any TLS-enabled instance. Disable only for local dev.
4. Click **Test connection**. Datanika runs a `SELECT 1` to verify connectivity. You should see a green checkmark.
5. Click **Save**.

![Adding ClickHouse as a destination in Datanika](/docs/connectors/clickhouse/02-add-connection.png)

> **Test connection fails?** Jump to [Troubleshooting](#troubleshooting) — most first-time failures are port mismatches (native vs HTTP) or missing IP allowlist entries.

## Step 3 — Configure a pipeline to ClickHouse

1. Open the **source connection** you want to pipe data from and click **Configure pipeline**.
2. Pick **ClickHouse** as the destination warehouse.
3. Choose a **target database**. We recommend a name that reflects the source — e.g. `raw_postgres`, `raw_stripe` — so it's obvious where the data came from.
4. Select the tables/endpoints to sync from the source. For each:
   - **Write disposition** — `replace` (full refresh) or `merge` (incremental upsert).
   - **Primary key** — required for `merge`. Maps to ClickHouse's `ORDER BY` key.
   - **Incremental cursor** — a monotonically increasing column (e.g. `updated_at`).
5. Save the pipeline configuration.

> **Tip.** ClickHouse is optimized for append-heavy workloads. For large tables, `merge` with an incremental cursor is the right choice — dlt uses ClickHouse's `ReplacingMergeTree` engine under the hood for deduplication, and appends are extremely fast.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. dlt inserts data via ClickHouse's HTTP interface in batches — expect high throughput even on moderate hardware.
3. When the run finishes, open **Catalog → ClickHouse → `raw_<source>`** to browse the landed tables.
4. Spot-check in the ClickHouse console: `SELECT count() FROM raw_postgres.orders;` should match the row count Datanika reports.
5. Verify the table engine: `SHOW CREATE TABLE raw_postgres.orders;` — you should see `ReplacingMergeTree` for tables using `merge` mode.

![First run landing data in ClickHouse](/docs/connectors/clickhouse/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence:
   - **Hourly** — real-time analytics dashboards, event stream aggregation.
   - **Every 6 hours** — standard reporting, product analytics.
   - **Daily at 03:00** — batch warehouse refresh.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications** so broken runs surface before dashboards go stale.

> **Cost tip.** ClickHouse Cloud charges per compute-second. Batch your loads into fewer, larger runs rather than many small ones. A single hourly run loading 100K rows is cheaper than 60 runs loading 1.7K rows each — the per-query overhead adds up.

![Configuring the schedule](/docs/connectors/clickhouse/05-schedule.png)

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
