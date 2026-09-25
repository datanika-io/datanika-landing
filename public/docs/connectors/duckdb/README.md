# DuckDB setup-guide screenshots

Referenced from `src/content/connectors/duckdb.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `duckdb` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form at `/uploads` with a real DuckDB destination selected (`14 — analyticswarehouse (duckdb)`). Captured 2026-07-22. Shared with the CSV guide — it is the same screen and the same real upload, shown here for the destination side. |
| `05-data-preview.png` | Step 4 | ✅ **The Data preview, and it is the artifact this README has been waiting for since 2026-08-31.** `Rows: 7` with the seven real rows rendered **in the web app**, against `/var/datanika/duckdb/analytics.duckdb` — which is the discriminating proof, because the load runs in the worker and the preview reads from `app`. Captured 2026-09-25 from a **local stack** (see Verification below). No credentials on this screen. |
| `04-first-run.png` | Step 4 | 🔴 **Still the `/runs` table, and it still FAILS the acceptance criterion.** A real CSV → DuckDB load on production (run 6, `success`, 12 rows, 2026-07-22), but a run status is not evidence that data arrived — see [landing#395](https://github.com/datanika-io/datanika-landing/issues/395). Its alt text now says what it is instead of implying more. **No longer shared with the CSV guide**: csv's was recaptured 2026-08-31 and the two images (previously byte-identical, `md5 622189bd…`) now differ. This one was deliberately left alone rather than handed a picture of a load DuckDB did not do. |

## ✅ RESOLVED 2026-09-25 — the Data preview is captured, on a local stack

**The `artifact-disowned` marker is removed in this change**, and the reason it could be removed is a
decision rather than a shipped fix. The marker's own instruction said *"remove it in the same change
that recaptures the Data preview **once core#793 ships**"* — but that sentence was written on
2026-08-31, and `SPEC_CONNECTOR_GUIDE_VERIFICATION` **§2.4 was decided 2026-09-15**, after it. §2.4
puts a local-stack walk on the same footing as production and names *"DuckDB as a destination"*
explicitly as a step scoped to self-hosting. **So the condition that lifts the objection is no longer
"core#793 ships" — it is "the Data preview has been seen holding the rows", and it now has.**

🔑 **[core#793] stays OPEN and is not weakened by this.** It is about what the **stock
`docker-compose.yml` ships**: there is still no `/var/datanika` volume in it, so a self-hoster who
skips Step 1 still gets a green run and an empty catalog. This walk is in fact the first measurement
of Step 1's remedy — adding the guide's own volume stanza verbatim makes the documented path work
end to end. What was blocked was the *capture*, not the product.

The measurement that made the objection in the first place still stands and is worth keeping:

The guide's recommended path, `/var/datanika/duckdb/analytics.duckdb`, is on **no volume and in no container image**. Measured on prod that day: `datanika-app-b` and `datanika-celery` each mount exactly two shared volumes (`/app/dbt_projects`, `/app/uploaded_files`), neither is `/var/datanika`, and the string appears nowhere in `docker-compose.yml`. The load runs in the worker; the Data preview and SQL Editor run in the web app. Separate containers, nothing shared — so a green run and an empty catalog are the expected pair.

🔑 **The discriminating find**: there is exactly one DuckDB database in production, `/app/dbt_projects/_docs_samples/warehouse.duckdb` — the Docs-QA connection 14 behind run 6, the very run this screenshot shows. **It works because whoever made it ignored the guide and picked a path that happens to sit on a shared volume.** The only DuckDB destination that has ever worked here is the one that did not follow this documentation.

A second, smaller blocker: creating a sixth connection in the prod-verify org returns **"Connection limit reached (5 on Free plan)"** — the cloud quota hook working as designed. No connection was deleted to get around it; the five in that org are cited as provenance by four guides that shipped the same day, and deleting production connections by hand is the operation that caused a past incident.

✅ **Done 2026-09-25 — as `05-data-preview.png`, and it is the Data preview rather than `/runs`,** which is what that instruction asked for. It was captured against the path the guide recommends (`/var/datanika/duckdb/analytics.duckdb`) with the guide's own Step 1 volume stanza added, on a local stack — not on production, where the stanza is still absent. **`04-first-run.png` is deliberately left as it is**: it remains an honest picture of a `/runs` row, and its own table entry says so.

⚠️ **The paragraph above this one is a 2026-08-31 PRODUCTION reading and is still accurate about production.** Nothing in this round changed the box. Do not read the resolution as "the stock path now works out of the box" — it does not, and [core#793] is where that is tracked.

## Verification

`verified_by: qa-ui` / `verified_date: 2026-09-25`.

**2026-09-25 (QA) — walked end to end on a local stack; Steps 1–4 verified, rows read back in the destination.** The §2.4 record:

| field | value |
|---|---|
| **Environment** | `local stack` (compose project `wt-qa`, one-origin proxy on `127.0.0.1:13100`) |
| **Core revision** | `04c822477d2dc4cc8b9f02e69db99c53f6a6219f` — `git merge-base --is-ancestor HEAD origin/master` → **yes**, and `master...dev` read `identical` at the time, so the walked tree is what production serves |
| **Cloud revision** | `2a6a0e42e4304856b322d8131d39f84e2a055f87` (cloud `master`), **cloud edition** — the default of `scripts/build-from-worktree.sh` |
| **Configuration** | `self-hosted defaults`, which is what §2.4 prescribes for this guide. `DATANIKA_ALLOW_LOCAL_FILE_PATHS` at its code default `True`; production sets it `false`, which is consistent with this flow being Cloud-refused per the guide's own core#793 note |
| **Guide revision** | landing `9bac0f0b36c2434fb5908022424750215c908138` — the text followed, before this change's corrections |
| **Deviation** | container names are `wt-qa-app` / `wt-qa-celery` rather than `datanika-app` / `datanika-celery`. The guide is right for a stock self-hosted compose; the rename is `worktree-stack.sh`'s port/name isolation |
| **Not exercised** | **Step 5 (schedule)** — not re-walked this round; it was corrected against the real form on 2026-07-22 and nothing since has touched it. **Egress-IP allowlisting** — only Datanika Cloud's network can exercise it, and no walk on record ever has |

What was actually verified, each with its evidence:

1. **Step 1's volume stanza is correct and sufficient.** Added verbatim, then the guide's own two-container probe passed **both** directions (app→celery and celery→app). 🔑 **With a negative control that holds**: a file written to `/var/datanika/NOT-SHARED.probe` in `app` is **not** visible in `celery`, so `/var/datanika` itself is image-local and only the mounted subdirectory is shared — the probe discriminates rather than passing on a coincidence. A positive control on the already-shared `/app/uploaded_files` proved the probe could observe sharing at all before any of that was believed.
2. **Step 2's form matches exactly** — two fields, `Connection Name *` and `Database Path *`, placeholder `/data/warehouse.duckdb`. Both **Create Connection** and **Test Connection** render. Typing `duckdb-analytics` yielded `duckdbanalytics`, so the normalization sentence is accurate.
3. 🔴 **Step 2's "File not found?" note was WRONG and is rewritten.** Test Connection on a brand-new DuckDB destination returns `No database at '<path>'. Check the path, or create the file first.` **with the parent directory present and correctly shared.** The old note attributed that message to a missing parent directory, so a reader who had done Step 1 properly would have gone hunting for a mount problem that did not exist. The message cannot distinguish the two cases; Step 1's probe is what can. **Create Connection succeeds anyway** — connection id 8 was created straight after the red test.
4. **Step 3's upload form matches**, including the picker entry format: `8 — duckdbanalytics (duckdb)`, i.e. id, name, type. ✅ **And the source-dependence claim is verified rather than repeated**: with a **JSON** source selected, **Load Mode** and **Write Disposition** are absent from the DOM; they are present before a source is chosen.
5. **Step 4 is the acceptance criterion and it is met.** Run 2 on upload 4: `SUCCESS`, `rows_loaded=7`, `bytes_processed=1107`, `catalog_sync_verdict=catalogued`. Then, **not trusting the run row**, the rows were read out of the destination with the guide's own command in **both** containers: `analytics.duckdb` holds `apieventstoduckdb.json` with **7 rows**, and the file is byte-identical in size (1 323 008) from `app` and from `celery`. `/models` showed the table with `10` columns and `success`, in a schema named after the upload. The **Data preview** rendered `Rows: 7` with the real values. Types survived exactly as documented: `BIGINT`, `VARCHAR`, `DOUBLE`, `BOOLEAN`, `TIMESTAMP WITH TIME ZONE`.
6. **The guide's `/app/.venv/bin/python` warning is correct, with its control fired**: the system interpreter answers `ModuleNotFoundError: No module named 'duckdb'`, exactly the symptom the guide predicts.
7. 🔴 **Step 4 point 5's "open SQL Editor" was a phantom page and is rewritten.** There is no SQL Editor in the sidebar (11 nav links, none of them) and `/sql-editor` renders `404 - Not Found`. **The SQL Editor is a field inside the New Transformation form on `/transformations`**, beside **Destination Connection**, **Preview SQL** and **Preview Result** — which is the real way to run an ad-hoc query. ⚠️ **Do not re-derive this from an HTTP status**: every path under the Reflex SPA answers **200**, including a deliberately absent one, so the status code cannot answer the question and my own control caught that before it became a finding.

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
