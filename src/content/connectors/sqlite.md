---
title: "Connect SQLite to Datanika"
description: "Sync a SQLite database file into your warehouse with Datanika — pick tables, run, and schedule. No server, no credentials, just a file path."
source: "sqlite"
source_name: "SQLite"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-18"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

SQLite is the embedded database you already have. Mobile apps, desktop apps, browsers, IoT devices, Django and Rails dev environments, even the Datanika CLI itself — all of them store data in a single `.sqlite` / `.db` / `.sqlite3` file. When you want to get that data into a real warehouse for reporting, Datanika treats the file as a first-class source: point at the path, pick your tables, run. This guide walks through using SQLite as a **source** — the most common direction by far.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported SQLite versions, WAL mode, type affinity, and SQLite-as-destination notes — see the [SQLite connector page](/connectors/sqlite).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. If you're just experimenting, [DuckDB as destination](/docs/connectors/duckdb) is the zero-credentials option and pairs well with this guide.
- A **SQLite file** you want to sync, at a path Datanika can read. The SQLite connector takes a filesystem path, which means **this guide is self-hosted-only today** — Datanika Cloud doesn't expose a filesystem path users can write to from outside the container. If you need SQLite-as-source on Datanika Cloud, [open a ticket](mailto:support@datanika.io) so we can track demand.
- SQLite itself is bundled with Python 3 and therefore with Datanika — **no separate install needed**.

## Step 1 — Make the SQLite file reachable

SQLite is a file, not a server. The only thing that varies by environment is how Datanika gets to that file.

**Self-hosted Datanika — file already on the host**

1. Copy the file into the Datanika container's filesystem or a mounted volume:
   ```bash
   docker cp ./app.sqlite datanika-app:/var/datanika/sources/app.sqlite
   ```
   If you've mounted `/var/datanika/sources` as a Docker volume, the copy survives container rebuilds.
2. Verify the path is readable from inside the container:
   ```bash
   docker exec -it datanika-app ls -l /var/datanika/sources/app.sqlite
   ```
3. Take the full path — you'll paste it into Datanika in Step 2.

**Self-hosted Datanika — file produced by another container on the same host**

Mount the directory containing the SQLite file into the `datanika-app` container with a read-only bind mount in `docker-compose.yml`:
```yaml
services:
  app:
    volumes:
      - /opt/myapp/data:/mnt/myapp:ro
```
Then use `/mnt/myapp/app.sqlite` as the path in Step 2. Read-only is enough — Datanika never writes to a SQLite source.

> **Size guidance.** Self-hosted Datanika has no hard cap on SQLite file size, but loads get slow past ~10 GB — at that size you're better off exporting to Parquet or loading the SQLite into a real database first.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `sqlite`. The form reshapes itself to show the SQLite-specific fields.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `sqlite-myapp`.
   - **Database Path** — the full path from Step 1. Include the extension. Examples: `/var/datanika/sources/app.sqlite`, `/mnt/myapp/data.db`.
4. Click **Test Connection**. Datanika opens the file and reports success or an error. Because SQLite has no credentials, any failure here is a path or permission issue — not an auth problem.
5. Click **Create Connection**.

> **Name + path is all you get on the form.** The SQLite Connection form has exactly two inputs: Connection Name and Database Path (plus a **Use raw JSON config** escape hatch for advanced cases). Datanika never writes to a SQLite source — the connector opens the file read-only at pipeline runtime, enforced by the source role, so no UI toggle is needed.

![Adding the SQLite connection in Datanika](/docs/connectors/sqlite/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `appdatasync` becomes `appdatasync`) and an optional **Description**.
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
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

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

## Troubleshooting

### `unable to open database file`
**Cause.** The path is wrong, the file doesn't exist, or the `datanika-app` container can't see it. This is the single most common failure mode.
**Fix.** Run `docker exec -it datanika-app ls -l <path>` — if the file isn't there, your bind mount or `docker cp` didn't land where you expected. If the file IS there but Datanika still can't open it, check permissions (`chmod 644 <file>` as the file owner on the host).

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
**Cause.** You pointed Datanika at an empty or unused SQLite file, or the tables are in a different attached database than Datanika sees.
**Fix.** In the `sqlite3` CLI, run `.tables` against the file to confirm it actually contains data. If the app uses `ATTACH DATABASE`, each attached file is a separate connection — point Datanika at the specific file you need, not the main one.

## Related

- **Use cases:** Pair SQLite with [DuckDB as destination](/docs/connectors/duckdb) for a fully zero-credentials pipeline, or with [PostgreSQL](/docs/connectors/postgresql) for a production warehouse.
- **Docs:** [Connections](/docs/connections), [Pipelines](/docs/pipelines), [Self-Hosting](/docs/self-hosting) — the self-hosting guide covers Docker bind mounts in detail.
- **Transformations:** dbt-on-SQLite works for small projects via `dbt-sqlite`, but most users load SQLite into a bigger warehouse first and transform there. See the [Transformations guide](/docs/transformations-guide).
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran) — neither supports SQLite files as a first-class source at time of writing, which is why this guide exists.
- **Connector reference:** full field-by-field [SQLite connector spec](/connectors/sqlite).
