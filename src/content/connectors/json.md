---
title: "Load JSON Files into Datanika"
description: "Upload JSON and JSON Lines files into your warehouse with Datanika — drag a file, point at a directory, or tail a log stream. Nested structures, real types, zero credentials."
source: "json"
source_name: "JSON"
category: "file"
verified_by: "draft-pending-verification"
verified_date: null
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

1. In Datanika, open **Connections → New connection**.
2. Select **JSON** from the connector list (under the **File** category).
3. Drag your `.json` / `.jsonl` / `.ndjson` file into the drop zone, or click **Browse**.
4. Datanika sniffs the first few records and detects:
   - **Format** — JSON document vs JSON Lines, based on whether the first non-whitespace character is `[` or `{`.
   - **Record shape** — a union of keys seen across the sample. If your records have varying shapes, every key seen at least once becomes a nullable column.
   - **Nested structure** — objects are flattened with `__` separators (e.g., `customer.address.city` → `customer__address__city`). Arrays of scalars become a single column of typed array; arrays of objects get their own child table.
   - **Types** — taken directly from JSON values. No inference heuristics are needed, because the format already distinguishes `42` (integer), `42.0` (float), `"42"` (string), `true` (boolean), and `null`.
5. Preview the first 20 rows in the form. Flattened column names will look a little ugly — that's expected, you fix the readable names in dbt downstream.
6. **Name** the connection, e.g. `api-logs-2026-04` or `segment-export-q1`.
7. Click **Save**.

![Dragging a JSON file into Datanika](/docs/connectors/json/01a-upload-ui.png)

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
3. In Datanika, open **Connections → New connection → JSON** and switch to the **Directory** tab.
4. Fill in:
   - **Directory path** — `/var/datanika/inbox-json`.
   - **File glob** — `*.jsonl` (or `logs-*.ndjson`, `events/**/*.json`, etc.).
   - **Format hint** — `jsonlines` or `document`. Leave blank for auto-detect per file.
5. Click **Test connection**. Datanika lists matching files and previews the first record of the oldest one.
6. Click **Save**.

> **Read-only mount.** Always mount source directories with `:ro`. Datanika never writes to a JSON source, and the read-only flag is an explicit guarantee for the upstream producer.

## Step 2 — Configure the load

JSON connections are almost always one file (or one directory) → one table. Nested child tables (arrays of objects) land alongside the root table with a foreign key.

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_<source>` (e.g., `raw_segment`, `raw_mixpanel`, `raw_api_logs`).
3. For the root table:
   - **Write disposition**
     - `replace` — drop and reload on every run. Use for full exports where each file is the new source of truth.
     - `append` — add new rows. Use for log drops where each file is strictly new events.
     - `merge` — upsert on primary key. Use when the same `id` can appear in multiple files with updated values.
   - **Primary key** — pick a field that uniquely identifies a record (usually `id`, `uuid`, or `event_id`).
4. For any **arrays of objects** Datanika discovered, a child table is configured automatically. You can disable it if you don't care about that branch of the tree.
5. Save the pipeline configuration.

> **Flattening is opinionated.** Nested objects become `parent__child` columns. Arrays of scalars become typed array columns (`ARRAY<STRING>`, etc.) where the destination supports them, or comma-joined strings where it doesn't. Arrays of objects always become child tables — Datanika never embeds an object array in a single cell, because that's impossible to query efficiently in most warehouses.

## Step 3 — First run

1. From the pipeline page, click **Run now**.
2. Watch the **Runs** tab. JSON Lines streams incrementally, so even a 5 GB log file won't blow up memory — Datanika processes it in constant memory and emits rows as they're parsed.
3. When the run finishes, open **Catalog → `<your warehouse>` → `raw_<source>`** and you'll see the root table plus any child tables created from nested arrays.
4. Spot-check: open the source file in a text editor, copy one record, and verify its flattened columns landed correctly in the warehouse.

![First run landing the JSON](/docs/connectors/json/03-first-run.png)

## Step 4 — Schedule it (directory watchers only)

UI-uploaded files are one-shot. Scheduling is only meaningful for the directory-watcher flow from Step 1b.

1. On the pipeline page, click **Schedule**.
2. Match the cadence to the upstream producer:
   - **Every 15 minutes** — for hot log directories where freshness matters.
   - **Hourly** — the sweet spot for API export drops.
   - **Daily at 03:00** — for end-of-day batch dumps from legacy systems.
3. Choose a timezone and save.
4. Wire up failure alerts in **Settings → Notifications** so malformed files or missing drops surface immediately.

## Troubleshooting

### `Invalid JSON: Expecting value: line 1 column 1 (char 0)`
**Cause.** The file isn't valid JSON at all — often it's a JSON Lines file saved with a `.json` extension, so Datanika tried to parse it as a single document and choked on the second object.
**Fix.** Rename the file to `.jsonl` (or set the **Format hint** field to `jsonlines` in Step 1b). The two formats are distinct — `.json` must have an outer `[...]`, `.jsonl` must not.

### Root table has a column named `null` or one record is missing a field
**Cause.** Missing keys and explicit `null` values are distinct in JSON but land identically in most warehouses (as SQL `NULL`). Datanika preserves the distinction in the raw column by using `null` the value for explicit nulls, and omitting the key entirely for missing ones — but you lose that distinction once it's in a typed column.
**Fix.** If the difference matters for you (rare — usually only for schema-level data quality metrics), switch the column to `JSON` / `VARIANT` / `JSONB` type in the destination and inspect the raw JSON downstream. Otherwise, treat them as equivalent and move on.

### `UnicodeDecodeError` on a JSON file
**Cause.** The file is valid JSON but in an encoding other than UTF-8. Most common on JSON exported from Windows apps that default to Windows-1252.
**Fix.** Re-export the file as UTF-8 (the JSON spec technically requires it). If you can't, override the encoding in the connection form, same as the CSV workflow.

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
