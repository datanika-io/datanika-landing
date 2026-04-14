---
title: "Connect DuckDB to Datanika"
description: "Set up DuckDB as an embedded analytical warehouse in Datanika — no cloud account, no credentials, just a file path. Great for local dev and small-team analytics."
source: "duckdb"
source_name: "DuckDB"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

DuckDB is an embedded columnar analytical database — think "SQLite for analytics". It runs in-process, stores everything in a single `.duckdb` file, and needs zero credentials, zero network, and zero provisioning. That makes it the fastest possible destination to stand up in Datanika: you can be loading data within two minutes of signup, without a BigQuery project or a Snowflake trial. This guide walks through using DuckDB as a **destination warehouse** for your Datanika pipelines.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported versions, file locking, concurrency notes, catalog browsing — see the [DuckDB connector page](/connectors/duckdb).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **source connection** already wired up in Datanika — PostgreSQL, Stripe, a CSV upload, anything. DuckDB is a destination here, so you need data flowing *into* it from somewhere else.
- **Write access** to a filesystem path Datanika can reach — any directory on the container's filesystem or a mounted volume on self-hosted Datanika.
- The DuckDB Python engine is bundled with Datanika — **you do not need to install it separately**. The `duckdb` standalone CLI binary is NOT bundled; if you want one for ad-hoc inspection, install it separately from [duckdb.org/docs/installation](https://duckdb.org/docs/installation).

## Step 1 — Pick a file path

DuckDB stores its entire database in a single file. You just need to decide where that file lives.

1. Choose a directory inside the `app` container (or a host-mounted volume). We recommend creating a dedicated directory so the file is easy to back up and hard to accidentally `rm -rf`:
   ```bash
   docker exec -it datanika-app mkdir -p /var/datanika/duckdb
   ```
2. Pick a filename that describes what's going in it, for example `analytics.duckdb` or `raw_stripe.duckdb`. Full path: `/var/datanika/duckdb/analytics.duckdb`.
3. If you mount `/var/datanika/duckdb` as a Docker volume, the file will survive container rebuilds. If you skip the volume, the file is lost when the container is replaced — fine for local experimentation, not for anything you care about.

> **Zero credentials.** Unlike every other database in this list, DuckDB has no user, password, host, or port. The file path IS the connection string. This is also why DuckDB is the right choice for the "zero-credentials onboarding" story — no external account to sign up for.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **Connections → New connection**.
2. Select **DuckDB** from the connector list. Filter by the **Destination** direction if the list is long.
3. Fill in the form:
   - **Name** — a label you'll recognize, e.g. `duckdb-analytics`. This is what shows up in pipeline pickers.
   - **Path to DuckDB file** — the full path from Step 1, e.g. `/var/datanika/duckdb/analytics.duckdb`. You can also use `:memory:` for an ephemeral in-process database (data is lost when the worker exits — only useful for smoke tests).
4. Click **Save**. DuckDB will open (or create) the file on the first pipeline run.

![Adding the DuckDB connection in Datanika](/docs/connectors/duckdb/02-add-connection.png)

> **"File not found"?** On self-hosted, the parent directory must exist *before* you hit Test connection. DuckDB creates the `.duckdb` file, but it does not create parent directories. Run the `mkdir -p` from Step 1 first, then retry.

## Step 3 — Configure tables and schemas

DuckDB supports schemas just like a full warehouse — they're namespaces inside the file. Use them the same way you would in Postgres or Snowflake.

1. Open the pipeline you want to land into DuckDB (or create a new one).
2. Set the **destination** to the DuckDB connection you just made.
3. Pick a **target schema**. We recommend one schema per source system so raw landings don't collide:
   - `raw_postgres` for a Postgres source
   - `raw_stripe` for a Stripe source
   - `raw_csv` for CSV uploads
4. For each table being loaded, the source connector's existing settings still apply — **write disposition** (`replace` or `merge`), **primary key**, **incremental cursor**. DuckDB honors all of them.
5. Save the pipeline configuration.

> **Tip.** DuckDB is single-writer by design. If you point five pipelines at the same `.duckdb` file and run them concurrently, four of them will queue waiting for the file lock. For parallel workloads, use one file per source or switch to PostgreSQL as the destination.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Watch the **Runs** tab. DuckDB loads are typically **fast** — seconds to minutes for anything under a few GB, because there's no network round-trip, no query planner warmup, and no cloud API rate limit.
3. When the run finishes, open **Catalog → DuckDB → `raw_<source>`** and browse the landed tables. You can preview rows and see column types directly in Datanika's Data Catalog, no SQL required.
4. For a deeper inspection without leaving Datanika, open **SQL Editor**, point it at the DuckDB connection, and run `SHOW TABLES;` or `SELECT count(*) FROM raw_postgres.users;`. If you'd rather drive DuckDB from outside Datanika, run the Python engine that's already in the container:
   ```bash
   docker exec -it datanika-app python -c \
     "import duckdb; con = duckdb.connect('/var/datanika/duckdb/analytics.duckdb'); print(con.execute('SHOW TABLES').fetchall())"
   ```

![Inspecting the first run](/docs/connectors/duckdb/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence. For DuckDB, common choices:
   - **Hourly** — local analytics, internal dashboards pointed at the `.duckdb` file.
   - **Daily** — end-of-day snapshots for a laptop analyst workflow.
   - **Manual only** — ad-hoc loads during exploration or migration work. DuckDB's speed makes manual runs cheap.
3. Choose a timezone and save.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs immediately.

> **Concurrency warning.** If you schedule two pipelines pointing at the same `.duckdb` file on overlapping cadences, they will contend for the single-writer lock. Stagger their start times or split into multiple files.

## Troubleshooting

### `IO Error: Cannot open file "<path>": No such file or directory`
**Cause.** The parent directory of the `.duckdb` path doesn't exist. DuckDB creates the file itself, but not the directories above it.
**Fix.** Run `mkdir -p /var/datanika/duckdb` (or your chosen parent) inside the Datanika container, then re-test the connection. If you're running in Docker, make sure the directory lives on a mounted volume or it'll disappear on the next rebuild.

### `Conflicting lock is held in <pid>` or `Could not set lock on file`
**Cause.** Another process has the `.duckdb` file open in write mode. Usually this is a second pipeline run or a background Celery task — or, if you've shelled into the container, a Python / external-CLI session you forgot to close.
**Fix.** Close the other writer. For a hung session, restart the `datanika-app` container to drop stale locks. Long-term fix: use one `.duckdb` file per source, or switch to Postgres/BigQuery for concurrent workloads.

### `Catastrophic failure: database file is not a valid DuckDB file`
**Cause.** The file path points at something that isn't a DuckDB database — often an old SQLite file, a zero-byte file left by a failed init, or a text file with the wrong extension.
**Fix.** Move or delete the bad file (`mv /var/datanika/duckdb/analytics.duckdb{,.bak}`) and re-run Test connection. Datanika will create a fresh empty database.

### The file grows without bound after every run
**Cause.** DuckDB doesn't automatically reclaim space from deleted rows — `replace` loads keep the old pages until you `CHECKPOINT` or `VACUUM`.
**Fix.** Run `CHECKPOINT;` followed by `VACUUM;` against the DuckDB connection — either from Datanika's SQL Editor, or from a dbt maintenance operation scheduled as its own pipeline.

## Related

- **Pipeline templates:** [CSV → DuckDB](/templates/csv-to-duckdb) is the zero-credentials onboarding starter — it uses DuckDB as its destination out of the box. The easiest way to see DuckDB in Datanika end-to-end is to click that template.
- **Docs:** [Getting Started](/docs/getting-started), [Pipelines](/docs/pipelines), [Data Catalog](/docs/catalog), [Self-Hosting](/docs/self-hosting)
- **Transformations:** DuckDB is fully supported as a dbt target. See the [Transformations guide](/docs/transformations-guide) for dbt-on-DuckDB patterns — `dbt-duckdb` is bundled, no extra install needed.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran) — neither supports DuckDB as a first-class destination at time of writing.
- **Connector reference:** full field-by-field [DuckDB connector spec](/connectors/duckdb).
