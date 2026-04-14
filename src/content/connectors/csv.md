---
title: "Connect a CSV File to Datanika"
description: "Load a CSV file into your warehouse with Datanika — drag it into the browser, or reference it by a filesystem path, pick a destination, run."
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

CSV is the universal escape hatch. Every SaaS tool exports it, every analyst has a folder of them, and every "can you just give me this data?" request ends with one. Datanika treats a CSV file as a first-class source: drag a file into the browser or point at a path on the server, pick a destination, hit run. No API credentials, no schema modeling, no sandbox account. This is the fastest path from a file to a queryable warehouse table.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported encodings, delimiter handling, type inference, and how JSON and Parquet differ — see the [CSV connector page](/connectors/csv).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. If you're just experimenting, [DuckDB as destination](/docs/connectors/duckdb) is the zero-credentials option — together with this guide it's the fastest way to go from CSV to SQL without leaving your laptop.
- A **CSV file**, either sitting on your laptop (to upload through the browser) or at a filesystem path the `datanika-app` container can reach. UTF-8 is preferred but Latin-1, Windows-1252, and BOM-prefixed UTF-8 are handled by the loader at runtime. Common extensions: `.csv`, `.tsv`, `.txt`.

## Step 1 — Create the CSV Connection

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **CSV**. The form reshapes itself to show the CSV-specific fields.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `q3-signups-export` or `customers-2026-04`. This is what shows up in pipeline pickers.
   - **File source** — choose one of the two inputs on the form:
     - **Upload File** — drag a `.csv` file into the dashed drop zone, or click the **Upload File** button and pick it from the OS file picker. Datanika uploads the file to your org's storage and uses it as the connection source.
     - **Or enter file path** — fill this text input with a path the `datanika-app` container can reach (e.g., `/var/datanika/inbox/customers.csv`), or an object-store URI (e.g., `s3://my-bucket/exports/customers.csv`). Use this when the file isn't on your laptop — it's on a host-mounted volume, an NFS share, or object storage that the container has credentials for.
4. Click **Test Connection**. Datanika resolves the file (reading from the uploaded blob or opening the path) and reports success or an error.
5. Click **Create Connection**.

> **Name + file is all you get on the form.** The CSV Connection form has exactly three inputs: Name, Upload File, and Or enter file path (plus a **Use raw JSON config** escape hatch for advanced cases). There's no delimiter picker, no encoding picker, no header-row override, and no column-type editor on the form itself — the loader handles all of that at pipeline runtime with best-effort detection. If you need per-column control over types, do it downstream in a dbt model.

> **Read-only bind mounts.** If you're pointing the path input at a directory on the host, mount it into the container read-only (`:ro` in `docker-compose.yml`). Datanika never writes back to a CSV source, and read-only makes that guarantee explicit.

## Step 2 — Configure the pipeline

