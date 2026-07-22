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
- `04-first-run.png` — **still blocked. [core#456](https://github.com/datanika-io/datanika-core/issues/456) is fixed and promoted; the blockers are now [core#492](https://github.com/datanika-io/datanika-core/issues/492) and [core#494](https://github.com/datanika-io/datanika-core/issues/494).** See below.

## ⚠️ 2026-07-22 — why `04-first-run` is *still* not capturable

A fresh run on prod (Docs-QA org, upload 7 → connection 14) returned **`success`** — the first green run in the production database, confirming core#464 fixed #456. It still cannot be photographed:

- **[core#492](https://github.com/datanika-io/datanika-core/issues/492) (P0)** — the CSV *source* loads a file **listing**, not contents, so what lands in `warehouse.duckdb` is one row of `file_name` / `mime_type` / `size_in_bytes`, not the 12 customers. Verified by reading the file directly with `duckdb.connect(...)` in the worker.
- **[core#494](https://github.com/datanika-io/datanika-core/issues/494)** — **Step 4's verification instruction has never worked for DuckDB.** The guide says "open **Catalog → DuckDB** and browse the landed tables"; the catalog sync dies on `NoSuchModuleError: Can't load plugin: sqlalchemy.dialects:duckdb` (the `duckdb_engine` dialect is not in the image) and is swallowed as *"Catalog sync failed (non-fatal)"*. Models stays empty. Data Preview (core#260) is unreachable for DuckDB for the same reason.
- **[core#493](https://github.com/datanika-io/datanika-core/issues/493)** — a zero-match glob completes as `success`, which is how #492 stayed invisible.

**Do not capture until #492 + #494 are fixed and promoted.** The acceptance criterion is rows of real data visible in the Catalog, not a green run row.

> **Probing DuckDB on the box:** use `/app/.venv/bin/python`, not `python` — the system interpreter has none of the app's packages and reports `ModuleNotFoundError: No module named 'duckdb'`, which reads like a far bigger outage than it is. Also note the live prod app container is currently **`datanika-app-b`** (blue/green), so `docker exec datanika-app …` — the command printed in Step 4 of the guide — fails on prod. It remains correct for a self-hoster running the stock compose file.
