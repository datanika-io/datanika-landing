---
title: "Connect a CSV File to Datanika"
description: "Load a CSV file into your warehouse with Datanika — drag it into the browser, or reference it by a filesystem path, pick a destination, run."
source: "csv"
source_name: "CSV"
category: "file"
verified_by: "product-ui"
verified_date: "2026-08-31"
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
2. From the **type dropdown** at the top of the form, pick `csv`. The form reshapes itself to show the CSV-specific fields.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `q3signupsexport` or `customers202604`. This is what shows up in the source and destination pickers. **The field strips anything that isn't a letter or a digit as you type** — hyphens, underscores and spaces silently disappear, so `q3-signups-export` becomes `q3signupsexport`. Type the name you want to end up with.
   - **File source** — choose one of the two inputs on the form:
     - **Upload File** — drag a `.csv` file into the dashed drop zone, or click the **Upload File** button and pick it from the OS file picker. Datanika uploads the file to your org's storage and uses it as the connection source.
     - **Or enter file path** — **this is a directory, not a file.** Give it a path the worker can reach (e.g. `/var/datanika/inbox`) or an object-store prefix (e.g. `s3://my-bucket/exports/`); Datanika then matches `*.csv` *inside* it. Pointing this at `/var/datanika/inbox/customers.csv` matches nothing, because the pattern is applied underneath whatever you type. Use this when the file isn't on your laptop — a host-mounted volume, an NFS share, or object storage the container has credentials for.
4. Click **Test Connection** if you like, but don't read anything into it: CSV connections always return *"Test not applicable for this type"*, **including when you gave it a path**. The button does not check that the directory exists or that anything in it is readable — that happens when the load runs.
5. Click **Create Connection**.