CSV connections are usually one file → one table, so configuration is lighter than for databases. You still get to pick how loads behave.

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_uploads` for ad-hoc files and `raw_<vendor>` for recurring drops from a specific source.
3. For each file/table, pick a **Write disposition**:
   - `replace` — drops and reloads the target table on every run. The right choice for "here's the latest export" files where the file is the source of truth.
   - `append` — adds new rows to the existing table. Use when files are **disjoint** (e.g., one file per day, never overlapping).
   - `merge` — upserts changed rows. Use when files overlap and you need dedup; requires a primary key.
4. Save the pipeline configuration.

> **Schema drift.** If the CSV's columns change between loads (a column added, removed, or renamed upstream), Datanika flags the drift on the next run rather than silently breaking. You can opt in to automatic schema evolution per pipeline if you trust the source — it's off by default.

## Step 3 — First run

1. From the pipeline page, click **Run now**.
2. Watch the **Runs** tab. CSV loads are usually **fast**: Datanika streams rows directly into the destination, so a 100k-row file typically lands in seconds and a 10M-row file in a few minutes.
3. When the run finishes, open **Catalog → `<your warehouse>` → `raw_uploads`** and browse the new table.
4. Spot-check by opening the CSV in a spreadsheet and comparing row counts and a handful of values — type inference failures usually show up as null or truncated cells and are easy to catch visually.

![First run landing the CSV](/docs/connectors/csv/03-first-run.png)

## Step 4 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence that matches how the source file gets refreshed:
   - **Hourly** — near-real-time for frequently refreshed files.
   - **Every 6 hours** — typical vendor export cadence.
   - **Daily at 03:00** — for nightly exports or end-of-day drops.
   - **Manual only** — for one-shot ad-hoc loads. Perfectly reasonable for a file you uploaded once and only need to reload on demand.
3. Choose a timezone and save.
4. Wire up failure alerts in **Settings → Notifications** so schema drift or missing files surface immediately.

## Troubleshooting

### `UnicodeDecodeError` or garbled characters in text columns
**Cause.** Datanika's encoding detection picked the wrong codec — usually because the file is mostly ASCII with a few non-ASCII bytes in the tail. Common for exports from legacy Windows apps that produce Windows-1252 files with a `.csv` extension.
**Fix.** Re-export the source as UTF-8 if you control the upstream tool — that's the safest long-term choice. If you can't, convert the file locally before uploading: `iconv -f WINDOWS-1252 -t UTF-8 input.csv > output.csv`.

### Columns all landing in a single column in the warehouse
**Cause.** The delimiter detection guessed wrong — usually a semicolon-delimited file (`;`, common in European locales) that got detected as comma, or vice versa.
**Fix.** Normalize the delimiter in the source file before uploading: `tr ';' ',' < input.csv > output.csv` (or the other way round). If you see the same pattern on every file from a specific tool, automate the conversion in your export step.

### `Conflicting types for column <name>`
**Cause.** The loader inferred one type from the first sample, but later rows contain values that don't match — e.g., a column inferred as `INTEGER` contains `"N/A"` in row 10,000.
**Fix.** Clean the source before upload (`sed 's/N\/A//g' file.csv > cleaned.csv`), or let the column land as `TEXT` and cast it in a dbt model downstream. `TEXT` never fails to load — it just postpones the cleaning problem to a place where you have full SQL.

### Date columns landing as strings in the warehouse
**Cause.** The date format in the CSV doesn't match the loader's recognized patterns (`YYYY-MM-DD`, ISO-8601, `MM/DD/YYYY`, `DD/MM/YYYY` disambiguated by sample, Unix epoch). Ambiguous formats (is `03/04/2026` March or April?) are parsed as string to avoid silent data corruption.
**Fix.** Cast in a dbt model downstream — `to_date(<col>, 'DD/MM/YYYY')` or the equivalent for your warehouse. Don't try to force it at load time; dbt gives you full visibility into the parse rule.

### Test Connection fails with "File not found" for a path input
**Cause.** The `datanika-app` container can't see the path — usually because the file is on the host but not bind-mounted, or the mount point is wrong, or permissions block the read.
**Fix.** Verify the path is visible from inside the container: `docker exec -it datanika-app ls -l /var/datanika/inbox/customers.csv`. If the file isn't there, fix the bind mount (`docker-compose.yml` → `volumes:`) and restart. If it IS there but Datanika still can't open it, check file permissions (`chmod 644 <file>`).

## Related

- **Pipeline templates:** [CSV → DuckDB](/templates/csv-to-duckdb) is the prebuilt zero-credentials starter — it wires a CSV upload into a DuckDB destination in one click and is the recommended "first pipeline you ever run on Datanika".
- **Related file formats:** Datanika also handles [JSON](/connectors/json) and [Parquet](/connectors/parquet) files using the same Connection form flow as this guide — pick the one that matches your file extension.
- **Docs:** [File Uploads](/docs/file-uploads), [Uploads](/docs/uploads), [Getting Started](/docs/getting-started), [Pipelines](/docs/pipelines)
- **Transformations:** see the [Transformations guide](/docs/transformations-guide) for patterns that work well on CSV-loaded raw tables — dedup, date casting, schema stabilisation.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **Connector reference:** full field-by-field [CSV connector spec](/connectors/csv).
