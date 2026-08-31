# PostgreSQL setup-guide screenshots

Referenced from `src/content/connectors/postgresql.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `postgres` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form with a real SQL source selected (`16 — docssamplesdb (postgres)` → `17 — docswarehouse (postgres)`), showing the **SQL-source shape**: Load Mode, Write Disposition, Source schema (`public`), Table names (`customers, orders`), Batch size, Schema Contract. Captured 2026-07-22 by filling the live form on prod — **nothing was submitted**, so no stray upload was created. |
| `04-first-run.png` | Step 4 | **Recaptured 2026-08-31 — it now shows the destination, not the run history.** The **Data preview** on `/models/6`, the model detail page for the landed `customers` table: `Schema: customerorders`, nine typed columns, `Rows: 12`, and all twelve rows with real values. `Load first 100 rows` runs `ConnectionService.preview_table()` — a live `SELECT` against the destination connection — so the image is evidence about the warehouse rather than about a status badge. Real Postgres → Postgres load on production, run 10, in the **prod-verify** org. No credentials on screen (capture gate below). |
| `05-schedule.png` | Step 5 | The **New Schedule** form filled for the same upload: target type `upload`, target name `customerorders`, cron `0 3 * * *`, timezone `UTC`. **Recaptured 2026-08-31** so the target name matches the upload in `04-first-run.png`; the 2026-07-22 shot named `customerorderssync`, which is the Docs-QA org's upload and no longer the one this guide walks through. **Deliberately not submitted** — an Active nightly schedule firing runs into live alerting is not something to leave behind (the same reason schedule 7 was deleted in the csv session). |

## Verification

`verified_by: product-ui` / `verified_date: 2026-08-31`.

**2026-08-31 (Step 4 recapture — the point of the exercise)** — [landing#395](https://github.com/datanika-io/datanika-landing/issues/395) scored this guide's `04-first-run.png` as **not satisfying** the standing acceptance criterion, and it was right. The old shot was the `/runs` table, which shows a *status*. The criterion is **rows in the destination**, and the reason it is worded that way is that a green run row has twice been wrong: [core#492](https://github.com/datanika-io/datanika-core/issues/492) (file sources loaded a listing of files, not their contents, and reported `success`) and [core#493](https://github.com/datanika-io/datanika-core/issues/493) (a zero-match glob also completes as `success`).

Driven end-to-end on production in the **prod-verify** org — a separate org from Docs-QA, so nothing pre-existing was visible to it and every artifact below was built for this capture:

| artifact | id |
|---|---|
| source connection | **27** `docssamplesdb` → `docs_samples` |
| destination connection | **28** `docswarehouse` → `docs_warehouse` |
| upload | **12** `customerorders`, `full_database` / `replace`, source schema `public`, tables `customers,orders` |
| run | **10**, `success`, 19 rows, 9.4 s |
| catalog entries | `/models/5` `orders`, `/models/6` `customers` |

Confirmed **in the destination database**, read with `psql` on the box rather than through the app:

```
docs_warehouse | customerorders.customers | 12      docs_samples | public.customers | 12
docs_warehouse | customerorders.orders    |  7      docs_samples | public.orders    |  7
(1001,"Ada Lovelace",ada@example.com,GB,2026-01-14,pro,1840.00, …)
```

Two things this run confirmed about the shipped product, both matching what [landing#401](https://github.com/datanika-io/datanika-landing/issues/401) asserts and worth re-stating because the guide depends on them:

- **`_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` exist in the warehouse and are absent from `/models`.** All five tables are in schema `customerorders`; Models lists two. Seeing two is correct.
- **The destination schema is the upload's name**, `customerorders`, with no target-schema field anywhere in the form.

⚠️ **The upload was deliberately *not* named `customerorderssync`.** Both orgs write into the same physical `docs_warehouse`, and schemas are the only namespace — reusing the name would have had `replace` drop the Docs-QA org's tables. Verified after the run that `customerorderssync` still holds its 5 tables. **When two orgs share a destination database, the upload name is a shared resource.**

**2026-07-18 (Step 2)** — field labels verified against the live shipped UI (`db_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Host**, **Port**, **User**, **Password**, **Database** — no Schema field. The type dropdown shows the lowercase key **`postgres`**, not "PostgreSQL". Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: dropdown key, "Name" → "Connection Name", "Save" → "Create Connection".

