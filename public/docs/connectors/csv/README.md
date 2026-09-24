# CSV setup-guide screenshots

Referenced from `src/content/connectors/csv.md` (source-only file connector).

> [!WARNING]
> **Superseded observation - 2026-09-07.** The notes below record what was seen at
> each entry's `verified_date`. Any statement here that **Test Connection** returns
> *"Test not applicable for this type"* was true when captured and is **not true now**: core#821 retired
> that verdict, and on production today the string survives only in two source
> comments describing the removed behaviour. The button now either makes a real
> credential probe, really lists a file location, or returns a neutral *not tested*
> verdict carrying its own reason. The current wording lives in
> `src/content/connectors/csv.md` and is guarded by
> `tests/test-connection-copy.test.ts`.
>
> The observations are deliberately left as written. They are a dated record, and
> editing them would falsify the provenance they exist to provide.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 1 | The **New Connection** form with `csv` selected — the file-upload widget (**Choose File** / **Upload File**) + **Or enter file path** input. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `03-configure-upload.png` | Step 2 | The **New Upload** form at `/uploads`, filled in with a real CSV source (`15 — customerscsv (csv)`) and a real DuckDB destination (`14 — analyticswarehouse (duckdb)`). Captured 2026-07-22. Shows the **file-source shape** of the form: name, description, source, destination, batch size, Schema Contract — and **no** Load Mode / Write Disposition / Source schema / Table names, which are hidden for non-SQL sources. |
| `05-schedule.png` | Step 4 | The **New Schedule** form at `/schedules`, filled in for the same upload: target type `upload`, target name `customersdailyload`, cron `0 3 * * *`, timezone `UTC`. Captured 2026-07-22. |
| `04-first-run.png` | Step 3 | **Recaptured 2026-08-31 — it now shows the destination, not the run history.** The **Data preview** on `/models/7`, the model detail page for the landed `q3_signups` table: `Schema: q3signups`, ten typed columns, `Rows: 14`, and all fourteen rows with real values. Real CSV → Postgres load on production, run 11, in the **prod-verify** org, from a file put through the app's own **Upload File** widget. No credentials on screen. |
| | | 🚨 **It is no longer shared with the DuckDB guide.** The old shot was the `/runs` table and was byte-identical in both directories (`md5 622189bd…`). This one names a CSV schema and CSV columns, so `duckdb/04-first-run.png` is deliberately left as it was rather than being handed a picture of a load it did not do. **DuckDB still needs its own capture, and its current shot still fails the criterion.** |

## Verification

`verified_by: qa-ui` / `verified_date: 2026-09-24`.

**2026-09-24 (QA, landing#385 tier 1) — the first walk of this guide by QA, end to end, on a local
stack.** Every numbered step of `csv.md` was followed literally and the rows were read back **in the
destination**, twice, by two independent instruments.

Spec `SPEC_CONNECTOR_GUIDE_VERIFICATION` §2.4 fields:

| field | value |
|---|---|
| **Environment** | `local stack` — isolated worktree stack, compose project `wt-qa`, one origin at `127.0.0.1:13100` |
| **Core revision** | `8a1c21c731bb9e492b47029b0515cfd327a2bb93` · `git merge-base --is-ancestor <sha> origin/master` → **rc=0**. Negative control: core `origin/dev` against the same base → **rc=1**, so the check discriminates |
| **Cloud revision** | `995a8c5099e4350a01cbb5c1c3c26407efb9d23c` · cloud edition (the default of `build-from-worktree.sh`); ancestor of cloud `origin/master` rc=0, cloud `dev` control rc=1 |
| **Configuration** | **self-hosted defaults.** §2.4 scopes *DuckDB as a destination* to self-hosting, and this walk used it. **One deviation, and it is the guide's own instruction:** `duckdb.md` Step 1 requires a volume mounted into *both* the web and worker containers, so `duckdb_data:/var/datanika/duckdb` was added to `app` and `celery`. That edit is **not committed** — it is what a self-hoster is told to do, not what ships (core#793) |
| **Guide revision** | `4bbd713760788685b89d237c3c844ca140750588` (2026-09-17). `csv.md` is byte-identical on landing `dev` and `main`, so the text followed is the published text |
| **Not exercised** | egress-IP allowlisting (no walk on record exercises it — §2.4) · the **Or enter file path** branch as a *load* (its Test Connection verdict was exercised as a control; the load through that branch is the 2026-07-22 entry below) · the drag-and-drop zone (the file picker was used instead) · the schedule actually **firing** (created Active at `0 3 * * *` and confirmed in the table; not waited for) · notification delivery (the Settings section was confirmed to exist, no channel configured) |

**What was created and run.** Org *QA Walk's Org*, seeded 14-row CSV (`example.com` addresses only —
`PRODUCT_RULES` §4, and its data half: a destination preview renders whatever the source held).
Connection **4** `q3signupsexport` (csv, via the **Upload File** widget) · destination connection **3**
`analyticswarehouse` (duckdb, `/var/datanika/duckdb/analytics.duckdb`) · upload **2** `q3signups` ·
run **1** `success`, **14 rows**, 1.5 s · catalog entry `/models/1` · schedule **2**, `0 3 * * *`, UTC,
Active.

