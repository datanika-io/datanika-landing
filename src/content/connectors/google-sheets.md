---
title: "Connect Google Sheets to Datanika"
description: "Step-by-step guide to sync Google Sheets into your warehouse with Datanika — create a service account, share the spreadsheet, add the connection, run, and schedule."
source: "google_sheets"
source_name: "Google Sheets"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Google Sheets is the most common "shadow database" — marketing teams track campaigns in them, finance teams maintain budget models, and operations teams use them as lightweight CRMs. This guide lands spreadsheet data in your warehouse so you can join it with production data, run SQL analytics on it, and stop copy-pasting between tabs. Create a GCP service account, share the spreadsheet with it, wire it into Datanika, and schedule syncs. Under 10 minutes end-to-end.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — sheet selection, header handling, type inference — see the [Google Sheets connector page](/connectors/google-sheets).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Google Sheets is **source-only**.
- A **Google Cloud project** with the Google Sheets API enabled. If you already use BigQuery or Google Analytics with Datanika, reuse the same project.
- A **service account** in that project (created in Step 1 below).
- The **spreadsheet ID** of the sheet you want to sync. Find it in the URL: `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.

## Step 1 — Create a service account in GCP

If you already have a service account from setting up BigQuery or Google Analytics in Datanika, you can reuse it — just enable the Sheets API and share the spreadsheet (Step 1.5).

1. In the [Google Cloud Console](https://console.cloud.google.com/), go to **IAM & Admin → Service accounts**.
2. Click **Create service account**.
3. Name it `datanika-sheets-reader` and click **Create and continue**.
4. Skip the optional role grant (the service account doesn't need any GCP IAM roles — it accesses Sheets via the API, not GCP resources).
5. Click **Done**.
6. Open the service account → **Keys → Add key → Create new key → JSON**. Download the JSON file. This is the credential you'll paste into Datanika.
7. Enable the **Google Sheets API** for your project: go to **APIs & Services → Enable APIs → search "Google Sheets API" → Enable**.

> **The service account email looks like `datanika-sheets-reader@your-project.iam.gserviceaccount.com`.** You'll need this in the next step.
### Step 1.5 — Share the spreadsheet with the service account

This is the step most people forget. The service account can only read spreadsheets explicitly shared with it.

1. Open the Google Sheet you want to sync.
2. Click **Share** (top-right).
3. Paste the service account email (`datanika-sheets-reader@your-project.iam.gserviceaccount.com`).
4. Set permission to **Viewer** (read-only). Datanika never writes to Google Sheets.
5. Uncheck "Notify people" (the service account doesn't have a mailbox) and click **Share**.

Repeat for every spreadsheet you want to sync with this connection.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `google_sheets`.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `gsheets-marketing-budget` or `gsheets-ops-tracker`.
   - **Spreadsheet URL** — paste the **full** spreadsheet URL (e.g. `https://docs.google.com/spreadsheets/d/<ID>/edit`), not just the ID.
   - **Service Account JSON** — paste the full contents of the JSON key file from Step 1. Stored encrypted at rest with Fernet.
4. Click **Test Connection** — it returns a neutral **not tested** verdict here, for the reason below — then **Create Connection**.

> ⚠️ **Test Connection does not check this connection, and it will tell you so.** The credential is a service-account JSON, and verifying it means minting an OAuth token. The step that usually fails — **sharing the spreadsheet with the service-account email** — is checked per upload, not per connection. The button returns a neutral **not tested** verdict carrying that reason — deliberately neither green nor red, because reporting an unverified connection as working and reporting it as failed are the same lie told in opposite directions. **The first real verification is the first pipeline run** — where both the credential and the sharing permission are checked for real.

![Adding Google Sheets in Datanika](/docs/connectors/google-sheets/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `sheets-daily-sync` becomes `sheetsdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Google Sheets connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. **Sheet Names (optional, comma-separated)** — an input placeholdered `Sheet1, Sheet2 (leave empty for all sheets)`. Name the tabs you want, comma-separated. Leave it empty to load **every** tab in the spreadsheet.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a Google Sheets source, and that is deliberate.** Those controls are rendered only when the source is a SQL database.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `sheetsdailysync` creates schema `sheetsdailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `sheetsdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `The caller does not have permission` (403)
**Cause.** The spreadsheet isn't shared with the service account email.
**Fix.** Open the sheet → Share → paste the service account email → set to Viewer. See Step 1.5.

### `Requested entity was not found` (404)
**Cause.** The spreadsheet ID is wrong, or the sheet was deleted/moved to trash.
**Fix.** Double-check the ID from the URL. If the sheet was trashed, restore it in Google Drive.

### `Google Sheets API has not been enabled`
**Cause.** The Sheets API isn't enabled for the GCP project the service account belongs to.
**Fix.** Go to **APIs & Services → Enable APIs → Google Sheets API → Enable** in the Cloud Console.

### Empty table or missing columns
**Cause.** The sheet has merged cells, hidden rows, or the header row isn't in row 1. The Sheets API reads the raw cell grid — merged cells return values only in the top-left cell.
**Fix.** Unmerge cells, unhide rows, and ensure headers are in row 1. Re-run after fixing.

### Type mismatches (numbers loaded as strings)
**Cause.** Google Sheets doesn't enforce column types — a "number" column can have text in some rows. Datanika infers the type from the first batch of values.
**Fix.** Clean up the source sheet, or cast in a dbt staging model: `CAST(amount AS NUMERIC)`.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** starter staging models for `raw_gsheets` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Google Sheets connector spec](/connectors/google-sheets)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
