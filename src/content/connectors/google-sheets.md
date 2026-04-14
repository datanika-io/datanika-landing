---
title: "Connect Google Sheets to Datanika"
description: "Step-by-step guide to sync Google Sheets into your warehouse with Datanika — create a service account, share the spreadsheet, add the connection, run, and schedule."
source: "google_sheets"
source_name: "Google Sheets"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating a service account](/docs/connectors/google-sheets/01-credentials.png)

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
2. From the **type dropdown** at the top of the form, pick **Google Sheets**.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `gsheets-marketing-budget` or `gsheets-ops-tracker`.
   - **Spreadsheet ID** — the ID from the sheet URL (between `/d/` and `/edit`).
   - **Service account JSON** — paste the full contents of the JSON key file from Step 1. Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **No "Test connection" button.** Google Sheets is an HTTP-API source — the credential and sharing permission are validated on the first run.

![Adding Google Sheets in Datanika](/docs/connectors/google-sheets/02-add-connection.png)

## Step 3 — Configure sheets and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_gsheets`.
3. Datanika reads each worksheet tab as a separate table. Select which tabs to sync.
4. For each tab, pick a **Write disposition**:
   - `replace` — full refresh. The right default for most sheets, which are small enough to reload in seconds.
   - `append` — adds new rows. Only use if the sheet is append-only and rows are never edited or deleted.
   - `merge` — upserts. Requires a column that serves as a unique key. Sheets rarely have one naturally, so `replace` is usually simpler.
5. Save the pipeline configuration.

> **Tip.** Datanika uses the first row of each tab as column headers. If your sheet doesn't have headers in row 1, add them — otherwise column names will be auto-generated (`column_0`, `column_1`, …).

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Google Sheets syncs are fast — the API returns all rows in one batch for sheets under 10M cells, so most runs finish in seconds.
3. If the service account doesn't have Viewer access to the spreadsheet, the run fails with a `403 Forbidden` or `The caller does not have permission` error. Go back to Step 1.5 and share the sheet.
4. When the run finishes, open **Catalog → `<your warehouse>` → `raw_gsheets`** and browse. One table per worksheet tab.
5. Spot-check: row counts should match the sheet minus the header row.

![First Google Sheets run](/docs/connectors/google-sheets/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence. Sheets change at human speed:
   - **Daily at 03:00** — standard for reporting dashboards.
   - **Every 6 hours** — if the sheet is actively edited throughout the day.
   - **Hourly** — rarely needed unless the sheet is updated programmatically (Apps Script, Zapier).
3. Choose a **timezone** and save.

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
