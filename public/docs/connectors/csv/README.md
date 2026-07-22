# CSV setup-guide screenshots

Referenced from `src/content/connectors/csv.md` (source-only file connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 1 | The **New Connection** form with `csv` selected — the file-upload widget (**Choose File** / **Upload File**) + **Or enter file path** input. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `03-configure-upload.png` | Step 2 | The **New Upload** form at `/uploads`, filled in with a real CSV source (`15 — customerscsv (csv)`) and a real DuckDB destination (`14 — analyticswarehouse (duckdb)`). Captured 2026-07-22. Shows the **file-source shape** of the form: name, description, source, destination, batch size, Schema Contract — and **no** Load Mode / Write Disposition / Source schema / Table names, which are hidden for non-SQL sources. |
| `05-schedule.png` | Step 4 | The **New Schedule** form at `/schedules`, filled in for the same upload: target type `upload`, target name `customersdailyload`, cron `0 3 * * *`, timezone `UTC`. Captured 2026-07-22. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-22`.

**2026-07-19 (Step 1)** — field labels verified against the live shipped UI (`file_upload_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, the **Upload File** widget, and an **Or enter file path** input (plus the **Use raw JSON config** escape hatch). The type dropdown shows the lowercase key **`csv`**.

**2026-07-22 (Steps 1–4)** — the whole walkthrough was driven against production on the Docs-QA org. Four corrections, all verified live:

1. **Step 2 described a flow that does not exist.** The guide said "open the connection and click **Configure pipeline**". There is no such button — connection rows offer only Test / Edit / Copy / Delete. Extract-load is configured at **`/uploads`** as a **New Upload** with a source *and* a destination connection. Rewritten against the real form.
2. **No write disposition or target schema for a CSV source.** The guide documented choosing `replace` / `append` / `merge` and a target schema. Those selectors are hidden for every non-SQL source: `uploads.py` renders them under `rx.cond(~UploadState.form_is_non_sql_source, …)`, and `FILE_SOURCE_TYPES = {"s3", "csv", "json", "parquet"}` is part of `NON_SQL_SOURCE_TYPES`. Confirmed live — the block was visible with no source selected and disappeared when the CSV source was chosen.
3. **Schedules are their own page, with a raw cron.** The guide said "on the pipeline page, click **Schedule**", then pick Hourly / Every 6 hours / Daily at 03:00 / Manual only. The real form is at `/schedules`: target type, target **name**, a five-field cron expression, timezone. No cadence picker, no "manual only" (an unscheduled upload *is* manual-only). Schedule id 7 was created this way and went **Active**.
4. **Connection Name is normalized as you type.** Non-alphanumerics are stripped in the input itself — `customers-csv-export` became `customerscsvexport`, `customers_daily_load` became `customersdailyload`. The guide's hyphenated examples would silently not be what the user gets.

Also corrected: **Test Connection never checks a file path.** The guide claimed it verifies the file is reachable for a path input. `ConnectionService.test_connection` returns `(True, "Test not applicable for this type")` unconditionally for everything in `_NON_DB_TYPES`, which includes `CSV`, `JSON`, `PARQUET` and `S3`. Observed live with a valid path.

## Not captured

- `01-credentials.png` — not applicable; a CSV has no credential step.
- `04-first-run.png` — **still blocked. [core#456](https://github.com/datanika-io/datanika-core/issues/456) is fixed and promoted; the blocker is now [core#492](https://github.com/datanika-io/datanika-core/issues/492), one layer deeper.** Read the next section before attempting this again.

## ⚠️ 2026-07-22 — why `04-first-run` is *still* not capturable

#456 (every successful run marked FAILED) was fixed in core#464 and reached `master` in #481, so the original block genuinely lifted. A fresh run was triggered on prod (Docs-QA org, upload 7). It came back **`success`** — the first green run in the production database, which does confirm #464 works.

**It still cannot be photographed, because the run moves no data.** Three separate defects, all found in that one run:

| | Issue | What it does |
|---|---|---|
| 1 | [core#492](https://github.com/datanika-io/datanika-core/issues/492) (**P0**) | `csv`/`json`/`parquet`/`s3` sources load a **file listing**, not file contents. dlt's `filesystem()` is a lister; `_build_file_source` returns it with no `read_csv()` transformer. The landed table is called `filesystem` and holds one row of `file_name` / `mime_type` / `size_in_bytes` per file. Our 12-row `customers.csv` produced **zero** customer columns. |
| 2 | [core#493](https://github.com/datanika-io/datanika-core/issues/493) | A glob matching **zero** files completes as `success` with 0 rows. Connection 15 had `bucket_url` set to a full *file* path; `*.csv` is globbed *under* that value, so it matched nothing — silently. |
| 3 | [core#494](https://github.com/datanika-io/datanika-core/issues/494) | DuckDB loads never reach the **Catalog** (`duckdb_engine` missing from the image), so Step 3's "browse the new table" verification has never worked. |

A green run whose payload is a directory listing would document a broken flow as working — the same reason the previous session refused to screenshot the red run, one layer down.

**Do not capture this until #492 is fixed and promoted.** Green status is not the acceptance criterion; **rows of real data in the destination** is.

## ⚠️ The guide's file-path instruction is wrong, and the fix is deliberately deferred

Step 1 tells the user to enter `/var/datanika/inbox/customers.csv` in **Or enter file path**. That field is `bucket_url`, and the connector globs `*.csv` *underneath* it — so a path ending in a filename matches nothing. Measured in the prod worker against the real `filesystem()` source:

```
DIRECTORY  /app/dbt_projects/_docs_samples          -> 1 file(s) matched: ['customers.csv']
FILE       /app/dbt_projects/_docs_samples/customers.csv  -> 0 file(s) matched: []
```

The placeholder already says `/data/files or s3://...` (a directory), so the guide contradicts the form.

**Not corrected yet, on purpose.** The most natural fix for #493 is to *accept* a file path, which would make a docs correction wrong a second time. The prose changes once #492/#493 settle the field's semantics — same PR as the screenshot. `json.md`, `parquet.md` and `s3.md` carry the same error.

> **Provenance note.** The upload for these shots was created through the **Or enter file path** input rather than the browser upload widget, because `POST /_upload` returns HTTP 500 in production ([core#452](https://github.com/datanika-io/datanika-core/issues/452), fix in [core#455](https://github.com/datanika-io/datanika-core/pull/455)). That affects only how the file got attached; Steps 2–4 are identical either way, and neither screenshot shows the connection form.
