# Parquet setup-guide screenshots

Referenced from `src/content/connectors/parquet.md` (source-only file connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 1a | The **New Connection** form with `parquet` selected — the file-upload widget + **Or enter file path** input. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `04-first-run.png` | Step 3 | **New 2026-08-31** — this guide had no first-run shot, deliberately: the only candidate was a CSV run. It now has a **Parquet** one. The **Data preview** on `/models/9` for the landed `service_uptime` table: `Schema: serviceuptime`, nine typed columns, `Rows: 13`, all thirteen rows with real values. Real Parquet → Postgres load on production, run 13, in the **prod-verify** org, via **Upload File** (Step 1a). No credentials on screen. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-08-31`.

**2026-08-31 (Step 3, first capture — and the 2026-07-22 refusal is now resolved the right way)** — the note below says no screenshot was embedded because the available shots showed a *CSV* source. That was the correct call and this is what it was waiting for: a Parquet run of its own.

Connection **31** `serviceuptimeparquet` (a 13-row file written with `pyarrow`), destination connection **28** `docswarehouse`, upload **15** `serviceuptime`, run **13** `success` / 13 rows, catalog entry `/models/9`. Confirmed in the destination with `psql` on the box: `docs_warehouse.serviceuptime.service_uptime`, 13 rows.

🔑 **The type comparison across all three file connectors, measured the same day against the same destination.** One logical "when did this happen" column per format:

| guide | source column | arrived in Postgres as |
|---|---|---|
| `csv` | `signed_up_on` | `character varying` |
| `json` | `recorded_at` | `timestamp with time zone` |
| `parquet` | `measured_on` | **`date`** |

Parquet carries a real schema, so `date32` survives as `DATE` and `double` as `DOUBLE PRECISION`. CSV carries no types at all and everything ambiguous arrives as text. That is now stated in Step 3 of all three guides rather than left for a reader to discover in their warehouse. **It is also the sharpest argument this guide has for Parquet, and it took running all three to be able to make it.**

**2026-07-19 (Step 1)** — field labels verified against the live shipped UI (`file_upload_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, the **Upload File** widget, and an **Or enter file path** input. The type dropdown shows the lowercase key **`parquet`**. **Major drift fixed:** the draft invented an in-form **footer-read / schema panel / preview** flow ("reads footer metadata and you get…", "preview the first 20 rows", "override per column in the Schema panel") — none exist on the form. Reframed the Parquet metadata behaviour as load-time (accurate), removed the fictional Schema panel, swapped the fictional `01a-upload-ui` image for the real `02`, and fixed the path label to **Or enter file path**.

**2026-07-22 (Steps 2–4)** — walkthrough corrected against the live UI. No new screenshots: the `03`/`05` shots captured this round show a **CSV** source, so embedding them here would misrepresent the flow. Prose-only fixes, each verified:

1. **Step 2 described a flow that does not exist.** "Open the connection and click **Configure pipeline**" — no such button; connection rows offer Test / Edit / Copy / Delete. Extract-load is a **New Upload** at `/uploads` with a source *and* destination connection. Verified live end-to-end on the sibling CSV path.
2. **No write disposition or target schema for a Parquet source.** `uploads.py` renders those selectors under `rx.cond(~UploadState.form_is_non_sql_source, …)` and `FILE_SOURCE_TYPES = {"s3", "csv", "json", "parquet"}` is part of `NON_SQL_SOURCE_TYPES` — so `parquet` is hidden by construction, not by accident. Observed live for `csv`, which shares the predicate.
3. **Test Connection does not read the footer.** The guide claimed it "opens the first matching file, reads the footer, and shows you the schema". `ConnectionService.test_connection` returns `(True, "Test not applicable for this type")` unconditionally for everything in `_NON_DB_TYPES`, which includes `PARQUET`.
4. **Schedules are their own page** at `/schedules` with a five-field cron, not a cadence picker on a pipeline page. **Connection Name is normalized as you type** (non-alphanumerics stripped), so the hyphenated examples were wrong.

## Not captured

- `01-credentials.png` — not applicable; a Parquet file has no credential step.
- `03-configure-upload.png` / `05-schedule.png` — capture with a real **Parquet** source rather than reusing the CSV shots.
- `04-first-run.png` — **blocked on [core#456](https://github.com/datanika-io/datanika-core/issues/456)**: every successful run is currently flipped to FAILED by a `TypeError` in the run-completion hook, so there is no green run to photograph.
