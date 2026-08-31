# CSV setup-guide screenshots

Referenced from `src/content/connectors/csv.md` (source-only file connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 1 | The **New Connection** form with `csv` selected — the file-upload widget (**Choose File** / **Upload File**) + **Or enter file path** input. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `03-configure-upload.png` | Step 2 | The **New Upload** form at `/uploads`, filled in with a real CSV source (`15 — customerscsv (csv)`) and a real DuckDB destination (`14 — analyticswarehouse (duckdb)`). Captured 2026-07-22. Shows the **file-source shape** of the form: name, description, source, destination, batch size, Schema Contract — and **no** Load Mode / Write Disposition / Source schema / Table names, which are hidden for non-SQL sources. |
| `05-schedule.png` | Step 4 | The **New Schedule** form at `/schedules`, filled in for the same upload: target type `upload`, target name `customersdailyload`, cron `0 3 * * *`, timezone `UTC`. Captured 2026-07-22. |
| `04-first-run.png` | Step 3 | **Recaptured 2026-08-31 — it now shows the destination, not the run history.** The **Data preview** on `/models/7`, the model detail page for the landed `q3_signups` table: `Schema: q3signups`, ten typed columns, `Rows: 14`, and all fourteen rows with real values. Real CSV → Postgres load on production, run 11, in the **prod-verify** org, from a file put through the app's own **Upload File** widget. No credentials on screen. |
| | | 🚨 **It is no longer shared with the DuckDB guide.** The old shot was the `/runs` table and was byte-identical in both directories (`md5 622189bd…`). This one names a CSV schema and CSV columns, so `duckdb/04-first-run.png` is deliberately left as it was rather than being handed a picture of a load it did not do. **DuckDB still needs its own capture, and its current shot still fails the criterion.** |

## Verification

`verified_by: product-ui` / `verified_date: 2026-08-31`.

**2026-08-31 (Step 3 recapture, plus two guide defects the run exposed)** — driven end-to-end on production in the **prod-verify** org: connection **29** `q3signupsexport` (a 14-row CSV put through the app's **Upload File** widget), destination connection **28** `docswarehouse`, upload **13** `q3signups`, run **11** `success` / 14 rows / 4.1 s, catalog entry `/models/7`. Confirmed in the destination with `psql` on the box — `docs_warehouse.q3signups.q3_signups` holds 14 rows whose columns are `signup_id, company, contact_email, country, plan, seats, signed_up_on, mrr_usd`, i.e. **file contents, not a file listing**.

Two things the guide asserted that this run falsified:

1. 🚨 **"The table itself is named `csv`" is only true for the *path* branch — and the guide recommends the *upload* branch first.** With a file put through **Upload File**, `upload_tasks.py` sets `dlt_config["table_name"]` to the uploaded file's stem before the runner ever sees it, so `q3-signups.csv` lands as **`q3_signups`**. With a directory path, the glob is `*.csv`, `_file_table_name()` finds a wildcard, and it falls through to the connection type — **`csv`**. The discriminating evidence is a side-by-side in the live catalog: Docs-QA's path-based upload 7 produced `catalog_entries.table_name = 'csv'`; this upload produced `'q3_signups'`. Same connector, same code, different branch.
2. **The `delimiter` / `encoding` / `file_format` form fields exist.** The guide sent readers to **Use raw JSON config** and cited [core#499](https://github.com/datanika-io/datanika-core/issues/499) as open. **#499 closed 2026-07-22T12:55:34Z** — the same day this README was written, which is how the two passed each other. The New Upload form now renders **File Format** (`auto (detect from type or extension)`), **Delimiter (CSV)** and **Encoding** for a file source, verified on `origin/master` at `uploads.py:198–217` and observed live.

⚠️ **A closed issue cited in prose does not un-cite itself.** Both defects were invisible to every link check and every build, because a stale sentence is well-formed. The only thing that found them was running the connector.

**2026-07-19 (Step 1)** — field labels verified against the live shipped UI (`file_upload_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, the **Upload File** widget, and an **Or enter file path** input (plus the **Use raw JSON config** escape hatch). The type dropdown shows the lowercase key **`csv`**.

**2026-07-22 (Steps 1–4)** — the whole walkthrough was driven against production on the Docs-QA org. Four corrections, all verified live:

1. **Step 2 described a flow that does not exist.** The guide said "open the connection and click **Configure pipeline**". There is no such button — connection rows offer only Test / Edit / Copy / Delete. Extract-load is configured at **`/uploads`** as a **New Upload** with a source *and* a destination connection. Rewritten against the real form.
2. **No write disposition or target schema for a CSV source.** The guide documented choosing `replace` / `append` / `merge` and a target schema. Those selectors are hidden for every non-SQL source: `uploads.py` renders them under `rx.cond(~UploadState.form_is_non_sql_source, …)`, and `FILE_SOURCE_TYPES = {"s3", "csv", "json", "parquet"}` is part of `NON_SQL_SOURCE_TYPES`. Confirmed live — the block was visible with no source selected and disappeared when the CSV source was chosen.
3. **Schedules are their own page, with a raw cron.** The guide said "on the pipeline page, click **Schedule**", then pick Hourly / Every 6 hours / Daily at 03:00 / Manual only. The real form is at `/schedules`: target type, target **name**, a five-field cron expression, timezone. No cadence picker, no "manual only" (an unscheduled upload *is* manual-only). Schedule id 7 was created this way and went **Active**.
4. **Connection Name is normalized as you type.** Non-alphanumerics are stripped in the input itself — `customers-csv-export` became `customerscsvexport`, `customers_daily_load` became `customersdailyload`. The guide's hyphenated examples would silently not be what the user gets.

Also corrected: **Test Connection never checks a file path.** The guide claimed it verifies the file is reachable for a path input. `ConnectionService.test_connection` returns `(True, "Test not applicable for this type")` unconditionally for everything in `_NON_DB_TYPES`, which includes `CSV`, `JSON`, `PARQUET` and `S3`. Observed live with a valid path.

## Not captured

- `01-credentials.png` — not applicable; a CSV has no credential step.

## ✅ 2026-07-22 (later) — `04-first-run` captured; the three blockers are fixed and live

The earlier attempt was blocked three deep. All three are now closed and **verified running in prod**, so the capture went ahead:

| | Issue | Was | Now |
|---|---|---|---|
| 1 | [core#492](https://github.com/datanika-io/datanika-core/issues/492) (**P0**) | `csv`/`json`/`parquet`/`s3` loaded a **file listing** — a table called `filesystem` holding one row of `file_name`/`mime_type`/`size_in_bytes` | `_build_file_source` pipes the lister through a format reader (`lister \| reader`) and renames the result |
| 2 | [core#493](https://github.com/datanika-io/datanika-core/issues/493) | a glob matching **zero** files completed as `success` / 0 rows | the run **raises**, with a message that names the file-vs-directory case specifically |
| 3 | [core#494](https://github.com/datanika-io/datanika-core/issues/494) | DuckDB loads never reached the **Catalog** (`duckdb_engine` missing) | `duckdb_engine 0.17.0` in the image; the Catalog populates |

**The acceptance criterion this file set for itself was met** — *rows of real data in the destination, not a green run row.* Run **6** on prod (Docs-QA org, upload 7) returned `success` / **12 rows**, and the destination was then read directly:

```
customersdailyload.csv: 12 rows
columns: customer_id, full_name, email, country, signup_date, plan, lifetime_value_usd, _dlt_load_id, _dlt_id
(1001, 'Ada Lovelace', 'ada@example.com', 'GB', '2026-01-14', 'pro', 1840.0, …)
```

The stale `warehouse.duckdb` was deleted before the run — it still held the #492 wreckage (the `filesystem` table), which would otherwise have appeared in the Catalog.

> **The landed table is called `csv`, not `customers`.** `_file_table_name` uses the glob's stem only when the glob names exactly one file; the default `*.csv` has a wildcard, so it falls back to the connection type. The **schema** is named after the upload (`customersdailyload`). Documented in Step 3; `table_name` in the upload's raw JSON config overrides it.

## ✅ The file-path instruction is now corrected — once, correctly

Held on the previous pass because *"accepting a file path is a plausible fix for #493, which would make the correction wrong a second time."* **The fix went the other way**: `bucket_url` is still a directory, and `describe_empty_file_match()` now detects `os.path.isfile(bucket_url)` and tells the user to use the parent directory. So the field's semantics are settled and the prose is fixed in `csv.md`, `json.md`, `parquet.md` and `s3.md`.

Also corrected while here, all verified against `origin/master`:

- **CSV delimiter and encoding are *not* auto-detected.** The guide promised "best-effort detection" of both. `_build_format_reader` forwards `delimiter`/`encoding` to pandas **only when set**, and pandas' defaults are comma and UTF-8. Header row and column types *are* inferred. No form field exists for either knob ([core#499](https://github.com/datanika-io/datanika-core/issues/499)) — only the upload's raw JSON config.
- **`.jsonl` / `.ndjson` do not match the default `*.json` pattern** (json.md).
- **S3 must set a File Pattern with an extension** — the default `*` names no format and now fails outright rather than guessing (s3.md).
- **S3's Test Connection does not list the bucket.** `ConnectionType.S3` is in `_NON_DB_TYPES`, so it returns "Test not applicable for this type" unconditionally; the guide claimed it verified credentials (s3.md).

> **Provenance note.** The upload for these shots was created through the **Or enter file path** input rather than the browser upload widget, because `POST /_upload` returns HTTP 500 in production ([core#452](https://github.com/datanika-io/datanika-core/issues/452), fix in [core#455](https://github.com/datanika-io/datanika-core/pull/455)). That affects only how the file got attached; Steps 2–4 are identical either way, and neither screenshot shows the connection form.
