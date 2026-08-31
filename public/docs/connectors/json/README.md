# JSON setup-guide screenshots

Referenced from `src/content/connectors/json.md` (source-only file connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 1a | The **New Connection** form with `json` selected — the file-upload widget + **Or enter file path** input. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `04-first-run.png` | Step 3 | **New 2026-08-31** — this guide had no first-run shot at all. The **Data preview** on `/models/8`, the model detail page for the landed `warehouse_events` table: `Schema: warehouseevents`, nine typed columns, `Rows: 11`, and all eleven rows with real values. Real JSON → Postgres load on production, run 12, in the **prod-verify** org, from a file put through the app's own **Upload File** widget (Step 1a). No credentials on screen. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-08-31`.

**2026-08-31 (Step 3, first capture)** — driven end-to-end on production in the **prod-verify** org: connection **30** `warehouseeventsjson` (an 11-record JSON array through **Upload File**), destination connection **28** `docswarehouse`, upload **14** `warehouseevents`, run **12** `success` / 11 rows / 2.7 s, catalog entry `/models/8`. Confirmed in the destination with `psql` on the box — `docs_warehouse.warehouseevents.warehouse_events` holds 11 rows with columns `event_id, warehouse, sku, movement, units, recorded_at, operator`, i.e. **record contents, not a file listing** ([core#492](https://github.com/datanika-io/datanika-core/issues/492)).

Two things worth carrying:

- **The table name comes from the filename, and only on the Step 1a branch.** `warehouse-events.json` → `warehouse_events`. `upload_tasks.py` sets `dlt_config["table_name"]` from the uploaded file's stem; the Step 1b directory branch has a wildcard glob, so `_file_table_name()` falls through to the connector name, `json`. Step 3 now says both. This is the same mechanism as the CSV guide's, and it is the defect that guide was carrying — **the two-branch split this guide already had in Steps 1a/1b is what made it easy to state correctly here.**
- **JSON preserved a type CSV lost.** `recorded_at` landed as `timestamp with time zone`; the equivalent CSV column in the `csv` guide's capture landed as `character varying`. Worth knowing before telling a reader that type inference "just works" — it works better with a format that carries types.

**2026-07-19 (Step 1)** — field labels verified against the live shipped UI (`file_upload_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, the **Upload File** widget, and an **Or enter file path** input. The type dropdown shows the lowercase key **`json`**. **Major drift fixed:** the draft invented an in-form **preview / auto-detect** flow ("sniffs the first records", "preview the first 20 rows in the form"), a **Format hint** field, and an **encoding override** — none exist on the form. Reframed the JSON parsing behaviour as load-time (accurate), removed the fictional fields, swapped the fictional `01a-upload-ui` image for the real `02`, and fixed the path label to **Or enter file path**.

**2026-07-22 (Steps 2–4)** — walkthrough corrected against the live UI. No new screenshots: the `03`/`05` shots captured this round show a **CSV** source, so embedding them here would misrepresent the flow. Prose-only fixes, each verified:

1. **Step 2 described a flow that does not exist.** "Open the connection and click **Configure pipeline**" — no such button; connection rows offer Test / Edit / Copy / Delete. Extract-load is a **New Upload** at `/uploads` with a source *and* destination connection. Verified live end-to-end on the sibling CSV path.
2. **No write disposition, primary key, or target schema for a JSON source.** `uploads.py` renders those selectors under `rx.cond(~UploadState.form_is_non_sql_source, …)` and `FILE_SOURCE_TYPES = {"s3", "csv", "json", "parquet"}` is part of `NON_SQL_SOURCE_TYPES` — so `json` is hidden by construction, not by accident. Observed live for `csv`, which shares the predicate.
3. **Test Connection does not read the file.** The guide claimed it "checks the path is readable and previews the first matching file". `ConnectionService.test_connection` returns `(True, "Test not applicable for this type")` unconditionally for everything in `_NON_DB_TYPES`, which includes `JSON`.
4. **Schedules are their own page** at `/schedules` with a five-field cron, not a cadence picker on a pipeline page. **Connection Name is normalized as you type** (non-alphanumerics stripped), so the hyphenated examples were wrong.

## Not captured

- `01-credentials.png` — not applicable; a JSON file has no credential step.
- `03-configure-upload.png` / `05-schedule.png` — capture with a real **JSON** source rather than reusing the CSV shots.
- `04-first-run.png` — **blocked on [core#456](https://github.com/datanika-io/datanika-core/issues/456)**: every successful run is currently flipped to FAILED by a `TypeError` in the run-completion hook, so there is no green run to photograph.
