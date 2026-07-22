---
title: "Load Parquet Files into Datanika"
description: "Upload Parquet files into your warehouse with Datanika — drag and drop, watch a directory, or pull from a data lake. Columnar compression, strict types, zero inference."
source: "parquet"
source_name: "Parquet"
category: "file"
verified_by: "product-ui"
verified_date: "2026-07-22"
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

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page.
2. From the **type dropdown**, pick `parquet` (under the **File** category).
3. **Connection Name** — give it a label, e.g. `sparkexports202604` or `dbtsnapshotcustomers`. **The field strips anything that isn't a letter or a digit as you type**, so `spark-exports-2026-04` becomes `sparkexports202604`. Type the name you want to end up with.
4. In the **Upload File** section, drag your `.parquet` file into the upload area, or click the **Upload File** button to browse. (There's no in-form preview — the file is read when the pipeline runs.)
5. Click **Test Connection**, then **Create Connection**.

![Adding the Parquet connection in Datanika](/docs/connectors/parquet/02-add-connection.png)

> **How Datanika reads Parquet at load time.** When the pipeline runs, Datanika reads the file's **footer metadata** (where Parquet stores its schema) — none of this is configured on the form:
> - **Column names and types** — read directly from the file, not inferred. A column declared `INT64` is `INT64`, full stop.
> - **Compression** — detected per row group (usually `SNAPPY` or `ZSTD`) and decoded transparently.
> - **Nested structures** — Parquet's `LIST` and `STRUCT` types are flattened with the same rules as [JSON](/docs/connectors/json) (structs → `parent__child`, object arrays → child tables).

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
3. In Datanika, open **`/connections`**, pick `parquet` from the type dropdown.
4. Skip the file upload area. Below it, you'll see the **Or enter file path** input — enter the path to the **directory** inside the container:
   - **Or enter file path** — `/var/datanika/parquet-lake`. **A directory, not a file and not a glob.** Datanika matches `*.parquet` *inside* whatever you type, so a path ending in a filename or a pattern matches nothing.
5. Click **Test Connection** if you like, but it tells you nothing here: Parquet connections always return *"Test not applicable for this type"*. It does not open the file, read the footer, or show you the schema — that only happens when the load runs. The run itself now fails loudly if nothing matches, so a wrong path surfaces there rather than as a silent empty load.
6. Click **Create Connection**.

> **Partition columns are preserved.** If your glob uses Hive-style partitioning (`year=2026/month=04/...`), Datanika extracts the partition values from the file path and lands them as extra columns in the destination table. You don't lose your partition keys by loading into a flat warehouse table.

## Step 2 — Configure the load

Parquet config is the simplest of the three file formats because type inference is a non-problem and the schema is stable.

The connection alone moves nothing — the thing that reads the Parquet and writes it to your warehouse is an **upload**, and it lives on its own page rather than on the connection.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — other characters are stripped as you type), an optional **Description**, the **Source connection** from Step 1, and the **Destination connection** to land in. **Batch size** defaults to 10,000 rows.
3. Optionally set the **Schema Contract** — the **Tables** / **Columns** / **Data Type** dropdowns that decide whether a changed incoming shape evolves the destination or fails the run.
4. Click **Create Upload**. It appears below with status `draft`.

> **There is no write disposition or target schema for a Parquet source.** Datanika hides the **Load Mode** and **Write Disposition** selectors for every non-SQL source — files (`csv`, `json`, `parquet`, `s3`), SaaS APIs, MongoDB, Google Sheets, REST and Kafka. They appear only when the source is a SQL database. If you need `replace` vs `merge` semantics for a Parquet drop, express it in a dbt model downstream.

> **Type mapping tip.** Parquet has types that don't exist in every warehouse — `INT96` timestamps, `FIXED_LEN_BYTE_ARRAY` with arbitrary lengths, decimal logical types with large precision. Datanika picks the closest destination type (e.g., `INT96` → `TIMESTAMP`); if you need a different mapping, cast the column downstream in a dbt model. Warehouses with weak type systems (SQLite, older MySQL) will lose some fidelity. Warehouses with strong type systems (BigQuery, Snowflake, DuckDB) preserve everything.

## Step 3 — First run

1. On the **`/uploads`** row for your upload, click **Run**.
2. Parquet loads are **fast and memory-efficient** because Datanika streams row groups sequentially — a 2 GB compressed Parquet file (~8 GB raw) typically lands in under a minute, in under 500 MB of RAM.
3. Watch **`/runs`** for progress. You'll see row counts stream in as each group is decoded and written to the destination.
4. When the run finishes, open **Catalog → `<your warehouse>`** and browse the landed table. Spot-check by comparing `count(*)` against the Parquet footer's `num_rows` — they should match exactly, with no coercion losses.

## Step 4 — Schedule it (directory watchers only)

Same logic as CSV and JSON — one-shot uploads don't need a schedule, directory watchers do.

1. Open **`/schedules`** and use the inline **New Schedule** form. Set **Target type** to `upload` and **Target name** to the upload's saved name.
2. Enter a five-field **Cron expression** — there is no cadence picker, and leaving the upload unscheduled is what "manual only" means here:
   - `*/15 * * * *` — for a hot lake partition that's being appended to in real time.
   - `0 * * * *` — hourly, the typical Spark/dbt export cadence.
   - `0 3 * * *` — nightly snapshot drops at 03:00.
3. Set the **Timezone** (defaults to `UTC`; the cron is evaluated in it) and click **Create Schedule**. The row lands as **Active** and can be paused per row.
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
