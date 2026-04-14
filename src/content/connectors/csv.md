---
title: "Load CSV Files into Datanika"
description: "Upload CSV files into your warehouse with Datanika — drag and drop a local file or point at a directory, pick a destination, run. Delimiters and types are auto-detected."
source: "csv"
source_name: "CSV"
category: "file"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

CSV is the universal escape hatch. Every SaaS tool exports it, every analyst has a folder of them, and every "can you just give me this data?" request ends with one. Datanika treats CSVs as first-class sources — drag a file into the browser, pick a destination, hit run. No API credentials, no schema modeling, no sandbox account. This is the fastest path from a file on your laptop to a queryable warehouse table. This guide covers **local CSV file uploads**, which is the zero-credentials onboarding path most new users start with.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported encodings, delimiter list, type inference rules, and how JSON and Parquet differ — see the [CSV connector page](/connectors/csv).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. If you're just experimenting, [DuckDB as destination](/docs/connectors/duckdb) is the zero-credentials option — together with this guide it's the fastest way to go from CSV to SQL without leaving your laptop.
- A **CSV file** on your computer. UTF-8 is preferred but Latin-1, Windows-1252, and BOM-prefixed UTF-8 are detected automatically. Common extensions: `.csv`, `.tsv`, `.txt`.
- For the directory-watcher path (Step 1b): **self-hosted Datanika** with a mounted volume you can drop files into.

## Step 1a — Upload a file through the UI (the common case)

This is the zero-friction path and the one the Getting Started checklist points you at.

1. In Datanika, open **Connections → New connection**.
2. Select **CSV** from the connector list (it lives under the **File** category — filter by that if the list is long).
3. Drag your `.csv` file into the drop zone, or click **Browse** and pick it from the OS file picker. You can drop multiple files at once — Datanika treats each as a separate table.
4. Datanika uploads the file to your org's storage and runs a sniff on the first ~64 KB:
   - **Delimiter** — auto-detected (`,`, `;`, `\t`, `|`).
   - **Quote character** — auto-detected, defaults to `"`.
   - **Encoding** — auto-detected.
   - **Header row** — detected by heuristic; override if Datanika guesses wrong.
   - **Column types** — inferred from a sample (integer, float, boolean, timestamp, string).
5. Preview the first 20 rows in the form. Fix any column whose type got inferred wrong (clicking the column header gives you a dropdown).
6. **Name** the connection — a label you'll recognize, e.g. `q3-signups-export` or `customers-2026-04`.
7. Click **Save**.

![Dragging a CSV file into Datanika](/docs/connectors/csv/01a-upload-ui.png)

> **File size guidance.** The UI uploader is fine up to ~500 MB per file. Above that, use Step 1b (directory watcher) — it streams from disk instead of pushing the whole file through the browser.

## Step 1b — Watch a directory (self-hosted, recurring loads)

Use this when you have files arriving on disk on a schedule — e.g., a nightly export from another tool, a vendor's SFTP drop, or a shared network folder.

1. On self-hosted Datanika, mount a directory into the `app` container so Datanika can see the files:
   ```yaml
   services:
     app:
       volumes:
         - /opt/datanika/inbox:/var/datanika/inbox:ro
   ```
2. Restart the container to pick up the new mount.
3. In Datanika, open **Connections → New connection → CSV**.
4. Switch to the **Directory** tab (next to **Upload**).
5. Fill in:
   - **Directory path** — `/var/datanika/inbox` (from the bind mount).
   - **File glob** — e.g. `*.csv` (default) or `exports/**/customers-*.csv` for recursive matches.
   - **Delimiter / encoding / header row** — as in Step 1a. These apply to every file matching the glob; files with different shapes need their own connection.
6. Click **Test connection**. Datanika lists the files that currently match the glob and you can spot-check by opening one in the row preview.
7. Click **Save**.

> **Read-only mount.** Always mount source directories read-only (`:ro`). Datanika never writes back to a CSV source, and read-only makes that guarantee explicit — it also stops a buggy transformation from accidentally overwriting your vendor's drop folder.

## Step 2 — Configure the load

