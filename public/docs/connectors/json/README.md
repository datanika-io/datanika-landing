# JSON setup-guide screenshots

Referenced from `src/content/connectors/json.md` (source-only file connector).

> [!WARNING]
> **Superseded observation - 2026-09-07.** The notes below record what was seen at
> each entry's `verified_date`. Any statement here that **Test Connection** returns
> *"Test not applicable for this type"* was true when captured and is **not true now**: core#821 retired
> that verdict, and on production today the string survives only in two source
> comments describing the removed behaviour. The button now either makes a real
> credential probe, really lists a file location, or returns a neutral *not tested*
> verdict carrying its own reason. The current wording lives in
> `src/content/connectors/json.md` and is guarded by
> `tests/test-connection-copy.test.ts`.
>
> The observations are deliberately left as written. They are a dated record, and
> editing them would falsify the provenance they exist to provide.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 1a | The **New Connection** form with `json` selected — the file-upload widget + **Or enter file path** input. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `04-first-run.png` | Step 3 | **New 2026-08-31** — this guide had no first-run shot at all. The **Data preview** on `/models/8`, the model detail page for the landed `warehouse_events` table: `Schema: warehouseevents`, nine typed columns, `Rows: 11`, and all eleven rows with real values. Real JSON → Postgres load on production, run 12, in the **prod-verify** org, from a file put through the app's own **Upload File** widget (Step 1a). No credentials on screen. |

## Verification

`verified_by: qa-ui` / `verified_date: 2026-09-25`.

**2026-09-25 (QA) — Step 1b, the directory branch, walked end to end on a local stack.** The 2026-08-31 entry below covers Step 1a on production; this is the branch it could not reach. §2.4 record:

| field | value |
|---|---|
| **Environment** | `local stack` (compose project `wt-qa`) |
| **Core revision** | `04c822477d2dc4cc8b9f02e69db99c53f6a6219f`, ancestor of `origin/master` → **yes** (`master...dev` read `identical`) |
| **Cloud revision** | `2a6a0e42e4304856b322d8131d39f84e2a055f87`, cloud edition |
| **Configuration** | `self-hosted defaults` — Step 1b is explicitly a self-hosted branch, which is what §2.4 permits here |
| **Guide revision** | landing `9bac0f0b36c2434fb5908022424750215c908138` |
| **Not exercised** | **Step 1a's browse dialog** — see the correction below; and **egress-IP allowlisting**, which only Cloud's network can exercise |

1. **Step 1b's mount instruction is correct, including the `:ro`.** The bind mount was added exactly as the guide's YAML shows it, then the guide's own `ls` check passed **in the worker** and in the web app, and a write attempt was refused with `Read-only file system` — so the `:ro` guarantee the guide gives the upstream producer actually holds.
2. **Step 1b point 5's promise about Test Connection is accurate.** It returned **`Connected — found files matching *.json`** for the directory. ⚠️ **Wording note, not a defect:** the guide says it "reports the files it matched", and the message reports the *pattern* rather than names or a count.
3. **The load works and the rows are in the destination.** Source connection 7 `apieventsinbox` → destination 8 `duckdbanalytics`, upload 4, run 2 `SUCCESS` / **7 rows** / 1107 bytes / `catalogued`. Read back out of DuckDB with `duckdb.connect(..., read_only=True)` in the worker: 7 rows with all eight source fields.
4. ✅ **The type claim is verified, not repeated.** `event_id` → `BIGINT`, `revenue_usd` → `DOUBLE`, `is_trial` → `BOOLEAN`, `occurred_at` → `TIMESTAMP WITH TIME ZONE`, strings → `VARCHAR`. Taken from the JSON values, exactly as Step 1a's note claims.
5. ✅ **The table-name mechanism recorded in the 2026-08-31 entry below is independently confirmed.** On this Step 1b walk the table landed as **`json`** — the connector name — not as the filename, because the directory branch uses a wildcard glob. Same conclusion, reached from the other branch.
6. 🔴 **Step 1a.2's "under the **File** category" was a phantom affordance and is corrected.** The type picker is **one flat searchable list of 36 types with no category headings at all**. The same sentence was in `parquet.md` and is corrected there too. ⚠️ `tests/phantom-nav-instructions.test.ts` cannot catch this class — it checks that nav *targets* exist, and a category heading is neither a page nor a control.
7. 🚨 **A `.jsonl` / `.ndjson` file cannot be chosen through the browse dialog** — the file input's `accept` is `text/csv,.csv,application/json,.json,application/octet-stream,.parquet`, read off the DOM. Filed as [core#1604](https://github.com/datanika-io/datanika-core/issues/1604); the guide now carries the workaround.
8. ⚠️ **What I could NOT establish, stated so it is not mistaken for a finding:** I could not drive the `rx.upload` widget from an automated browser — neither `setFiles` nor a synthetic `DragEvent` produced an `/_upload` request, and Test Connection then correctly said `File upload or file path is required`. 🔑 **The 2026-08-31 entry below is the control that settles it: Step 1a was walked successfully on production through **Upload File** with an 11-record array.** So the widget works and the fault was my harness. This is recorded because a future automated attempt will hit it again.

The five upload-form fields for a JSON source, for the record, since Step 2 lists only some of them: **File Format** (`auto (detect from type or extension)`), **Delimiter (CSV)**, **Encoding**, **Schema Contract** (Tables / Columns / Data Type), **Use raw JSON config**. The delimiter field is labelled `(CSV)` in the UI, so it is self-explaining rather than misleading, and there is **no File Pattern field** for a json source — the `file_glob` route the guide names is via **Use raw JSON config**, as it says.

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