> **Name + file is all you get on the form.** The CSV Connection form has exactly three inputs: Name, Upload File, and Or enter file path (plus a **Use raw JSON config** escape hatch). There is no delimiter picker, no encoding picker, no header-row override and no column-type editor.
>
> **What actually happens at load time:** the header row and column types are inferred for you (the reader is pandas-backed, and it is good at this). **Delimiter and encoding are *not* auto-detected** — they default to comma and UTF-8. If your file is semicolon-delimited or Windows-1252, say so on the **upload**, which carries a **File Format** dropdown (defaulting to *auto — detect from type or extension*), a **Delimiter (CSV)** input (`, or ; or \t — leave empty for comma`) and an **Encoding** input (`utf-8, windows-1252, latin-1 — leave empty for utf-8`). These are real form fields now, on the New Upload form beneath the destination picker — you do **not** need the raw-JSON escape hatch for them ([core#499](https://github.com/datanika-io/datanika-core/issues/499) shipped 2026-07-22). For per-column type control, do it downstream in a dbt model.

> **Read-only bind mounts.** If you're pointing the path input at a directory on the host, mount it into the container read-only (`:ro` in `docker-compose.yml`). Datanika never writes back to a CSV source, and read-only makes that guarantee explicit.

![Adding the CSV connection in Datanika](/docs/connectors/csv/02-add-connection.png)

## Step 2 — Create the upload

A connection on its own moves nothing. The thing that actually reads the CSV and writes it to your warehouse is an **upload**, and it lives on its own page — not on the connection.

1. Open **`/uploads`**. As with connections, the **New Upload** form is already rendered on the page.
2. Fill in:
   - **Upload name** — same normalization as connection names: letters and digits only.
   - **Description** *(optional)* — worth writing, it's the only free text you get.
   - **Source connection** — pick the CSV connection from Step 1. Entries read `15 — customerscsv (csv)`, i.e. id, name, type.
   - **Destination connection** — the warehouse to land in. [DuckDB](/docs/connectors/duckdb) if you're following the zero-credentials path.
   - **Batch size** *(optional)* — defaults to 10,000 rows.
   - **Schema Contract** *(optional)* — three dropdowns, **Tables** / **Columns** / **Data Type**, that decide what happens when the incoming shape stops matching the destination. This is where you handle a CSV whose columns change upstream: leave it alone to let the schema evolve, or tighten it to make the run fail loudly instead of silently widening your table.
3. Click **Create Upload**. It appears in the table below with status `draft`.

![Configuring the CSV upload in Datanika](/docs/connectors/csv/03-configure-upload.png)

> **There is no write disposition, target schema, or table picker for a CSV source, and that is deliberate.** Datanika hides the **Load Mode** and **Write Disposition** selectors for every non-SQL source — files (`csv`, `json`, `parquet`, `s3`), SaaS APIs, MongoDB, Google Sheets, REST and Kafka. Those controls only appear when the source is a SQL database. A CSV lands as one table named after the upload; if you need `replace` vs `merge` semantics, do it in a dbt model downstream.

## Step 3 — First run

1. On the **`/uploads`** row for your upload, click **Run**.
2. Watch **`/runs`**. CSV loads are usually **fast**: Datanika streams rows directly into the destination, so a 100k-row file typically lands in seconds and a 10M-row file in a few minutes.
3. When the run finishes, open **Models** (`/models`) and browse the new table. It lands in a schema **named after the upload**. **The table's own name depends on which of Step 1's two inputs you used:**
   - **Upload File** — the table takes your file's name without its extension. `q3-signups.csv` lands as **`q3_signups`** (non-alphanumerics become underscores).
   - **Or enter file path** — the table is named **`csv`**, after the connector. The default pattern for a directory is `*.csv`, which matches many files rather than one, so there is no single filename to borrow.
   - Either way you can override it by setting `table_name` in the upload's **Use raw JSON config**.
4. **Open the table and click `Load first 100 rows`.** The **Data preview** on the model detail page runs a live `SELECT` against your destination, so the rows on screen are the rows in your warehouse.

![The Data preview on the landed q3_signups table, showing 14 rows read live from the destination warehouse](/docs/connectors/csv/04-first-run.png)

5. Spot-check by opening the CSV in a spreadsheet and comparing row counts and a handful of values against the preview. Type-inference failures usually show up as null or truncated cells and are easy to catch visually — a date column arriving as `VARCHAR` rather than `DATE` is the common one, and is a job for a dbt model downstream, not a bug.

> **A run that matches no files now fails, loudly.** If the path is wrong, the export never ran, or the pattern matches nothing, the run ends `failed` with a message naming the cause — including the specific case where the path points at a *file* rather than the directory containing it, which tells you the parent directory to use instead. It used to complete as `success` with zero rows ([core#493](https://github.com/datanika-io/datanika-core/issues/493)), which was indistinguishable from a healthy load.

## Step 4 — Schedule it

Schedules are their own page too, and they reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `customersdailyload`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option; leaving the upload unscheduled *is* manual-only. `0 3 * * *` is nightly at 03:00, `0 * * * *` hourly, `0 */6 * * *` every six hours.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone.
3. Click **Create Schedule**. It lands in the table as **Active**, with **Pause** available per row.

![Scheduling the CSV upload in Datanika](/docs/connectors/csv/05-schedule.png)

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

### The run fails with "File not found", even though Test Connection was happy
**Cause.** Test Connection never looked. It returns *"Test not applicable for this type"* for every file connector without touching the path, so a bad path is only discovered when the load runs. The usual reason the container can't see it: the file is on the host but not bind-mounted, the mount point is wrong, or permissions block the read.
**Fix.** Verify the path from inside the container *before* running: `docker exec -it datanika-app ls -l /var/datanika/inbox/customers.csv`. If the file isn't there, fix the bind mount (`docker-compose.yml` → `volumes:`) and restart. If it IS there but Datanika still can't open it, check file permissions (`chmod 644 <file>`). Note the path must be reachable from the **worker** too, not just the web container — they are separate containers, and the load runs in the worker.

## Related

- **Pipeline templates:** [CSV → DuckDB](/templates/csv-to-duckdb) is the prebuilt zero-credentials starter — it wires a CSV upload into a DuckDB destination in one click and is the recommended "first pipeline you ever run on Datanika".
- **Related file formats:** Datanika also handles [JSON](/connectors/json) and [Parquet](/connectors/parquet) files using the same Connection form flow as this guide — pick the one that matches your file extension.
- **Docs:** [File Uploads](/docs/file-uploads), [Uploads](/docs/uploads), [Getting Started](/docs/getting-started), [Pipelines](/docs/pipelines)
- **Transformations:** see the [Transformations guide](/docs/transformations-guide) for patterns that work well on CSV-loaded raw tables — dedup, date casting, schema stabilisation.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **Connector reference:** full field-by-field [CSV connector spec](/connectors/csv).
