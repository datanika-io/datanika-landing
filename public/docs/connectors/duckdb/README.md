# DuckDB setup-guide screenshots

Referenced from `src/content/connectors/duckdb.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `duckdb` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form at `/uploads` with a real DuckDB destination selected (`14 — analyticswarehouse (duckdb)`). Captured 2026-07-22. Shared with the CSV guide — it is the same screen and the same real upload, shown here for the destination side. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-22`.

**2026-07-18 (Step 2)** — field labels verified against the live shipped UI (`duckdb_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form has a single field: **Database Path** (required), plus **Connection Name** above. The type dropdown shows the lowercase key **`duckdb`**. Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: "Path to DuckDB file" → "Database Path", removed the fictional nav, "Save" → "Create Connection".

**2026-07-22 (Steps 2–5)** — a real DuckDB destination was created on prod (Docs-QA org, connection id 14) and a real upload landed into it. Corrections:

1. **Steps 3–5 described a "pipeline page" flow that does not exist.** "Open the pipeline… set the destination… click **Run now**… click **Schedule**" — none of those controls are there. `/pipelines` is the **dbt/transform** builder (dbt command, models, selector); extract-load lives at `/uploads`, runs are triggered from the upload row's **Run** button, and schedules are created at `/schedules`. Rewritten against the real screens.
2. **Write disposition depends on the source, not on DuckDB.** The guide said "the source connector's existing settings still apply — write disposition, primary key, incremental cursor. DuckDB honors all of them." The selectors are rendered under `rx.cond(~UploadState.form_is_non_sql_source, …)`, so they exist only for SQL-database sources and are hidden for files, SaaS, MongoDB, Google Sheets, REST and Kafka. Reframed as a property of the source.
3. **Connection Name is normalized as you type** — non-alphanumerics are stripped in the input, so the guide's `duckdb-analytics` example silently became `duckdbanalytics`. Corrected.
4. **Schedule step rewritten** to the real form: target type, target **name**, five-field cron, timezone. No cadence picker; an unscheduled upload is what "manual only" means.

## Not captured

- `01-credentials.png` — not applicable; DuckDB is a local file path with no credential step.
- `04-first-run.png` — **blocked on [core#456](https://github.com/datanika-io/datanika-core/issues/456)**: every successful run is currently flipped to FAILED by a `TypeError` in the run-completion hook, so there is no green run to photograph. Capture once #456 is fixed and promoted.
