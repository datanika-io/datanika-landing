---
title: "Load JSON Files into Datanika"
description: "Upload JSON and JSON Lines files into your warehouse with Datanika — drag a file, point at a directory, or tail a log stream. Nested structures, real types, zero credentials."
source: "json"
source_name: "JSON"
category: "file"
verified_by: "product-ui"
verified_date: "2026-07-22"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

JSON is the format your APIs already speak, your logs already emit, and your SaaS exports already land in. Datanika treats both **JSON documents** (a single array of records in one `.json` file) and **JSON Lines** (`.jsonl` / `.ndjson`, one record per line) as first-class sources — drop a file in the browser, pick a destination, hit run. Unlike CSV you get real types (numbers stay numbers, booleans stay booleans, nulls stay nulls) and nested structures are flattened predictably into warehouse columns. This guide covers **local JSON file uploads**, the zero-credentials walkthrough path that pairs with the [CSV](/docs/connectors/csv) and [Parquet](/docs/connectors/parquet) guides.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported JSON dialects, the flattening rule, handling of `null` vs missing keys, and the difference between `.json` and `.jsonl` parsing — see the [JSON connector page](/connectors/json).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. [DuckDB as destination](/docs/connectors/duckdb) is the zero-credentials option if you're just experimenting.
- A **JSON file** on your computer in one of the two supported shapes:
  - **JSON documents** — the entire file is a single array of objects: `[{...}, {...}, ...]`. Extension usually `.json`.
  - **JSON Lines** — one JSON object per line, no top-level array, no commas between records. Extension usually `.jsonl` or `.ndjson`. This is the format your logs and API streaming exports use.
- For the directory-watcher path (Step 1b): **self-hosted Datanika** with a mounted volume you can drop files into.

## Step 1a — Upload a file through the UI (the common case)

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page.
2. From the **type dropdown**, pick `json` (under the **File** category).
3. **Connection Name** — give it a label, e.g. `apilogs202604` or `segmentexportq1`. **The field strips anything that isn't a letter or a digit as you type**, so `api-logs-2026-04` becomes `apilogs202604`. Type the name you want to end up with.
4. In the **Upload File** section, drag your `.json` / `.jsonl` / `.ndjson` file into the upload area, or click the **Upload File** button to browse. (There's no in-form preview — the file is parsed when the pipeline runs.)
5. Click **Test Connection**, then **Create Connection**.

![Adding the JSON connection in Datanika](/docs/connectors/json/02-add-connection.png)

> **How Datanika parses JSON at load time.** When the pipeline runs, Datanika detects the shape and types automatically — none of this is configured on the form:
> - **Format** — JSON document (`[...]`) vs JSON Lines (one object per line), from the first non-whitespace character.
> - **Types** — taken directly from JSON values (`42` integer, `42.0` float, `"42"` string, `true` boolean, `null`), no inference heuristics.
> - **Nested structure** — objects are flattened with `__` separators (`customer.address.city` → `customer__address__city`); arrays of scalars become typed array columns; arrays of objects get their own child table.

> **File size guidance.** Up to ~500 MB per file on the UI uploader. Larger than that, use the directory-watcher path (Step 1b) — it streams from disk so memory never spikes.

## Step 1b — Watch a directory (self-hosted, recurring JSON drops)

The classic use case: an upstream job writes one `.jsonl` file per hour or per day to a shared directory, and you want Datanika to pick each one up exactly once.

1. On self-hosted Datanika, mount a directory into the `app` container read-only:
   ```yaml
   services:
     app:
       volumes:
         - /opt/datanika/inbox-json:/var/datanika/inbox-json:ro
   ```
2. Restart the container to pick up the mount.
3. In Datanika, open **`/connections`**, pick `json` from the type dropdown.
4. Skip the file upload area. Below it, you'll see the **Or enter file path** input — enter the path to the **directory** inside the container:
   - **Or enter file path** — `/var/datanika/inbox-json`. **A directory, not a file and not a glob.** Datanika matches `*.json` *inside* whatever you type, so a path ending in a filename or a pattern matches nothing.
   - ⚠️ **`.jsonl` files do not match the default pattern.** The default is `*.json`. If your drops are `.jsonl` or `.ndjson`, set **File Pattern** on the upload (S3) or `file_glob` in the upload's **Use raw JSON config** — otherwise the run fails with "no files matched". The *reader* handles JSON Lines fine; it's the file pattern that has to agree.
5. Click **Test Connection** if you like, but it tells you nothing here: JSON connections always return *"Test not applicable for this type"*. It does not open the path, check readability, or preview the file — that only happens when the load runs. The run itself now fails loudly if nothing matches, so a wrong path surfaces there rather than as a silent empty load.
6. Click **Create Connection**.

> **Read-only mount.** Always mount source directories with `:ro`. Datanika never writes to a JSON source, and the read-only flag is an explicit guarantee for the upstream producer.

## Step 2 — Configure the load

JSON connections are almost always one file (or one directory) → one table. Nested child tables (arrays of objects) land alongside the root table with a foreign key.

The connection alone moves nothing — the thing that reads the JSON and writes it to your warehouse is an **upload**, and it lives on its own page rather than on the connection.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — other characters are stripped as you type), an optional **Description**, the **Source connection** from Step 1, and the **Destination connection** to land in. **Batch size** defaults to 10,000 rows.
3. Optionally set the **Schema Contract** — the **Tables** / **Columns** / **Data Type** dropdowns that decide whether a changed incoming shape evolves the destination or fails the run. This is the control that matters most for JSON, where upstream producers add fields without warning.
4. Click **Create Upload**. It appears below with status `draft`.

