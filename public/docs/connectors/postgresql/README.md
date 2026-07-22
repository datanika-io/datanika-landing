# PostgreSQL setup-guide screenshots

Referenced from `src/content/connectors/postgresql.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `postgres` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form with a real SQL source selected (`16 — docssamplesdb (postgres)` → `17 — docswarehouse (postgres)`), showing the **SQL-source shape**: Load Mode, Write Disposition, Source schema (`public`), Table names (`customers, orders`), Batch size, Schema Contract. Captured 2026-07-22 by filling the live form on prod — **nothing was submitted**, so no stray upload was created. |
| `04-first-run.png` | Step 4 | The `/runs` table after a **real** Postgres → Postgres load on production: run 5, `success`, **19 rows**, with the Logs icon. Captured 2026-07-22, cropped to the header + the single run row to match the cropped style of the other guides' shots. No credentials on screen. |
| `05-schedule.png` | Step 5 | The **New Schedule** form filled for the same upload: target type `upload`, target name `customerorderssync`, cron `0 3 * * *`, timezone `UTC`. Captured 2026-07-22. **Deliberately not submitted** — an Active nightly schedule firing runs into live alerting is not something to leave behind (the same reason schedule 7 was deleted in the csv session). |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-22`.

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

> **Reusable for the other SQL guides — but only deliberately.** `/runs` shows nothing Postgres-specific, so `04-first-run.png` is visually valid for any SQL-database source. It is deliberately **not** copied into the other guides here: the run it shows is a Postgres run, and fanning one capture across connectors nobody exercised is how the guides drifted in the first place. Reuse it with a note in that guide's README, or capture your own.
