---
title: "Connect PostgreSQL to Datanika"
description: "Step-by-step guide to sync PostgreSQL into your warehouse with Datanika — create a read-only role, add the connection, pick tables, run, and schedule."
source: "postgresql"
source_name: "PostgreSQL"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-22"
related_use_cases:
  - "postgresql-to-bigquery"
  - "postgresql-to-snowflake"
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

PostgreSQL is the most common operational database our users sync into their warehouse. This guide walks you end-to-end through creating a dedicated read-only Postgres role, wiring it into Datanika, selecting tables, running your first sync, and putting it on a schedule. Expect 10–15 minutes for a first run against a small database.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported versions, SSL modes, replication slot support, load modes — see the [PostgreSQL connector page](/connectors/postgresql).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role in the target organization).
- A **destination warehouse** already connected in Datanika. If you don't have one yet, follow the [Getting Started guide](/docs/getting-started) first. PostgreSQL-as-destination, BigQuery, Snowflake, Redshift, ClickHouse, and DuckDB are all supported targets for this source.
- **PostgreSQL 12 or newer**. Older versions mostly work but are not covered by our integration tests.
- Access to the source Postgres as a user that can `CREATE ROLE` and `GRANT` on the schemas you want to sync — usually a DBA or the database owner.
- **Network reachability** from Datanika to your Postgres host. For Datanika Cloud, that means either exposing your database on a public endpoint with TLS, or allowlisting our egress IPs (see [Self-hosting & network](/docs/self-hosting#egress-ips)). Self-hosted Datanika just needs the container to be able to reach the host.

## Step 1 — Create credentials in PostgreSQL

Create a **dedicated read-only role** rather than reusing an existing login. This keeps blast radius low, makes audit logs readable, and lets you revoke access in one statement.

1. Connect to PostgreSQL as a superuser (or the database owner): `psql -h <host> -U postgres -d <database>`.
2. Create the role and set a strong password:
   ```sql
   CREATE ROLE datanika_readonly LOGIN PASSWORD '<generate-a-strong-one>';
   ```
3. Grant the minimum privileges needed to read data:
   ```sql
   GRANT CONNECT ON DATABASE <database> TO datanika_readonly;
   GRANT USAGE ON SCHEMA public TO datanika_readonly;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO datanika_readonly;
   ```
   Repeat the `USAGE` and `SELECT` grants for any additional schemas you plan to sync.
4. Make sure future tables created in those schemas are also readable:
   ```sql
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT ON TABLES TO datanika_readonly;
   ```
5. If your `pg_hba.conf` restricts by user or host, add a rule that lets `datanika_readonly` connect from Datanika's IP range over `hostssl`.

> **Least privilege.** Datanika never needs `INSERT`, `UPDATE`, `DELETE`, or DDL on your source. If you're asked for a password with higher privileges, something is wrong — [open a support ticket](mailto:support@datanika.io) before granting it.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `postgres`.
3. Fill in the form:
   - **Connection Name** — a label you'll recognize later, e.g. `postgres-prod-readonly`.
   - **Host** — the hostname or IP of your Postgres server.
   - **Port** — usually `5432`.
   - **Database** — the database name you granted access to in Step 1.
   - **User** — `datanika_readonly`.
   - **Password** — the password from Step 1. Stored encrypted at rest with Fernet.
4. Click **Test connection**. You should see a green ✅ within a few seconds.
5. Click **Create Connection**.

![Filling in the PostgreSQL connection form](/docs/connectors/postgresql/02-add-connection.png)

> **Test connection fails?** Jump to [Troubleshooting](#troubleshooting) — 90% of first-run failures are a missing `pg_hba.conf` rule, a firewall, or a TLS/SSL handshake issue on the Postgres side.

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `customer-orders-sync` becomes `customerorderssync`) and an optional **Description**.
3. Pick the **Source connection** — the Postgres connection from Step 2 — and the **Destination connection**. Each picker opens a dialog listing entries as `16 — docssamplesdb (postgres)`, i.e. id, name, type.
4. Because the source is a SQL database, you also get:
   - **Load Mode** — `full_database` (the default) or `single_table`.
   - **Write Disposition** — `append` (the default), `replace`, or `merge`.
   - **Source schema** *(optional)* — e.g. `public`. Leave blank to use the connection's default.
   - **Table names** *(optional, comma-separated)* — restrict the sync to specific tables. Blank means every table the role can `SELECT`.
   - **Batch size** *(optional, default 10000)*.
   - **Schema Contract** *(optional)* — **Tables** / **Columns** / **Data Type** dropdowns controlling whether a changed incoming shape evolves the destination or fails the run.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **These controls exist only because the source is a SQL database.** Load Mode, Write Disposition, Source schema and Table names are hidden for every non-SQL source — files, SaaS APIs, MongoDB, Google Sheets, REST and Kafka. If you're following this guide with a file source, that section of the form will not be there.

> **Tip.** Start with 1–2 small tables via **Table names** to validate the flow end-to-end before syncing everything. A failed 8-hour run is much more expensive to debug than a failed 30-second one.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. (There is no "Run now" on a pipeline page — the button lives on the upload's own row.)
2. Watch **`/runs`**. The run appears with a status badge, start and finish timestamps, and a **Rows** count; the **Logs** icon on the row opens the detail.

![A completed first run in Datanika's run history](/docs/connectors/postgresql/04-first-run.png)

3. A typical first run takes seconds for a small database and hours for one in the hundreds of GB. Subsequent incremental runs are much faster because only new/changed rows move.
4. When the run finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema named after the upload — an upload called `customerorderssync` creates schema `customerorderssync` in the destination, alongside dlt's own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables.
5. Spot-check row counts against the source: `SELECT count(*) FROM <schema>.<table>;` on both sides should match (or differ by exactly the rows written during the sync window for incremental loads). **Check this rather than trusting the status badge** — the Rows figure counts everything the run moved across all tables, so one number covers the whole sync.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `customerorderssync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker, and no "manual only" option: leaving the upload unscheduled *is* manual-only. Common choices:
     - `0 * * * *` — hourly, for operational dashboards, Slack alerts, reverse-ETL downstream.
     - `0 */6 * * *` — every six hours, for marketing, finance and product analytics where freshness beyond ~1 hour is fine.
     - `0 3 * * *` — nightly at 03:00, for warehouse-wide batch jobs feeding overnight reports.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do. Slack, email, and webhooks are supported.

## Troubleshooting

### `FATAL: password authentication failed for user "datanika_readonly"`
**Cause.** Wrong password, or the role was created in a different database than you're connecting to.
**Fix.** Re-run `ALTER ROLE datanika_readonly PASSWORD '<new>';` against the exact database you set in the connection form, then re-test. Remember that Postgres roles are cluster-wide but `GRANT CONNECT` is per-database.

### `permission denied for table <name>`
**Cause.** The `datanika_readonly` role was created after the table existed and was never granted `SELECT`, or the table lives in a schema you didn't `GRANT USAGE` on.
**Fix.** Run the `GRANT SELECT ON ALL TABLES IN SCHEMA <schema>` and the `ALTER DEFAULT PRIVILEGES` statement from Step 1 against each schema you want to sync. Future tables will then inherit access automatically.

### Connection test times out
**Cause.** Datanika can't reach your Postgres host. Almost always a firewall or `pg_hba.conf` issue.
**Fix.** Check, in order: (1) is the host reachable from the internet at all (`nc -zv <host> 5432`), (2) does `pg_hba.conf` have a `hostssl` rule matching `datanika_readonly` from Datanika's IPs, (3) did you reload Postgres after editing `pg_hba.conf` (`SELECT pg_reload_conf();`), (4) is your cloud firewall (AWS SG, GCP VPC, etc.) allowlisting our egress IPs.

### Incremental run is pulling every row every time
**Cause.** The incremental cursor column isn't actually monotonic, or the pipeline was left on `replace` instead of `merge`.
**Fix.** Verify your cursor column in Step 3. Typical gotcha: `updated_at` exists but isn't updated on every write (e.g., the app sets it in most paths but not in bulk loaders). Switch to an application-enforced `updated_at` trigger, or use a sequence-backed `id` for append-only tables.

### Replication slot filling up the source
**Cause.** You enabled CDC/logical replication on the source and a replication slot isn't being consumed.
**Fix.** Datanika's default PostgreSQL loader uses cursor-based incremental, not logical replication — you don't need a replication slot. If you previously enabled one, drop it with `SELECT pg_drop_replication_slot('<name>');` after confirming nothing else depends on it.

## Related

- **Use cases:** [PostgreSQL → BigQuery](/use-cases/postgresql-to-bigquery), [PostgreSQL → Snowflake](/use-cases/postgresql-to-snowflake)
- **Comparisons:** [Datanika vs Airbyte for PostgreSQL](/compare/airbyte), [Datanika vs Fivetran for PostgreSQL](/compare/fivetran)
- **dbt tips:** starter staging models for `raw_postgres` and dbt best practices in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [PostgreSQL connector spec](/connectors/postgresql)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