CSV connections are usually one file → one table, so configuration is lighter than for databases. You still get to pick how loads behave.

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_uploads` for ad-hoc files and `raw_<vendor>` for recurring drops from a specific source.
3. For each file/table:
   - **Write disposition**
     - `replace` — drops and reloads the target table on every run. The right choice for "here's the latest export" files where the file is the source of truth.
     - `append` — adds new rows to the existing table. Use when files are **disjoint** (e.g., one file per day, never overlapping).
     - `merge` — upserts changed rows. Use when files overlap and you need dedup; requires a primary key.
4. For directory watchers: set a **file filter** to skip files you've already processed. Datanika tracks the loaded file list per pipeline by default, so re-runs only pick up new files.
5. Save the pipeline configuration.

> **Schema drift.** If the CSV's columns change between loads (a column added, removed, or renamed upstream), Datanika flags the drift on the next run rather than silently breaking. You can opt in to automatic schema evolution per pipeline if you trust the source — it's off by default.

## Step 3 — First run

1. From the pipeline page, click **Run now**.
2. Watch the **Runs** tab. CSV loads are usually **fast**: Datanika streams rows directly into the destination, so a 100k-row file typically lands in seconds and a 10M-row file in a few minutes.
3. When the run finishes, open **Catalog → `<your warehouse>` → `raw_uploads`** and browse the new table.
4. Spot-check by opening the CSV in a spreadsheet and comparing row counts and a handful of values — type inference failures usually show up as null or truncated cells and are easy to catch visually.

![First run landing the CSV](/docs/connectors/csv/03-first-run.png)

## Step 4 — Schedule it (directory watchers only)

UI-uploaded files are one-shot — you uploaded a specific file, you load it once, you're done. Scheduling only makes sense for the directory-watcher flow.

1. On the pipeline page, click **Schedule**.
2. Pick a cadence that matches how often new files land in the directory:
   - **Hourly** — near-real-time for hot drop folders.
   - **Every 6 hours** — typical vendor export cadence.
   - **Daily at 03:00** — for nightly SFTP drops or end-of-day exports.
3. Choose a timezone and save.
4. Wire up failure alerts in **Settings → Notifications** so schema drift or missing files surface immediately.

## Troubleshooting

### `UnicodeDecodeError` or garbled characters in text columns
**Cause.** Datanika's encoding sniffer got the wrong answer — usually because the file is mostly ASCII with a few non-ASCII bytes in the tail. Common for exports from legacy Windows apps that produce Windows-1252 files with a `.csv` extension.
**Fix.** Override the encoding in the connection form (`Encoding: windows-1252` or `Encoding: latin-1`). If you control the upstream, re-export as UTF-8 — it's the safest long-term choice.

### Columns are all landing in a single column in the warehouse
**Cause.** The delimiter sniffer guessed wrong — usually a semicolon-delimited file (`;` — common in European locales) got detected as comma.
**Fix.** Override the **Delimiter** field in the connection form to the actual delimiter. If you see this pattern on every file from a specific tool, set the delimiter explicitly so future loads don't rely on auto-detection.

### `Conflicting types for column <name>`
**Cause.** Datanika inferred one type from the first sniff sample, but later rows contain values that don't match — e.g., a column sniffed as `INTEGER` contains `"N/A"` in row 10,000.
**Fix.** Either clean the source (`sed 's/N\/A//g' file.csv > cleaned.csv` before upload) or set the column type explicitly to `TEXT` in the connection form and coerce downstream in dbt. `TEXT` never fails, just postpones the cleaning problem.

### Date columns are landing as strings
**Cause.** The date format in the CSV doesn't match any of Datanika's recognized patterns (`YYYY-MM-DD`, ISO-8601, `MM/DD/YYYY`, `DD/MM/YYYY` disambiguated by sample, Unix epoch). Ambiguous formats (is `03/04/2026` March or April?) are parsed as string to avoid silent data corruption.
**Fix.** Add an explicit **Date format** override in the connection form using Python `strftime` syntax (e.g., `%d/%m/%Y`). If the format varies within the file, cast in dbt — don't try to force it at load time.

### Directory watcher is re-loading the same file on every run
**Cause.** Datanika's processed-file tracker was cleared, or you renamed/moved the file so the tracker no longer matches.
**Fix.** Check **Pipelines → `<your pipeline>` → Processed files** to see what Datanika thinks it's already loaded. If the list is stale or empty, the fix is usually to rename new files with a timestamp suffix and keep the full history in the tracked list, instead of rotating in place.

### Upload fails with "File too large"
**Cause.** You're hitting the ~500 MB UI uploader limit.
**Fix.** Switch to the directory-watcher flow (Step 1b) on self-hosted, or split the file with `split -l 500000 big.csv part_` and upload the parts as an append pipeline. On Datanika Cloud, [open a ticket](mailto:support@datanika.io) if you need a one-time larger upload.

## Related

- **Pipeline templates:** [CSV → DuckDB](/templates/csv-to-duckdb) is the prebuilt zero-credentials starter — it wires a CSV upload into a DuckDB destination in one click and is the recommended "first pipeline you ever run on Datanika".
- **Related file formats:** Datanika also handles [JSON](/connectors/json) and [Parquet](/connectors/parquet) files using the same UI upload and directory-watch flows as this guide — pick the one that matches your file extension.
- **Docs:** [File Uploads](/docs/file-uploads), [Uploads](/docs/uploads), [Getting Started](/docs/getting-started), [Pipelines](/docs/pipelines)
- **Transformations:** see the [Transformations guide](/docs/transformations-guide) for patterns that work well on CSV-loaded raw tables — dedup, date casting, schema stabilisation.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **Connector reference:** full field-by-field [CSV connector spec](/connectors/csv).
