---
title: "Connect SQLite to Datanika"
description: "Sync a SQLite database file into your warehouse with Datanika — pick tables, run, and schedule. No server, no credentials, just a file path."
source: "sqlite"
source_name: "SQLite"
category: "database"
verified_by: "growth-ui"
verified_date: "2026-09-16"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

SQLite is the embedded database you already have. Mobile apps, desktop apps, browsers, IoT devices, Django and Rails dev environments, even the Datanika CLI itself — all of them store data in a single `.sqlite` / `.db` / `.sqlite3` file. When you want to get that data into a real warehouse for reporting, Datanika treats the file as a first-class source: point at the path, pick your tables, run. This guide walks through using SQLite as a **source**, which is the only supported direction: SQLite cannot receive data.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported SQLite versions, WAL mode, type affinity, and the current limitations — see the [SQLite connector page](/connectors/sqlite).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. If you're just experimenting, [DuckDB as destination](/docs/connectors/duckdb) is the zero-credentials option and pairs well with this guide.
- A **SQLite file** you want to sync, at a path Datanika can read. The SQLite connector takes a filesystem path, which means **this guide is self-hosted-only today** — Datanika Cloud doesn't expose a filesystem path users can write to from outside the container. If you need SQLite-as-source on Datanika Cloud, [open a ticket](mailto:support@datanika.io) so we can track demand.
- SQLite itself is bundled with Python 3 and therefore with Datanika — **no separate install needed**.

## Step 1 — Make the SQLite file reachable

SQLite is a file, not a server. The only thing that varies by environment is how Datanika gets to that file.

🚨 **The one thing to get right: the file must be visible to *both* containers.** Datanika runs the web app (`app`) and the worker (`celery`) as separate containers with separate filesystems. **The load runs in the worker**; **Test Connection, the Data preview and the SQL Editor run in the web app.** Put the file where only the web app can see it and Test Connection still goes green. What the run does next depends on what the worker has at that path:

- **No such directory** — the run fails with `unable to open database file`.
- **The directory, but not the file** — a one-letter typo in the worker's volume name is enough — the run **succeeds with 0 rows** and leaves an empty file at that path. Every later run succeeds with 0 rows too, and a check that the file *exists* in the worker now passes. Tracked as [core#1401](https://github.com/datanika-io/datanika-core/issues/1401).

Neither the button nor the status badge can tell you which one you have, so compare the file from both containers (step 3 below).

**Self-hosted Datanika — file already on the host**

1. Give both services a shared volume for your SQLite sources in `docker-compose.yml`:
   ```yaml
   services:
     app:
       volumes:
         - sqlite_sources:/var/datanika/sources
     celery:
       volumes:
         - sqlite_sources:/var/datanika/sources
   volumes:
     sqlite_sources:
   ```
   Then `docker compose up -d app celery`. A **named volume** (rather than a directory inside the image) is also what makes the file survive a rebuild.
2. Copy the file in:
   ```bash
   docker cp ./app.sqlite datanika-app:/var/datanika/sources/app.sqlite
   ```
3. **Verify it from the worker, not only from the web app** — the web app is where you just put it, so checking there alone tells you nothing. Compare checksums, not just existence:
   ```bash
   docker exec datanika-app    sha256sum /var/datanika/sources/app.sqlite
   docker exec datanika-celery sha256sum /var/datanika/sources/app.sqlite
   ```
   The two lines must match. `No such file or directory` from the worker means the volume is not shared. A different checksum means the worker is reading a different file — possibly an empty one that an earlier run created, which `ls` would happily list (as a 0-byte file). Fix it here rather than debugging an empty load later.
4. Take the full path — you'll paste it into Datanika in Step 2.

**Self-hosted Datanika — file produced by another container on the same host**

Mount the directory containing the SQLite file into **both** containers with a read-only bind mount in `docker-compose.yml`:
```yaml
services:
  app:
    volumes:
      - /opt/myapp/data:/mnt/myapp:ro
  celery:
    volumes:
      - /opt/myapp/data:/mnt/myapp:ro
```
Then use `/mnt/myapp/app.sqlite` as the path in Step 2. Read-only is enough — Datanika never writes to a SQLite source.

