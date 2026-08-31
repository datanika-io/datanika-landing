---
title: "Connect <Source> to Datanika"
description: "Set up a <Source> connection in Datanika: create credentials, add the connection, configure the upload, run, and schedule."
source: "<source-slug>"
source_name: "<Source>"
category: "<database | saas | file | api>"
verified_by: ""
verified_date: ""
related_use_cases: []
related_comparisons: []
draft: false
---

<!--
  🚨 READ BEFORE COPYING THIS FILE.

  This template is the generator for every connector guide, and it is why the
  landing#272 / #285 sweep did not hold: those passes corrected the 36 outputs and left
  this file teaching the defect, so every guide written afterwards reproduced it
  (landing#401).

  Steps 2–5 below describe **navigation that actually exists**, verified against core
  `origin/dev`. They are not placeholders. Replace the <angle-bracket> parts; do not
  "improve" the surfaces:

    * Extract-load is configured at `/uploads`, NOT on the connection. There is no
      "Configure pipeline" button — connection rows offer Test / Edit / Copy / Delete,
      and `/pipelines` is the dbt builder, a different thing.
    * The run control is **Run**, on the upload's own row. There is no "Run now".
    * The landed tables are browsed in **Models** (`/models`). There is NO Catalog page
      and no Catalog nav entry. ("Data Catalog" is fine as a *feature* name — `/docs/catalog`,
      the compare tables. The defect is telling someone to click a "Catalog" that is not
      there. The only UI string reading "Catalog" is the Unity Catalog field on a
      Databricks connection, which is worse than nothing: the reader finds an unrelated
      form input on another page.)
    * The destination schema is **named after the upload**. There is no target-schema
      field, and `raw_<source>` is not typeable — upload names are validated
      `^[a-zA-Z0-9 ]+$`.
    * dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` tables exist in the
      warehouse but `CatalogService` skips every `_dlt_*` table, so Models never lists
      them. Do not promise they appear — that tells the reader to read a correct result
      as a partial failure.

  Guarded by tests/phantom-nav-instructions.test.ts, which reads this file.
-->

# Connect <Source> to Datanika

One-paragraph intro: what this connector does, what data it extracts, and what the end result looks like after following this guide (e.g., "<Source> tables landed in your warehouse, ready to transform with dbt").

## Prerequisites

- A Datanika account with permission to create connections (Admin or Editor role).
- A destination warehouse already connected in Datanika (PostgreSQL, BigQuery, Snowflake, etc.).
- Access to <Source> with permission to `<required permission>`.
- `<any tool, CLI, or network access requirement>`.

## Step 1 — Create credentials in <Source>

Walk the reader through creating the credentials/API key/service account in the **source system's UI**. Keep it step-by-step with exact menu paths.

1. Sign in to <Source> and go to **<Menu> → <Submenu>**.
2. Click **<Button>** and give it a descriptive name (e.g., `datanika-readonly`).
3. Grant the following scopes/permissions:
   - `<scope 1>`
   - `<scope 2>`
4. Copy the generated `<API key | client ID + secret | connection string>` — you'll paste it into Datanika in the next step.

> **Least privilege:** only grant read access to the objects you plan to sync. Datanika never needs write permissions on the source.

![Creating credentials in <Source>](/docs/connectors/<source-slug>/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `<source-slug>`.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `<source>-prod`.
   - **<Field 1>** — `<what to paste>`
   - **<Field 2>** — `<what to paste>`
4. Click **Test Connection**, then **Create Connection**.

> `<If the source is an HTTP API, say so here: Test Connection reports "Test not applicable for this type" and the credential is validated for real on the first run.>`

![Adding the <Source> connection in Datanika](/docs/connectors/<source-slug>/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `<source>-daily-sync` becomes `<source>dailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection**. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. `<For a SaaS/API source: the form shows **Select endpoints to load** — a checkbox per resource, all ticked by default. For <Source> the list is `<endpoints>`. For a SQL source: the write disposition, load mode, source schema and table-name controls are rendered here instead.>`
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **The destination schema is named after the upload, and there is no field to change it.** An upload called `<source>dailysync` creates schema `<source>dailysync`. If you want a `raw_`-prefixed schema, name the upload **`Raw <Source>`** — the space is legal and becomes the underscore.

![Configuring the <Source> upload](/docs/connectors/<source-slug>/03-configure-upload.png)

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail. **Rows** is one total for the whole run, not a per-table breakdown.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load.
4. **Open the landed table and click `Load first 100 rows`.** The **Data preview** on the model detail page runs a live `SELECT` against your destination, so the rows on screen are the rows in your warehouse — not a copy of what the run *reported*.
5. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

![The Data preview on the landed <table> table, showing N rows read live from the destination](/docs/connectors/<source-slug>/04-first-run.png)

<!--
🚨 04-first-run.png MUST BE THE DATA PREVIEW, NOT THE /runs TABLE.

The standing acceptance criterion is **rows in the destination, verified in the
destination** — never a green run row. It is worded that way because a green run
has been wrong twice: core#492 (file sources loaded a *listing* of files rather
than their contents and reported `success`) and core#493 (a zero-match glob also
completes as `success`, so a wrong path and a right path look identical in /runs).

