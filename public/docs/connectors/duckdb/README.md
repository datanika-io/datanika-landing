# DuckDB setup-guide screenshots

Referenced from `src/content/connectors/duckdb.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `duckdb` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form at `/uploads` with a real DuckDB destination selected (`14 — analyticswarehouse (duckdb)`). Captured 2026-07-22. Shared with the CSV guide — it is the same screen and the same real upload, shown here for the destination side. |
| `04-first-run.png` | Step 4 | 🔴 **Still the `/runs` table, and it still FAILS the acceptance criterion.** A real CSV → DuckDB load on production (run 6, `success`, 12 rows, 2026-07-22), but a run status is not evidence that data arrived — see [landing#395](https://github.com/datanika-io/datanika-landing/issues/395). Its alt text now says what it is instead of implying more. **No longer shared with the CSV guide**: csv's was recaptured 2026-08-31 and the two images (previously byte-identical, `md5 622189bd…`) now differ. This one was deliberately left alone rather than handed a picture of a load DuckDB did not do. |

## 🔴 Not yet captured — and it is blocked on a product defect, not on effort

`04-first-run.png` **could not be recaptured on 2026-08-31** with the other four guides, and the reason is worth more than the screenshot: **[core#793](https://github.com/datanika-io/datanika-core/issues/793)**.

The guide's recommended path, `/var/datanika/duckdb/analytics.duckdb`, is on **no volume and in no container image**. Measured on prod that day: `datanika-app-b` and `datanika-celery` each mount exactly two shared volumes (`/app/dbt_projects`, `/app/uploaded_files`), neither is `/var/datanika`, and the string appears nowhere in `docker-compose.yml`. The load runs in the worker; the Data preview and SQL Editor run in the web app. Separate containers, nothing shared — so a green run and an empty catalog are the expected pair.

🔑 **The discriminating find**: there is exactly one DuckDB database in production, `/app/dbt_projects/_docs_samples/warehouse.duckdb` — the Docs-QA connection 14 behind run 6, the very run this screenshot shows. **It works because whoever made it ignored the guide and picked a path that happens to sit on a shared volume.** The only DuckDB destination that has ever worked here is the one that did not follow this documentation.

A second, smaller blocker: creating a sixth connection in the prod-verify org returns **"Connection limit reached (5 on Free plan)"** — the cloud quota hook working as designed. No connection was deleted to get around it; the five in that org are cited as provenance by four guides that shipped the same day, and deleting production connections by hand is the operation that caused a past incident.

**Capture this once [core#793] ships**, against the path the guide then recommends — and make it the **Data preview**, not `/runs`.

## Verification

`verified_by: product-ui` / `verified_date: 2026-08-31`.

**2026-08-31 (Step 1 and Step 4 corrected, no new screenshot)** — the guide told the reader to `mkdir` in `datanika-app` (Step 1) and then read the file from `datanika-celery` (Step 4), with nothing shared between the two, so following it verbatim cannot work. Step 1 now ships the volume stanza and a two-container probe that fails loudly at the point the mistake is made; Step 4 now sends the reader to the **Data preview** and explains that for DuckDB an empty preview after a green run is the signature of exactly that mistake. The durability sentence was the guide's only mention of volumes and framed them as optional backup hygiene — **durability was the lesser half; reachability by both processes is the part that decides whether the product appears to work at all.**

**2026-07-18 (Step 2)** — field labels verified against the live shipped UI (`duckdb_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form has a single field: **Database Path** (required), plus **Connection Name** above. The type dropdown shows the lowercase key **`duckdb`**. Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: "Path to DuckDB file" → "Database Path", removed the fictional nav, "Save" → "Create Connection".

**2026-07-22 (Steps 2–5)** — a real DuckDB destination was created on prod (Docs-QA org, connection id 14) and a real upload landed into it. Corrections:

1. **Steps 3–5 described a "pipeline page" flow that does not exist.** "Open the pipeline… set the destination… click **Run now**… click **Schedule**" — none of those controls are there. `/pipelines` is the **dbt/transform** builder (dbt command, models, selector); extract-load lives at `/uploads`, runs are triggered from the upload row's **Run** button, and schedules are created at `/schedules`. Rewritten against the real screens.
2. **Write disposition depends on the source, not on DuckDB.** The guide said "the source connector's existing settings still apply — write disposition, primary key, incremental cursor. DuckDB honors all of them." The selectors are rendered under `rx.cond(~UploadState.form_is_non_sql_source, …)`, so they exist only for SQL-database sources and are hidden for files, SaaS, MongoDB, Google Sheets, REST and Kafka. Reframed as a property of the source.
3. **Connection Name is normalized as you type** — non-alphanumerics are stripped in the input, so the guide's `duckdb-analytics` example silently became `duckdbanalytics`. Corrected.
4. **Schedule step rewritten** to the real form: target type, target **name**, five-field cron, timezone. No cadence picker; an unscheduled upload is what "manual only" means.

## Not captured

- `01-credentials.png` — not applicable; DuckDB is a local file path with no credential step.

## ✅ 2026-07-22 (later) — `04-first-run` captured, and Step 4's verification works for the first time

Both blockers are closed and **verified running in prod**:

- **[core#492](https://github.com/datanika-io/datanika-core/issues/492) (P0)** — the CSV source now loads file **contents**. Run 6 landed **12 real customer rows** in `warehouse.duckdb`, read back directly with `duckdb.connect(...)` in the worker:
  ```
  customersdailyload.csv: 12 rows
  columns: customer_id, full_name, email, country, signup_date, plan, lifetime_value_usd, …
  (1001, 'Ada Lovelace', 'ada@example.com', 'GB', '2026-01-14', 'pro', 1840.0, …)
  ```
- **[core#494](https://github.com/datanika-io/datanika-core/issues/494)** — `duckdb_engine 0.17.0` is now in the image, so the catalog sync no longer dies on `NoSuchModuleError`. **Step 4's "browse the landed tables in Catalog" instruction has never once worked before today**; it does now — `/models` lists `customersdailyload` / table `csv` / schema `customersdailyload` / `success` / 9 columns. Data Preview ([core#260](https://github.com/datanika-io/datanika-core/issues/260)) should be reachable for DuckDB again too, though that wasn't re-tested.

**The acceptance criterion was rows of real data in the destination, not a green run row** — met, and checked in the destination rather than from the run counter.

The stale `warehouse.duckdb` was deleted before the run: it still held the #492 wreckage (a table called `filesystem`), which would otherwise have shown up in the Catalog.

> **Probing DuckDB on the box:** use **`/app/.venv/bin/python`**, not `python` — the system interpreter has none of the app's packages and reports `ModuleNotFoundError: No module named 'duckdb'`, which reads like a far bigger outage than it is. Run it in **`datanika-celery`**: the load happens in the worker, so that container is guaranteed to see the file. Step 4 of the guide now says both. ⚠️ **The prod app container name alternates** (`datanika-app` / `datanika-app-b`) because of blue/green, so never hard-code it; the stock compose name is right for a self-hoster.
