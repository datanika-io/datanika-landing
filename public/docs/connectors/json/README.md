# JSON setup-guide screenshots

Referenced from `src/content/connectors/json.md` (source-only file connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 1a | The **New Connection** form with `json` selected — the file-upload widget + **Or enter file path** input. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-22`.

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
