---
title: "Load Parquet Files into Datanika"
description: "Upload Parquet files into your warehouse with Datanika — drag and drop, watch a directory, or pull from a data lake. Columnar compression, strict types, zero inference."
source: "parquet"
source_name: "Parquet"
category: "file"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Apache Parquet is the "production-grade CSV" — a columnar file format with strict types baked into the file header, snappy/zstd/gzip compression, and row-group indexes that let readers skip data without reading it. If something in your stack emits Parquet (Spark, Polars, DuckDB, dbt, a data lake), you almost always want to move it around as Parquet rather than convert to CSV on the way. Datanika treats Parquet as a first-class source — drop a file, point at a directory, or wire up an S3 lake — and loads it **without any type inference**, because the file already tells Datanika exactly what every column is. This guide covers **local Parquet file uploads**, the zero-credentials walkthrough path for experimenting with the format.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported compression codecs, row-group pushdown behaviour, nested type handling, and the difference between this connector and the S3 Parquet ingestion flow — see the [Parquet connector page](/connectors/parquet).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. [DuckDB as destination](/docs/connectors/duckdb) is the zero-credentials option and is the most natural target for Parquet because DuckDB can read Parquet natively with the same type system.
- A **Parquet file** on your computer. Extensions: `.parquet` (standard), `.parq` (rare).
- Parquet tooling is bundled with Datanika — **no separate install needed**. You don't need Spark, the `parquet-tools` CLI, or anything else on your machine.

> **Unsure if your file is Parquet?** Open it with `hexdump -C file.parquet | head -1` — a valid Parquet file starts with the magic number `PAR1` and ends with it. CSV masquerading as Parquet is a surprisingly common data-lake footgun.

## Step 1a — Upload a file through the UI (the common case)

1. In Datanika, open **Connections → New connection**.
2. Select **Parquet** from the connector list (under the **File** category).
3. Drag your `.parquet` file into the drop zone, or click **Browse**.
4. Datanika reads the file's **footer metadata** (the last few KB of the file, where Parquet stores its schema) and you get:
   - **Column names and types** — read directly from the file, not inferred. A column declared `INT64` is `INT64`, full stop.
   - **Row group layout** — number of row groups and rows per group. Used later for parallel reads on large files.
   - **Compression** — detected per row group (usually `SNAPPY` or `ZSTD`); decoded transparently.
   - **Nested structures** — Parquet's `LIST` and `STRUCT` types are detected and flattened with the same rules as [JSON](/docs/connectors/json) (structs → `parent__child`, object arrays → child tables).
5. Preview the first 20 rows in the form. Notice that types are already correct — there's no "sniff the first N rows and guess" step here.
6. **Name** the connection, e.g. `spark-exports-2026-04` or `dbt-snapshot-customers`.
7. Click **Save**.

![Dragging a Parquet file into Datanika](/docs/connectors/parquet/01a-upload-ui.png)

> **Size.** The UI uploader handles Parquet files up to ~500 MB. Parquet compresses well (3–10× typical), so 500 MB on disk can easily represent 2–5 GB of raw data. For larger files, use the directory-watcher flow (Step 1b), or pull directly from S3 via the [S3 connector](/docs/connectors/s3).

## Step 1b — Watch a directory (self-hosted, recurring Parquet drops)

Use this for landing-zone patterns: a data lake, an hourly Spark export, a nightly dbt snapshot that drops a partitioned set of Parquet files into a shared directory.

1. Mount a directory into the `datanika-app` container read-only:
   ```yaml
   services:
     app:
       volumes:
         - /opt/datalake/raw:/var/datanika/parquet-lake:ro
   ```
2. Restart the container.
3. In Datanika, open **Connections → New connection → Parquet** and switch to the **Directory** tab.
4. Fill in:
   - **Directory path** — `/var/datanika/parquet-lake`.
   - **File glob** — `*.parquet`, or `year=*/month=*/day=*/*.parquet` for Hive-style partitioned lakes.
   - **Merge partitions** — check this if your glob matches many files that all have the same schema. Datanika will load them into a single destination table in one run.
5. Click **Test connection**. Datanika opens the first matching file, reads the footer, and shows you the schema. All files in the set are expected to share that schema.
6. Click **Save**.

> **Partition columns are preserved.** If your glob uses Hive-style partitioning (`year=2026/month=04/...`), Datanika extracts the partition values from the file path and lands them as extra columns in the destination table. You don't lose your partition keys by loading into a flat warehouse table.

## Step 2 — Configure the load

