---
title: "Connect SQLite to Datanika"
description: "Sync a SQLite database file into your warehouse with Datanika — pick tables, run, and schedule. No server, no credentials, just a file path."
source: "sqlite"
source_name: "SQLite"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
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
- A **SQLite file** you want to sync, at a path Datanika can read. On self-hosted, that's any path inside the `app` container's filesystem or a mounted volume. On Datanika Cloud, you'll upload the file through the UI (see Step 1).
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

**Datanika Cloud**

1. In Datanika, open **Connections → New connection → SQLite**.
2. Click **Upload SQLite file** and drag the `.sqlite` / `.db` / `.sqlite3` file from your laptop.
3. Datanika stores the file in your org's managed storage. You'll see an internal path populated in the form automatically — skip to Step 3 below.

> **Size limits.** Self-hosted Datanika has no hard cap on SQLite file size, but loads get slow past ~10 GB — at that size you're better off exporting to Parquet or loading the SQLite into a real database first. Datanika Cloud caps the upload at 500 MB; [open a ticket](mailto:support@datanika.io) if you need more.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **Connections → New connection**.
2. Select **SQLite** from the connector list. Filter by **Source** direction.
3. Fill in the form:
   - **Name** — a label you'll recognize, e.g. `sqlite-myapp`.
   - **Database file path** — the full path from Step 1. Include the extension. Examples: `/var/datanika/sources/app.sqlite`, `/mnt/myapp/data.db`.
   - **Read-only** — leave checked. Datanika only reads, never writes, when SQLite is a source.
4. Click **Test connection**. Datanika opens the file, runs `PRAGMA schema_version`, and lists the tables. You should see a green ✅ within a second.
5. Click **Save**.

![Adding the SQLite connection in Datanika](/docs/connectors/sqlite/02-add-connection.png)

> **Zero credentials.** Like DuckDB, SQLite has no user, password, host, or port — the file path IS the connection. If Test connection fails, it's always a path or permission issue, never a credential issue.

## Step 3 — Configure tables and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_sqlite` (or `raw_<app-name>` if you know what the SQLite file is from) so raw landings are clearly namespaced.
3. Datanika introspects the file and lists every user table. SQLite's internal tables (`sqlite_sequence`, `sqlite_stat1`, etc.) are filtered out automatically. For each table you want to sync:
   - **Write disposition**
     - `replace` — drops and reloads the target table on every run. Safe and simple; fine for small lookup tables or SQLite files that get fully rewritten.
     - `merge` — upserts changed rows. Use this when the SQLite file grows monotonically (e.g., an event log, an audit trail).
   - **Primary key** — required for `merge`. Datanika auto-detects it from the SQLite `PRIMARY KEY` constraint; override if needed.
   - **Incremental cursor** — a column that only ever increases. `rowid`, `created_at`, or an `INTEGER PRIMARY KEY AUTOINCREMENT` column all work.
4. Save the pipeline configuration.

> **Type affinity gotcha.** SQLite uses type *affinity*, not strict types — a column declared `INTEGER` can hold text. Datanika coerces to the declared type on load, which means a text-in-integer-column row will either be coerced or rejected depending on the destination warehouse. If you see mystery load failures, check the source data with `SELECT typeof(col) FROM <table> GROUP BY typeof(col);` in the `sqlite3` CLI to find the stragglers.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Watch the **Runs** tab. SQLite reads are **very fast** because everything is local: tens of thousands of rows per second even on modest hardware.
3. When the run finishes, open **Catalog → `<your warehouse>` → `raw_sqlite`** and browse the landed tables.
4. Spot-check row counts: `SELECT count(*) FROM <table>;` in both the `sqlite3` CLI (against the source file) and the warehouse should match.

![Inspecting the first run](/docs/connectors/sqlite/04-first-run.png)

## Step 5 — Schedule it

SQLite is unusual among sources because **the file doesn't change unless something external rewrites it**. Pick a schedule based on how the upstream SQLite file gets updated:

1. On the pipeline page, click **Schedule**.
2. Common choices:
   - **Hourly / every 15 minutes** — for a SQLite file written by a live app on the same host (mounted read-only from Step 1).
   - **Daily** — for a SQLite file pulled or exported once a day from a mobile/desktop app.
   - **Manual only** — for one-off migrations or ad-hoc exports.
3. Choose a timezone and save.
4. Wire up failure alerts in **Settings → Notifications**. If the upstream file disappears or gets locked, you want to know about it on the first failed run.

> **WAL mode writer contention.** If another process is actively writing to the SQLite file during Datanika's read (common with `journal_mode=WAL`), reads still work — SQLite WAL lets one writer and many readers coexist. If you see `database is locked` errors, the upstream writer is probably using the older rollback journal mode. Have it switch to WAL: `PRAGMA journal_mode=WAL;`.

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