**The destination, checked twice and not by the pipeline's own report** (`QA_RULES` §16):

1. The guide's own Step 3.4 — **Data preview** on `/models/1` returned `Rows: 14` with real values
   across `signup_id, company, contact_email, country, plan, seats, signed_up_on, mrr_usd` plus
   `_dlt_load_id` / `_dlt_id`. **File contents, not a file listing** (core#492 stays fixed).
2. An independent `SELECT` against the DuckDB file **from inside the worker container**, where the load
   actually ran: `q3signups.q3_signups` → `COUNT = 14`, and `SUM(mrr_usd) = 47845.5`, which **matches
   the source file exactly**. A row count alone would not have caught truncation or a type-inference
   failure; the sum does. Negative control: `select … from q3signups.no_such_table` **raises**
   `CatalogException` rather than returning empty, so the reading above is a measurement.

That second read also settles `duckdb.md` Step 1 end to end: the load ran in the **worker** and the
preview ran in the **web app**, and both saw the same 1,323,008-byte file. Step 1's own probe passed
with a control — the worker can see `/var/datanika/duckdb/.probe` and **cannot** see the app's
`/tmp/.notshared`.

**Guide claims confirmed live, so a later reader need not re-derive them:** the New Connection form is
already rendered · the CSV form has exactly three inputs plus the raw-JSON escape hatch · Connection
Name and Upload name both strip non-alphanumerics **as you type** (`q3-signups-export` →
`q3signupsexport`) · the **Upload File** button really opens the OS file picker · connection rows offer
Test / Edit / Copy / Delete only · Load Mode, Write Disposition, Source schema and Table names are
visible with no source selected and **disappear** once the CSV source is chosen · **File Format**,
**Delimiter (CSV)** and **Encoding** render beneath the destination picker · source entries read
`4 — q3signupsexport (csv)` · the upload lands `draft` · the schema is named after the upload and the
table after the file stem (`q3-signups.csv` → `q3_signups`) · the schedule form takes a real five-field
cron, defaults to UTC, and lands **Active** with **Pause** · Settings carries **Notifications**.

🔴 **One delta, filed as [landing#691] (S3):** Step 1 sub-step 4 — *"Click **Test Connection**"* — is
written as unconditional but only applies to the **Or enter file path** branch. On the **Upload File**
branch, which the guide lists first, it answers *"Set the bucket URL or path first — there is nothing
to test yet"*. **Attributed with a control rather than assumed:** the same button on the path branch
(`/app/uploaded_files`) returned *"No files matched `*.csv` under `/app/uploaded_files`. The run would
have completed with zero rows. The directory exists but holds nothing matching that pattern."* — which
is exactly what Step 4 promises and what core#493 shipped. **The product is right; the prose is
unscoped.**

⚠️ **One prediction of mine was wrong and is recorded because the correction is the point:** seeing
both a **Choose File** and an **Upload File** button, I expected the guide's *"click the **Upload
File** button and pick it from the OS file picker"* to be a defect. It is not — clicking **Upload
File** opens the picker. **Tested before filing**, which is this issue's own rule (*do not correct the
guide from the code*) pointed at my own inference.

[landing#691]: https://github.com/datanika-io/datanika-landing/issues/691

---

### Earlier entries

`verified_by: product-ui` / `verified_date: 2026-08-31` — superseded by the entry above, kept as the
dated record it was.

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