Parquet config is the simplest of the three file formats because type inference is a non-problem and the schema is stable.

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_parquet` for ad-hoc files and `raw_<pipeline-name>` for recurring lake drops.
3. For the load:
   - **Write disposition**
     - `replace` — drop and reload every run. Use for a single file that gets fully rewritten upstream.
     - `append` — add new rows. Use for partitioned drops where each file is a new partition, strictly disjoint from the previous.
     - `merge` — upsert on primary key. Use when the same record ID can appear in multiple files with updated values (e.g., CDC Parquet drops).
4. Save the pipeline configuration.

> **Type mapping tip.** Parquet has types that don't exist in every warehouse — `INT96` timestamps, `FIXED_LEN_BYTE_ARRAY` with arbitrary lengths, decimal logical types with large precision. Datanika picks the closest destination type (e.g., `INT96` → `TIMESTAMP`) but you can override per column in the **Schema** panel. Warehouses with weak type systems (SQLite, older MySQL) will lose some fidelity. Warehouses with strong type systems (BigQuery, Snowflake, DuckDB) preserve everything.

## Step 3 — First run

1. From the pipeline page, click **Run now**.
2. Parquet loads are **fast and memory-efficient** because Datanika streams row groups sequentially — a 2 GB compressed Parquet file (~8 GB raw) typically lands in under a minute, in under 500 MB of RAM.
3. Check the **Runs** tab for per-row-group progress. You'll see row counts stream in as each group is decoded and written to the destination.
4. When the run finishes, open **Catalog → `<your warehouse>` → `raw_parquet`** and browse the landed table. Spot-check by comparing `count(*)` against the Parquet footer's `num_rows` — they should match exactly, with no coercion losses.

![First run landing the Parquet](/docs/connectors/parquet/03-first-run.png)

## Step 4 — Schedule it (directory watchers only)

Same logic as CSV and JSON — one-shot uploads don't need a schedule, directory watchers do.

1. On the pipeline page, click **Schedule**.
2. Cadence choices:
   - **Every 15 minutes** — for a hot lake partition that's being appended to in real time.
   - **Hourly** — typical Spark/dbt export cadence.
   - **Daily at 03:00** — for nightly snapshot drops.
3. Choose a timezone and save.
4. Wire up failure alerts in **Settings → Notifications**. Schema drift in Parquet is rare (strict types prevent most of the CSV/JSON failure modes) but file corruption and missing partitions happen.

## Troubleshooting

### `Invalid: Parquet file size is 0 bytes`
**Cause.** The upstream producer wrote an empty file (usually because it crashed mid-write or the partition was logically empty for that run).
**Fix.** Have the producer skip writing zero-byte files, or add a glob exclusion to your directory-watcher config. Datanika will otherwise keep retrying the file and failing.

### `Schema mismatch between file A and file B in the same directory`
**Cause.** You're using a directory watcher with **Merge partitions** enabled, but the files have different schemas — a column was added upstream mid-batch, or two unrelated datasets got dropped into the same folder.
**Fix.** Split the directory into subfolders, one per schema, and use separate connections. Or rebuild the upstream producer to drop the new column into a new dataset entirely. Merging incompatible schemas is never safe — we'd rather fail loudly than silently pick one and drop columns.

### Timestamps are one hour off (or 24 hours off)
**Cause.** Parquet timestamps can be stored as `INT96` (legacy Spark), `TIMESTAMP_MILLIS`, `TIMESTAMP_MICROS`, or `TIMESTAMP_NANOS`, and some producers write **local time without a timezone**. Datanika reads what the file says — if the file says "local time, no TZ", that's what you get.
**Fix.** Fix it at the producer if you can (Spark: `spark.sql.parquet.int96AsTimestamp=true` and write with explicit UTC). If you can't, cast downstream in dbt: `SELECT ts AT TIME ZONE 'UTC' AS ts_utc FROM <table>`.

### Decimal columns are landing as strings
**Cause.** Your destination warehouse doesn't support the precision/scale in the Parquet file. SQLite and DuckDB have different limits, for example. Datanika falls back to string to avoid silent truncation.
**Fix.** Upgrade the destination if fidelity matters (DuckDB ≥ 0.9 handles up to 38 digits; BigQuery and Snowflake handle 38 natively). Otherwise cast to float downstream, accepting the precision loss.

### `Snappy decoding failed: invalid block`
**Cause.** The Parquet file was truncated or the Snappy blocks inside a row group are corrupted — usually a mid-write crash or a bad file transfer.
**Fix.** Re-copy the file from the source with a checksum check (`sha256sum` both sides). Parquet has per-row-group checksums but Datanika can only detect, not repair, corruption — you need a clean copy upstream.

## Related

- **Pipeline templates:** no Parquet-specific template yet. Parquet pairs naturally with [DuckDB as destination](/docs/connectors/duckdb) for an all-columnar local stack.
- **Related file formats:** [CSV](/docs/connectors/csv) for when you're stuck with flat text files from legacy tools, [JSON](/docs/connectors/json) for API exports and logs. Prefer Parquet over the other two whenever you control the producer — it's strictly better on type fidelity, compression, and load speed.
- **Data lakes:** if your Parquet files live in S3 (not on local disk), use the [S3 connector](/docs/connectors/s3) instead — it ingests Parquet from object storage directly, without a local bind mount.
- **Docs:** [File Uploads](/docs/file-uploads), [Pipelines](/docs/pipelines), [Self-Hosting](/docs/self-hosting)
- **Transformations:** see the [Transformations guide](/docs/transformations-guide) for patterns specific to columnar data — predicate-pushdown-friendly dbt models, partition pruning, and decimal handling.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran) — most competitors treat Parquet as an S3-only format; Datanika handles both local and S3-hosted.
- **Connector reference:** full field-by-field [Parquet connector spec](/connectors/parquet).