> **Size guidance.** Self-hosted Datanika has no hard cap on SQLite file size, but loads get slow past ~10 GB — at that size you're better off exporting to Parquet or loading the SQLite into a real database first.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `sqlite`. The form reshapes itself to show the SQLite-specific fields.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `sqlitemyapp`. Letters, digits and spaces only: anything else is stripped as you type, so `sqlite-myapp` becomes `sqlitemyapp`.
   - **Database Path** — the full path from Step 1. Include the extension. Examples: `/var/datanika/sources/app.sqlite`, `/mnt/myapp/data.db`.
4. Click **Test Connection**. Datanika opens the file read-only and reads its list of tables. There are no credentials, so no answer is ever about authentication. You get one of three:
   - *Connected — read the database at '…'.* (green)
   - *No database at '…'. Check the path, or create the file first.* — nothing exists at that path. Testing does not create a file.
   - *Cannot open '…' — check that it is a database file and that it is readable.* — something is there, but it is not a SQLite database you can read. A plain text file lands here, not on the green answer.
   > ⚠️ **A green Test Connection does not mean the load will work.** Test Connection runs in the **web app** container; the load runs in the **worker**. If the worker cannot see the same file, this button still opens the one the web app sees and reports success — and the run then either fails or succeeds with nothing (Step 1). The checksum comparison in Step 1 step 3 is the one that answers the question this button looks like it is answering.
5. Click **Create Connection**.

