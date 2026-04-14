---
title: "Connect PostgreSQL to Datanika"
description: "Step-by-step guide to sync PostgreSQL into your warehouse with Datanika — create a read-only role, add the connection, pick tables, run, and schedule."
source: "postgresql"
source_name: "PostgreSQL"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating the read-only role in psql](/docs/connectors/postgresql/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **PostgreSQL**.
3. Fill in the form:
   - **Name** — a label you'll recognize later, e.g. `postgres-prod-readonly`.
   - **Host** — the hostname or IP of your Postgres server.
   - **Port** — usually `5432`.
   - **Database** — the database name you granted access to in Step 1.
   - **User** — `datanika_readonly`.
   - **Password** — the password from Step 1. Stored encrypted at rest with Fernet.
   - **SSL mode** — `require` for any production database. Use `disable` only for local dev.
4. Click **Test connection**. You should see a green ✅ within a few seconds.
5. Click **Save**.

![Filling in the PostgreSQL connection form](/docs/connectors/postgresql/02-add-connection.png)

> **Test connection fails?** Jump to [Troubleshooting](#troubleshooting) — 90% of first-run failures are a missing `pg_hba.conf` rule, a firewall, or an SSL mode mismatch.

## Step 3 — Configure tables and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_postgres` so it's obvious where the data came from. Don't reuse an analyst-facing schema; keep raw landing data separated from modeled data.
3. Datanika introspects the source and shows every table you have `SELECT` on. For each table you want to sync:
   - **Write disposition**
     - `replace` — drops and reloads the target table on every run. Safe and simple; fine for small lookup tables.
     - `merge` — upserts changed rows into the target. The right choice for anything that grows over time.
   - **Primary key** — required for `merge`. Datanika will auto-detect it from Postgres metadata; override if you need to.
   - **Incremental cursor** — a column that only ever increases. `updated_at` is the canonical choice; `id` works for append-only tables. Without a cursor, `merge` still works but every run is a full scan.
4. Save the pipeline configuration.

> **Tip.** Start with 1–2 small tables to validate the flow end-to-end before enabling the full sync. A failed 8-hour run is much more expensive to debug than a failed 30-second one.

![Selecting tables and load modes](/docs/connectors/postgresql/03-configure-tables.png)

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. You'll see per-table row counts stream in as dlt extracts and loads each one.
3. A typical first run takes minutes for small OLTP databases and hours for databases in the hundreds of GB. Subsequent incremental runs are much faster because only new/changed rows move.
4. When the run finishes, open **Catalog → `<your warehouse>` → `raw_postgres`** and browse the landed tables.
5. Spot-check row counts against the source: `SELECT count(*) FROM <schema>.<table>;` on both sides should match (or differ by exactly the rows written during the sync window for incremental loads).

![First run in the Runs tab](/docs/connectors/postgresql/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence. Common choices:
   - **Hourly** — operational dashboards, Slack alerts, reverse-ETL downstream.
   - **Every 6 hours** — marketing, finance, product analytics where freshness beyond ~1 hour is fine.
   - **Daily at 03:00** — warehouse-wide batch jobs that feed overnight reports.
3. Choose a **timezone** — this matters when your cadence is daily or weekly. Datanika stores the schedule in the selected timezone, including DST rules.
4. Save. The next scheduled run shows up immediately in the **Runs** tab.
5. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do. Slack, email, and webhooks are supported.

![Configuring the schedule](/docs/connectors/postgresql/05-schedule.png)

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

### `SSL error: certificate verify failed`
**Cause.** SSL mode is `verify-full` but Datanika can't validate your server certificate against a trusted CA.
**Fix.** If you're using a self-signed certificate, switch SSL mode to `require` (encryption without cert validation). For managed Postgres (RDS, Cloud SQL, Supabase, Neon) `verify-full` should just work — double-check the hostname matches the cert CN/SAN.

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