Three guides once had a `04-first-run.png` and all three showed /runs, which is
why landing#395 scored the set 0/36 rather than 3/36.

Rules for capturing yours:
  - Run YOUR connector. Do not reuse another guide's image, however similar the
    screen looks. csv and duckdb were once byte-identical; that is the drift.
  - Verify the rows in the destination itself (psql / the warehouse console),
    not only in the app, before you take the picture.
  - Never hand-place rows. A picture of data our pipeline did not load, published
    as proof our pipeline loads data, is the one thing this criterion forbids.
  - Capture gate: read every input's `.value` first and refuse the shot if a
    credential field is non-empty. `browser_snapshot` prints input values.
  - Record connection / upload / run ids and the destination row counts in this
    guide's `public/docs/connectors/<source-slug>/README.md`.

Worked examples: postgresql, csv, json, parquet (landing PR #407).
-->

<!--
🚨 The landed TABLE's name depends on which branch the reader took, for file
connectors (csv / json / parquet / s3). Say the one that applies, or both:
  - Uploaded through the **Upload File** widget → the table takes the file's name
    without its extension (`q3-signups.csv` -> `q3_signups`). `upload_tasks.py`
    sets `dlt_config["table_name"]` from the stem.
  - Pointed at a **directory path** → the glob has a wildcard, `_file_table_name()`
    finds no single filename, and the table is named after the connector (`csv`).
The csv guide asserted the second for both and was wrong for the branch it
recommends first.
-->

<!--
🚨 The destination SCHEMA is the upload's name, and on a shared destination
database that makes the upload name a shared resource: `write_disposition:
replace` will drop another org's tables if you reuse their upload name. Check the
schema list before choosing one.
-->

<!--
Type fidelity is not format-neutral and the file guides now say so, measured
against one Postgres destination on 2026-08-31:
  csv     `signed_up_on` -> character varying
  json    `recorded_at`  -> timestamp with time zone
  parquet `measured_on`  -> date
-->


## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `<source>dailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

![Scheduling the <Source> upload](/docs/connectors/<source-slug>/05-schedule.png)

## Troubleshooting

### `<Error message 1>`
**Cause:** `<short explanation>`
**Fix:** `<concrete steps>`

### `<Error message 2>`
**Cause:** `<short explanation>`
**Fix:** `<concrete steps>`

### `<Error message 3>`
**Cause:** `<short explanation>`
**Fix:** `<concrete steps>`

### Connection test fails with a timeout
**Cause:** Datanika can't reach <Source> — usually a firewall or IP allowlist issue.
**Fix:** Allowlist Datanika's egress IPs (see [Self-hosting networking](/docs/self-hosting)) or expose <Source> on a reachable endpoint.

### Incremental run is pulling everything every time
**Cause:** The incremental cursor column isn't actually monotonic, or the upload was set to `replace` instead of `merge`.
**Fix:** Verify the cursor column in Step 3 and switch the write disposition to `merge` with a correct primary key. (SQL sources only — a SaaS source renders no such control.)

## Related

- **Use cases:** [<Source> to PostgreSQL](/use-cases/<source-slug>-to-postgres), [<Source> to BigQuery](/use-cases/<source-slug>-to-bigquery)
- **Comparisons:** [Datanika vs Airbyte for <Source>](/compare/airbyte), [Datanika vs Fivetran for <Source>](/compare/fivetran)
- **dbt tips:** starter models for the schema your upload created — see [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [<Source> connector spec](/connectors/<source-slug>)