> **Name + path is all you get on the form.** The SQLite Connection form has exactly two inputs: Connection Name and Database Path (plus a **Use raw JSON config** escape hatch for advanced cases). There is no read-only toggle. A run reads your tables without changing the file — its checksum is the same before and after — but it is not a read-only open: pointed at a path where the worker finds no file, it creates an empty one there ([core#1401](https://github.com/datanika-io/datanika-core/issues/1401)).

![Adding the SQLite connection in Datanika](/docs/connectors/sqlite/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters, digits and spaces — anything else is stripped as you type, so `app-data-sync` becomes `appdatasync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the SQLite connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because the source is a SQL database, you also get:
   - **Load Mode** — `full_database` (the default) or `single_table`.
   - **Write Disposition** — `append` (the default), `replace`, or `merge`.
   - **Source schema** *(optional)* — SQLite has no schemas — leave **Source schema** blank.
   - **Table names** *(optional, comma-separated)* — restrict the sync to specific tables. Blank means every table the role can read.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **These four controls exist only because the source is a SQL database.** They are hidden for every non-SQL source — files, SaaS APIs, MongoDB, Google Sheets, REST and Kafka.

> **Tip.** Start with one or two small tables via **Table names** to validate the flow end-to-end before syncing everything. A failed 8-hour run is much more expensive to debug than a failed 30-second one.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `appdatasync` creates schema `appdatasync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected. For SQLite this is not a formality: a run that could not see your file can still finish green with `0` in **Rows** (Step 1).

![The Data preview of a table loaded from SQLite, after its first run in Datanika](/docs/connectors/sqlite/04-first-run.png)

> **Dates and times.** SQLite has no date type, so a `DATETIME` column usually holds text such as `2025-06-09 20:23:24`. Loaded into PostgreSQL, a column declared that way lands as `timestamp with time zone`, with the same clock time read as **UTC**. If your application wrote local time, convert it in the warehouse.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `appdatasync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

**What a scheduled run does to your tables:** every run reads the selected tables again from the start, because an upload keeps no cursor from one run to the next, not even with **Enable incremental loading** ticked ([Uploads → Incremental cursor](/docs/uploads#incremental-cursor)). **Write Disposition** decides what that leaves behind. Under `append`, the default, each run adds another copy of every row: over an unchanged database, a second run doubles every table. Choose `merge` with a primary key to keep one row per key, or `replace` to keep only the latest run's rows.

## Troubleshooting

### `unable to open database file`
**Cause.** This is how a **run** reports that the worker has no such directory — in full, `(sqlite3.OperationalError) unable to open database file`. The path is wrong, or the worker cannot see the volume the file is on. Test Connection words the same problem differently (*No database at '…'*), and if the web app can see the file it does not report a problem at all.
**Fix.** Check the file from **both** containers, because they have separate filesystems and the load runs in the worker:
```bash
docker exec datanika-app    sha256sum <path>
docker exec datanika-celery sha256sum <path>
```
If it is missing from `datanika-celery` but present in `datanika-app`, your volume is not shared — go back to Step 1. That combination is the one worth recognising: it is also the state in which **Test Connection succeeds and the run fails**. If the file is in both but Datanika still can't open it, check permissions (`chmod 644 <file>` as the file owner on the host).

### `database disk image is malformed`
**Cause.** The SQLite file was truncated or corrupted, usually because it was copied while another process was mid-write.
**Fix.** Re-export the file cleanly. If it's a live database, have the writer run `VACUUM INTO '<copy-path>'` to produce a consistent snapshot, then point Datanika at the snapshot instead of the live file. Never `cp` a live SQLite file — always use `VACUUM INTO` or `sqlite3 <file> ".backup <copy>"`.

### `database is locked`
**Cause.** Another process holds an exclusive lock on the file — typically a writer using the old rollback-journal mode, or a long-running transaction elsewhere.
**Fix.** Switch the writer to WAL mode (`PRAGMA journal_mode=WAL;`) — this lets Datanika read while the writer is active. If you can't control the writer, sync from a `VACUUM INTO` snapshot instead.

### Integer columns are landing as strings in the warehouse
**Cause.** SQLite type affinity — a column declared `INTEGER` can hold text values. Datanika coerces to the declared type by default, but some destination warehouses reject mixed-type columns before coercion finishes.
**Fix.** Clean the source: `UPDATE <table> SET <col> = CAST(<col> AS INTEGER) WHERE typeof(<col>) = 'text';`. Or set the column's destination type explicitly to `TEXT` in Datanika's schema override so you can clean it downstream in dbt.

### First run completes instantly with zero rows
**Cause.** Most often, **the worker is not reading your file.** If the worker has the directory but not the file, the run creates an empty database at that path and finishes `success` with `0` rows — and every later run does the same ([core#1401](https://github.com/datanika-io/datanika-core/issues/1401)). Otherwise the file itself is empty or unused, or the tables are in a different attached database than Datanika sees.
**Fix.** Run the checksum comparison from Step 1 step 3 first. A 0-byte file, or a checksum that differs from the web app's, means the worker is looking somewhere else: fix the volume so both containers mount the same one, then run again. If the checksums match, run `.tables` against the file in the `sqlite3` CLI to confirm it contains data. If the app uses `ATTACH DATABASE`, each attached file is a separate connection — point Datanika at the specific file you need, not the main one.

## Related

- **Use cases:** Pair SQLite with [DuckDB as destination](/docs/connectors/duckdb) for a fully zero-credentials pipeline, or with [PostgreSQL](/docs/connectors/postgresql) for a production warehouse.
- **Docs:** [Connections](/docs/connections), [Pipelines](/docs/pipelines), [Self-Hosting](/docs/self-hosting) — the self-hosting guide covers Docker bind mounts in detail.
- **Not a destination:** Datanika cannot write *into* a SQLite file. The upload form does not offer SQLite connections as a destination, and creating an upload that names one is refused with a message saying so. The load layer (dlt) can write SQLite through its generic SQLAlchemy destination; Datanika does not use that path. Tracked as [core#865](https://github.com/datanika-io/datanika-core/issues/865).
- **Transformations:** SQLite is **not** a transformation target — Datanika ships no SQLite dbt adapter, so a pipeline or transformation cannot run against a `.db` file. Load SQLite into a warehouse and transform there; see [the destinations dbt can build in](/docs/transformations) and the [Transformations guide](/docs/transformations-guide).
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran) — neither supports SQLite files as a first-class source at time of writing, which is why this guide exists.
- **Connector reference:** full field-by-field [SQLite connector spec](/connectors/sqlite).