**2026-07-22 (Steps 3–5)** — driven end-to-end on production against a real Postgres source. A seeded demo database (`docs_samples`: `customers` 12 rows, `orders` 7 rows) was loaded into a separate `docs_warehouse` database. Run 5 returned `success` with **19 rows** = 12 + 7, and the rows were confirmed **in the destination**, not merely in the run counter:

```
customerorderssync | customers | 12
customerorderssync | orders    |  7
1001 | Ada Lovelace | ada@example.com | GB | pro | 1840.00
```

Corrections, all verified live — this guide carried the same wrong walkthrough as the other 31 in [landing#272](https://github.com/datanika-io/datanika-landing/issues/272):

1. **"Open the connection … click *Configure pipeline*" does not exist.** Connection rows offer only Test / Edit / Copy / Delete. Extract-load is a **New Upload** at `/uploads` taking a source *and* a destination connection. `/pipelines` is the dbt builder.
2. **"From the pipeline page, click *Run now*"** → **Run** on the upload's own row at `/uploads`.
3. **"Click *Schedule*, pick a cadence"** → `/schedules` is its own page: target type, target **name**, a five-field **cron**, timezone. No cadence picker; an unscheduled upload *is* manual-only.
4. **Target schema is not chosen.** The guide said to pick one (`raw_postgres`). There is no target-schema field — the upload lands in a schema **named after the upload**, confirmed as `customerorderssync` in the destination.
5. **Per-table write disposition / primary key / incremental cursor are not configured in a table picker.** Write Disposition and Load Mode are single form-level dropdowns; table selection is a comma-separated **Table names** input.

**The SQL-source form shape is now observed rather than inferred** — [landing#272](https://github.com/datanika-io/datanika-landing/issues/272) explicitly flagged it as unverified. With a SQL source selected the New Upload form carries **Load Mode** (`full_database`), **Write Disposition** (`append`), `Source schema (optional, e.g. public)`, `Table names (comma-separated, optional)`, `Batch size (optional, default 10000)`, and the Schema Contract trio. The inference was correct.

## Not yet captured

- `01-credentials.png` — psql role creation happens in a terminal, not in Datanika's UI.

## Capture notes (2026-07-22) — three things that produced wrong shots first

1. **The connection picker's options and the uploads table below share the same text.** `getByText(/docssamplesdb/).first()` matched a **table row**, not the dialog option — the dialog closed with nothing selected, and the only tell was the label coming back as `docssamplesdb (postgres)` instead of `16 — docssamplesdb (postgres)`. Scope option lookups to `getByRole('dialog')`.
2. **`body.innerText` is not a check that the *form* shows something.** The uploads table lists the same connection names, so a body-wide assertion passed while both pickers rendered their placeholder — and that shot was nearly shipped. Assert against the form card only.
3. **Target name has an in-app autocomplete that covers the cron field.** It is a Reflex-rendered list, not a browser popup, so it *does* appear in screenshots (browser autofill does not). Dismiss it by clicking the suggestion, the way a user would.

> **Reusable for the other SQL guides — but only deliberately.** Both shots show `(postgres)` in the pickers, so they are visibly Postgres and are **not** copied into mysql/mssql/oracle/sqlite. The *shape* is identical for those; capture your own or note the reuse in that guide's README.

> 🚨 **`04-first-run.png` is NO LONGER reusable across SQL guides, and that reversal is deliberate.** The 2026-07-22 note said the opposite, correctly, about the old shot: `/runs` showed nothing Postgres-specific. **The new shot does.** It names `Schema: customerorders`, lists Postgres type spellings (`BIGINT`, `NUMERIC(10, 2)`), and shows twelve rows that came out of a Postgres database. Dropping it into `mysql.md` would be a picture of a Postgres load captioned as a MySQL one — the precise failure [landing#395](https://github.com/datanika-io/datanika-landing/issues/395) exists to stop. **Capture your own, from your own run.**
>
> That is the cost of the criterion, and it is worth paying: a screenshot generic enough to reuse everywhere is a screenshot that proves nothing about anywhere.
