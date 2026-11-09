# Parquet setup-guide screenshots

Referenced from `src/content/connectors/parquet.md` (source-only file connector).

> [!WARNING]
> **Superseded observation - 2026-09-07.** The notes below record what was seen at
> each entry's `verified_date`. Any statement here that **Test Connection** returns
> *"Test not applicable for this type"* was true when captured and is **not true now**: core#821 retired
> that verdict, and on production today the string survives only in two source
> comments describing the removed behaviour. The button now either makes a real
> credential probe, really lists a file location, or returns a neutral *not tested*
> verdict carrying its own reason. The current wording lives in
> `src/content/connectors/parquet.md` and is guarded by
> `tests/test-connection-copy.test.ts`.
>
> The observations are deliberately left as written. They are a dated record, and
> editing them would falsify the provenance they exist to provide.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 1a | The **New Connection** form with `parquet` selected — the file-upload widget + **Or enter file path** input. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `04-first-run.png` | Step 3 | **New 2026-08-31** — this guide had no first-run shot, deliberately: the only candidate was a CSV run. It now has a **Parquet** one. The **Data preview** on `/models/9` for the landed `service_uptime` table: `Schema: serviceuptime`, nine typed columns, `Rows: 13`, all thirteen rows with real values. Real Parquet → Postgres load on production, run 13, in the **prod-verify** org, via **Upload File** (Step 1a). No credentials on screen. |
| `05-data-preview.png` | Step 3 | **New 2026-09-26 (QA)** — the **Step 1b** path, which `04` does not cover: the Data preview on `/models/3` for `parqlake_load_7.parquet`, `Rows: 11`, all eleven rows. The table is named **`parquet`** rather than after a file, because the glob matched two of them — which is the claim Step 3.4 makes about Step 1b and the reason this shot exists beside `04` rather than replacing it. Local QA stack, no credentials on screen. |

## Verification

`verified_by: qa-ui` / `verified_date: 2026-09-26`.

**2026-09-26 (QA) — Step 1b walked end to end, and it found four defects in this guide. Three of the four were written by me on 2026-09-25.**

Stack built by `scripts/build-from-worktree.sh` from core `master 04c82247` + cloud `master 2a6a0e42` (image `sha256:de9ae81a…`), self-hosted defaults, `DATANIKA_ALLOW_LOCAL_FILE_PATHS` at its code default `True`. Connection **12** `parquetlake` → **11** `parquetduckdest`, upload **6** `ParqLake Load 7`, run **3** `SUCCESS` / 11 rows / 1038 bytes / `catalogued`.

🔑 **The acceptance evidence is the read-back, not the run row.** `parqlake_load_7.parquet` holds **11** rows read out of `/var/datanika/duckdb/analytics.duckdb` through each container's own interpreter, the file byte-identical in size from both (2,633,728 B), and the **Data preview rendering `Rows: 11`** in the web app.

⚠️ **11 is a discriminating number, which is why the fixture was built this way.** The directory held `service_uptime.parquet` (9 rows, SNAPPY), `service_uptime_extra.parquet` (2 rows, ZSTD) and `ignored_by_glob.parq` (2 rows). 11 means the glob matched exactly the two `.parquet` files and both codecs decoded; **13 would have meant `.parq` was included**, and 9 that only one file was read. A plausible-looking total would have proven nothing.

**Confirmed as written** — recorded so nobody re-derives it: the type picker is one flat list of 36 with no categories; a connection name strips non-alphanumerics (`parquet-duck-dest` → `parquetduckdest`); an upload name keeps **spaces** and strips the rest (`Parq-Lake Load 7` → `ParqLake Load 7`); the destination schema is **derived** from it (`parqlake_load_7`); the Step 1b table takes the **connector** name; `Load Mode`/`Write Disposition` are present before a source is picked and gone after picking a Parquet one; connection entries read `id — name (type)`; Test Connection goes red on a bad path; `:ro` is honoured; types survive (`date32`→`DATE`, `float64`→`DOUBLE`, `int64`→`BIGINT`, `bool`→`BOOLEAN`).

**Fixed this round:**

1. 🔴 **Step 1a's `.parq` remedy named a route that does not work — mine, 2026-09-25.** It said *"Rename it to `.parquet`, or use the file-path route below."* The file-path route matches `*.parquet` **inside** a directory, so a `.parq` file there is skipped; and pointing the field at the file itself is refused (*"…is a file, but this field must be the directory that contains your files"*). Renaming is the only remedy. Added to [core#1604](https://github.com/datanika-io/datanika-core/issues/1604), because widening the picker's `accept` without widening the glob would turn a visible refusal into a silent zero-row load. **The same false workaround was in `json.md` for `.jsonl`/`.ndjson` and is corrected there too** — measured separately: a directory holding only a `.jsonl` tests red on `*.json`.
2. 🔴 **Step 1a.2 sent readers to a `Search…` box that does nothing — mine, 2026-09-25.** Typing leaves all 36 entries showing; [core#1613](https://github.com/datanika-io/datanika-core/issues/1613) has the isolated cause (the filter binds at page load, before Radix mounts the popover, and the component's own `if (!input || !list) return;` swallows it). Both guides now say to scroll and name the neighbours. ⚠️ **My round-21 correction replaced a phantom *category* with an instruction to use a dead *control*** — the category claim was measured and the replacement was inferred.
3. **Step 1b.5 promised Test Connection "reports the files it matched".** The red text is excellent — it names the pattern, the path and the consequence. The **green** reads only `Connected — found files matching *.parquet`: no count, no filenames. Both are now quoted, so a reader knows which one tells them something.
4. **Step 2 enumerated the New Upload form and omitted three visible fields** — `File Format`, `Delimiter (CSV)` and `Encoding`. Two of them cannot apply to Parquet, which is [core#1614](https://github.com/datanika-io/datanika-core/issues/1614); the guide now names all three and says to leave two alone.
5. **Step 3.6's fidelity claim is true and the UI under-reports it.** DuckDB stores the column as `DOUBLE`; the model page labels it `FLOAT` ([core#1614](https://github.com/datanika-io/datanika-core/issues/1614)). Step 3.6 now sends a reader to the warehouse rather than to the screen that misreports the thing they came to check.

🔑 **The lesson worth more than the five fixes: a correction is itself a claim.** Round 21 measured three defects here and fixed all three — then wrote three *replacements* that were reasoned rather than walked, and two of those were wrong. That is the same failure as the original 2026-07 sweep this guide corpus is still recovering from ("36 guides rewritten in one day from inference"), committed by the session fixing it, in the same files, one round later. **Walk the remedy, not only the defect.**

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
