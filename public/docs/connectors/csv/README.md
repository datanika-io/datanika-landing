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
- `04-first-run.png` — **blocked on [core#456](https://github.com/datanika-io/datanika-core/issues/456)**. The load was created and executed on prod, but every successful run is currently flipped to FAILED by a `TypeError` in the `run.upload_completed` hook, so there is no green run to photograph. Capture this once #456 is fixed and promoted — do not screenshot the failed state.

> **Provenance note.** The upload for these shots was created through the **Or enter file path** input rather than the browser upload widget, because `POST /_upload` returns HTTP 500 in production ([core#452](https://github.com/datanika-io/datanika-core/issues/452), fix in [core#455](https://github.com/datanika-io/datanika-core/pull/455)). That affects only how the file got attached; Steps 2–4 are identical either way, and neither screenshot shows the connection form.
