---
title: "Connect DuckDB to Datanika"
description: "Set up DuckDB as an embedded analytical warehouse in Datanika — no cloud account, no credentials, just a file path. Great for local dev and small-team analytics."
source: "duckdb"
source_name: "DuckDB"
category: "database"
verified_by: "product-ui"
verified_date: "2026-08-31"
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
- **A volume mounted into both the web and worker containers** on self-hosted Datanika. Not just "a path Datanika can reach" — Step 1 explains why the *both* is the whole ballgame.
- The DuckDB Python engine is bundled with Datanika — **you do not need to install it separately**. The `duckdb` standalone CLI binary is NOT bundled; if you want one for ad-hoc inspection, install it separately from [duckdb.org/docs/installation](https://duckdb.org/docs/installation).

## Step 1 — Pick a file path

DuckDB stores its entire database in a single file. You just need to decide where that file lives.

🚨 **The one thing to get right: the path must be on a volume mounted into *both* the web container and the worker container.** Datanika runs them as separate containers (`app` and `celery`), and a plain directory inside one of them is invisible to the other. The **load runs in the worker**; **Models, the Data preview and the SQL Editor run in the web app**. Put the file somewhere only one of them can see and you get a run that goes green while the UI shows you nothing — and the file disappears the next time that container is replaced.

1. **Add a shared volume** for it in your `docker-compose.yml`, on the web service *and* the worker:
   ```yaml
   services:
     app:
       volumes:
         - duckdb_data:/var/datanika/duckdb
     celery:
       volumes:
         - duckdb_data:/var/datanika/duckdb
   volumes:
     duckdb_data:
   ```
   Then `docker compose up -d app celery`. A **named volume** (rather than a directory inside the image) is what makes the file survive a rebuild.
2. Pick a filename that describes what's going in it, for example `analytics.duckdb` or `raw_stripe.duckdb`. Full path: `/var/datanika/duckdb/analytics.duckdb`.
3. **Check it before you go further** — the same path, from both containers:
   ```bash
   docker exec datanika-app    touch /var/datanika/duckdb/.probe
   docker exec datanika-celery ls    /var/datanika/duckdb/.probe
   ```
   If the second command says `No such file or directory`, the volume is not shared and nothing below will work as described. Fix it here rather than debugging an empty catalog later.

> ⚠️ **On Datanika Cloud this is not yet wired up** — tracked as [core#793](https://github.com/datanika-io/datanika-core/issues/793). DuckDB destinations are a self-hosted feature until it ships; on the hosted plan, use one of the credentialled warehouses.

> **Zero credentials.** Unlike every other database in this list, DuckDB has no user, password, host, or port. The file path IS the connection string. This is also why DuckDB is the right choice for the "zero-credentials onboarding" story — no external account to sign up for.

## Step 2 — Add the connection in Datanika

1. In Datanika, open `/connections`. The New Connection form is rendered inline on the page.
2. From the type dropdown, pick `duckdb`.
3. Fill in the form:
   - **Connection Name** — a label you'll recognize, e.g. `duckdbanalytics`. This is what shows up in the source and destination pickers. **The field strips anything that isn't a letter or a digit as you type**, so `duckdb-analytics` becomes `duckdbanalytics`. Type the name you want to end up with.
   - **Database Path** — the full path from Step 1, e.g. `/var/datanika/duckdb/analytics.duckdb`. You can also use `:memory:` for an ephemeral in-process database (data is lost when the worker exits — only useful for smoke tests).
4. Click **Create Connection**. DuckDB will open (or create) the file on the first pipeline run.

![Adding the DuckDB connection in Datanika](/docs/connectors/duckdb/02-add-connection.png)

> **"File not found"?** On self-hosted, the parent directory must exist *before* you hit Test connection. DuckDB creates the `.duckdb` file, but it does not create parent directories. Mounting the volume from Step 1 creates the directory for you; if you skipped that, this is the error it produces.

## Step 3 — Point a load at it

DuckDB supports schemas just like a full warehouse — they're namespaces inside the file. What lands in them is an **upload**, configured on its own page rather than on the connection.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — other characters are stripped as you type) and an optional **Description**.
3. Pick the **Source connection** you want to read from, and set the **Destination connection** to the DuckDB connection from Step 2. Entries read `14 — analyticswarehouse (duckdb)`, i.e. id, name, type.
4. **Batch size** defaults to 10,000 rows. The **Schema Contract** dropdowns (**Tables** / **Columns** / **Data Type**) decide whether a changed incoming shape evolves the destination or fails the run.
5. Click **Create Upload**. It appears below with status `draft`.

![Configuring an upload that lands in DuckDB](/docs/connectors/duckdb/03-configure-upload.png)

> **What you can configure depends on the *source*, not on DuckDB.** **Load Mode** and **Write Disposition** (`append` / `replace` / `merge`) appear only when the source is a SQL database. For a file, SaaS, MongoDB, Google Sheets, REST or Kafka source they are hidden, and the load's shape is whatever the source produces. DuckDB honours whatever it is handed either way.

> **Tip.** DuckDB is single-writer by design. If you point five pipelines at the same `.duckdb` file and run them concurrently, four of them will queue waiting for the file lock. For parallel workloads, use one file per source or switch to PostgreSQL as the destination.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**.
2. Watch **`/runs`**. DuckDB loads are typically **fast** — seconds to minutes for anything under a few GB, because there's no network round-trip, no query planner warmup, and no cloud API rate limit.

![The /runs table after a load into DuckDB — a run status, which is not the same thing as data having arrived](/docs/connectors/duckdb/04-first-run.png)

3. When the run finishes, open **Models** (`/models`) and browse the landed tables. Each lands in a schema **named after the upload**, and you can see column counts and last-run status directly in the Data Catalog, no SQL required.
4. **Open a table and click `Load first 100 rows`.** The **Data preview** on the model detail page runs a live `SELECT` against the DuckDB file, so it is the cheapest proof that data actually arrived. **For DuckDB this step is doing double duty**: because the web app and the worker are separate containers, an empty or missing preview after a green run is the symptom of a file only the worker can see — go back to Step 1's probe.
5. For a deeper inspection without leaving Datanika, open **SQL Editor**, point it at the DuckDB connection, and run `SHOW ALL TABLES;` or `SELECT count(*) FROM <upload_name>.<table>;`. If you'd rather drive DuckDB from outside Datanika, run the Python engine that's already in the container:
   ```bash
   docker exec -it datanika-celery /app/.venv/bin/python -c \
     "import duckdb; con = duckdb.connect('/var/datanika/duckdb/analytics.duckdb', read_only=True); print(con.execute('SHOW ALL TABLES').fetchall())"
   ```
   > **Use `/app/.venv/bin/python`, not `python`.** The image's system interpreter has none of the app's packages and answers `ModuleNotFoundError: No module named 'duckdb'`, which looks like a far bigger problem than it is. Open it `read_only=True` unless you mean to write — DuckDB is single-writer, and an open handle will block the next scheduled run.
   >
   > **Run it in the worker (`datanika-celery`) *and* in the web app (`datanika-app`), and expect the same answer.** The load happens in the worker, so that container definitely sees the file; the web app is where Models and the preview read it. If the two disagree, your volume is not shared — that is the Step 1 mistake, showing up three steps later.

## Step 5 — Schedule it

1. Open **`/schedules`** and use the inline **New Schedule** form. Set **Target type** to `upload` and **Target name** to the upload's saved name.
2. Enter a five-field **Cron expression**. There is no cadence picker and no "manual only" option — an upload with no schedule *is* manual-only, which is the right choice for ad-hoc exploration or migration work, where DuckDB's speed makes manual runs cheap.
   - `0 * * * *` — hourly, for local analytics and internal dashboards pointed at the `.duckdb` file.
   - `0 3 * * *` — nightly at 03:00, for end-of-day snapshots in a laptop analyst workflow.
3. Set the **Timezone** (defaults to `UTC`; the cron is evaluated in it) and click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs immediately.

> **Concurrency warning.** If you schedule two loads pointing at the same `.duckdb` file on overlapping cadences, they will contend for the single-writer lock. Stagger their cron expressions or split into multiple files.

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