> **There is no write disposition, primary key, or target schema for a JSON source.** Datanika hides the **Load Mode** and **Write Disposition** selectors for every non-SQL source — files (`csv`, `json`, `parquet`, `s3`), SaaS APIs, MongoDB, Google Sheets, REST and Kafka. They appear only when the source is a SQL database. Nested arrays still land as child tables (see below), but you don't get per-table configuration on the way in; shape the result in a dbt model downstream.

> **Flattening is opinionated.** Nested objects become `parent__child` columns. Arrays of scalars become typed array columns (`ARRAY<STRING>`, etc.) where the destination supports them, or comma-joined strings where it doesn't. Arrays of objects always become child tables — Datanika never embeds an object array in a single cell, because that's impossible to query efficiently in most warehouses.

## Step 3 — First run

1. On the **`/uploads`** row for your upload, click **Run**.
2. Watch **`/runs`**. JSON Lines streams incrementally, so even a 5 GB log file won't blow up memory — Datanika processes it in constant memory and emits rows as they're parsed.
3. When the run finishes, open **Models** (`/models`) and you'll see the root table plus any child tables created from nested arrays.
4. Spot-check: open the source file in a text editor, copy one record, and verify its flattened columns landed correctly in the warehouse.

## Step 4 — Schedule it (directory watchers only)

UI-uploaded files are one-shot. Scheduling is only meaningful for the directory-watcher flow from Step 1b.

1. Open **`/schedules`** and use the inline **New Schedule** form. Set **Target type** to `upload` and **Target name** to the upload's saved name.
2. Enter a five-field **Cron expression** matching the upstream producer — there is no cadence picker, and leaving the upload unscheduled is what "manual only" means here:
   - `*/15 * * * *` — for hot log directories where freshness matters.
   - `0 * * * *` — hourly, the sweet spot for API export drops.
   - `0 3 * * *` — end-of-day batch dumps from legacy systems.
3. Set the **Timezone** (defaults to `UTC`; the cron is evaluated in it) and click **Create Schedule**. The row lands as **Active** and can be paused per row.
4. Wire up failure alerts in **Settings → Notifications** so malformed files or missing drops surface immediately.

## Troubleshooting

### `Invalid JSON: Expecting value: line 1 column 1 (char 0)`
**Cause.** The file isn't valid JSON at all — often it's a JSON Lines file saved with a `.json` extension, so Datanika tried to parse it as a single document and choked on the second object.
**Fix.** Rename the file to `.jsonl`. The two formats are distinct — `.json` must have an outer `[...]`, `.jsonl` must not.

### Root table has a column named `null` or one record is missing a field
**Cause.** Missing keys and explicit `null` values are distinct in JSON but land identically in most warehouses (as SQL `NULL`). Datanika preserves the distinction in the raw column by using `null` the value for explicit nulls, and omitting the key entirely for missing ones — but you lose that distinction once it's in a typed column.
**Fix.** If the difference matters for you (rare — usually only for schema-level data quality metrics), switch the column to `JSON` / `VARIANT` / `JSONB` type in the destination and inspect the raw JSON downstream. Otherwise, treat them as equivalent and move on.

### `UnicodeDecodeError` on a JSON file
**Cause.** The file is valid JSON but in an encoding other than UTF-8. Most common on JSON exported from Windows apps that default to Windows-1252.
**Fix.** Re-export the file as UTF-8 (the JSON spec technically requires it). If you can't, convert it locally before uploading: `iconv -f WINDOWS-1252 -t UTF-8 input.json > output.json`.

### Child tables aren't being created for nested arrays
**Cause.** The arrays are arrays of **scalars** (strings, numbers, booleans), not arrays of objects. Datanika only creates child tables for object arrays — scalar arrays stay inline as typed array columns.
**Fix.** If you want each scalar as a separate row, transform post-load in dbt using the destination's `UNNEST` / `LATERAL VIEW EXPLODE` / `jsonb_array_elements` function, depending on the warehouse.

### Directory watcher is re-loading the same file on every run
**Cause.** Same as the CSV troubleshooting entry — Datanika's processed-file tracker was cleared, or the file was renamed in place.
**Fix.** Check **Pipelines → `<your pipeline>` → Processed files** to see the tracked list. Best practice: upstream producers should write files with timestamp suffixes (`events-20260414-0300.jsonl`), not rotate in place.

## Related

- **Pipeline templates:** no JSON-specific template yet. The closest match is [CSV → DuckDB](/templates/csv-to-duckdb) — same flow, swap the source for JSON once the connection is configured.
- **Related file formats:** [CSV](/docs/connectors/csv) for flat tabular files, [Parquet](/docs/connectors/parquet) for columnar files with strict types. All three share the upload/directory-watcher UI.
- **Docs:** [File Uploads](/docs/file-uploads), [Uploads](/docs/uploads), [Pipelines](/docs/pipelines), [Self-Hosting](/docs/self-hosting)
- **Transformations:** the [Transformations guide](/docs/transformations-guide) has patterns for normalising flattened column names, extracting from `JSON` / `VARIANT` columns, and joining root + child tables after a JSON load.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **Connector reference:** full field-by-field [JSON connector spec](/connectors/json).
