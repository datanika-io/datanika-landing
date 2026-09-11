---
title: "Google Sheets to Your Warehouse: the Share Step Is the One That Fails"
description: "Syncing a spreadsheet is four fields and a cron. The step that actually breaks is one nobody puts in a tutorial - the sheet has to be shared with a service account that has no mailbox, and Datanika deliberately refuses to tell you it worked."
date: 2026-09-19
publishedAt: 2026-09-19
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "google-sheets", "connectors", "elt", "warehouse"]
---

Google Sheets is the most common shadow database in any company. Marketing keeps campaign spend in one, finance maintains the budget model in another, ops runs a lightweight CRM in a third. None of it is in the warehouse, so none of it can be joined to anything, so somebody copy-pastes it into a dashboard once a month and everyone quietly agrees not to ask how fresh it is.

Landing a sheet in your warehouse is genuinely quick — a service account, four fields, a cron. This post is about the one step in the middle that fails for almost everybody the first time, and about a button that will refuse to tell you whether it worked.

## The setup, briefly

Google Sheets is **source-only** in Datanika: you land it somewhere, you do not write back to it. You need a destination warehouse already connected — [PostgreSQL](/connectors/postgresql) is the quickest if you do not have one yet — and a Google Cloud project with the **Google Sheets API** enabled.

If you already run [BigQuery](/connectors/bigquery) with Datanika, reuse that same project and its service account; you only need to enable the Sheets API on it and do the sharing step below.

Create a service account — **IAM & Admin → Service accounts** — and give it **no IAM roles at all**. This trips people up, because granting a role feels like the responsible thing to do. It is not relevant here: the service account reaches Sheets through the Sheets API, not through GCP resources, so a role grant would widen its access without enabling anything you need. Create a **JSON key**, download it, and note the account's email address:

```
datanika-sheets-reader@your-project.iam.gserviceaccount.com
```

That address is the whole story of this post.

## The step that fails

**A Google service account can only read spreadsheets that have been explicitly shared with it.** Not sheets your account can see. Not sheets in a Drive folder it can reach. The specific spreadsheet, shared with that specific address, the same way you would share it with a colleague.

So: open the sheet, click **Share**, paste `datanika-sheets-reader@your-project.iam.gserviceaccount.com`, set it to **Viewer** — Datanika never writes to Google Sheets — and, the part that catches people, **untick "Notify people"** before you confirm. The service account has no mailbox, so there is nobody to notify.

Repeat for every spreadsheet you want this connection to read. There is no folder-level shortcut.

## The button that says "not tested"

Now add the connection. Open **`/connections`** — the form is already on the page, there is no "New Connection" button to hunt for — pick `google_sheets` from the type dropdown, and fill in three fields:

- **Connection Name** — something you will recognise later, like `gsheets-marketing-budget`.
- **Spreadsheet URL** — the **full** URL, `https://docs.google.com/spreadsheets/d/<ID>/edit`, not just the ID.
- **Service Account JSON** — the entire contents of the key file. It is encrypted at rest with Fernet.

Then click **Test Connection**, and watch it decline to give you a verdict. It returns a neutral **not tested**, carrying the reason.

This is deliberate, and it is worth explaining, because a lot of tools would have shown you a green tick here.

Verifying a service-account credential means minting an OAuth token. That is a real check, and it would pass — the JSON is well-formed, the key is valid, the API is enabled. But it would tell you nothing about the failure you are actually going to hit, because **the sharing permission is checked per upload, not per connection**. A green tick at this point would be an accurate statement about the credential and a misleading one about the pipeline, and the person reading it cannot tell those apart.

The alternative — a red cross — is worse in the other direction: a connection that is fine, reported as broken. Reporting an unverified thing as working and reporting it as failed are the same lie told in two directions. So the button says what is true: it has not been tested here, and **the first real verification is the first run**.

Click **Create Connection** and go get one.

## Configure the upload

Extract-load lives at **`/uploads`**, not on the connection. Connection rows offer Test / Edit / Copy / Delete and nothing else, and `/pipelines` is the **dbt** builder — a different thing entirely.

Open `/uploads`, and note the first quirk while you type: **the upload name accepts letters and digits only**, and strips everything else as you type. `sheets-daily-sync` becomes `sheetsdailysync` in front of you. This matters more than it looks, because the schedule you create later references the upload **by name**, exactly as saved.

Pick your source and destination connections — the pickers list entries as `16 — myconnection (postgres)`, so id, name, type — and then set:

- **Sheet Names** *(optional, comma-separated)* — name the tabs you want. **Leave it empty to load every tab in the spreadsheet.**
- **Batch size** — 10000 by default.
- **Schema Contract** — three dropdowns, **Tables** / **Columns** / **Data Type**, deciding whether a changed incoming shape evolves the destination or fails the run. For a spreadsheet that humans edit, this is the setting worth thinking about hardest: somebody *will* add a column.

There is no write disposition, load mode, source schema or table-name field, and that is not an omission — those controls are rendered only when the source is a SQL database.

## The first run is the actual test

Hit **Run** on the upload's row. There is no "Run now" on a pipeline page; the trigger lives on the upload's own row. Watch `/runs`: status badge, start and finish timestamps, a **Rows** count, and a **Logs** icon for the detail.

If the share step went wrong, this is where you find out.

When it finishes, open **Models** (`/models`). Your tables land in a schema **named after the upload** — `sheetsdailysync` creates schema `sheetsdailysync`. dlt also writes its own `_dlt_loads`, `_dlt_pipeline_state` and `_dlt_version` bookkeeping tables into that schema, and Models does not list them; seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.

Then do the thing the badge cannot do for you: **spot-check the row count against the sheet.** A green run means the load finished. It does not mean it moved what you expected — an empty tab and a tab you forgot to share are very different problems that can produce the same colour.

## Put it on a cron

Schedules are at **`/schedules`**, and reference the upload by name:

- **Target type** — `upload`.
- **Target name** — exactly as saved, so `sheetsdailysync`.
- **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option; leaving an upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
- **Timezone** — `UTC` by default, and the cron is evaluated in it, which matters for daily and weekly cadences.

Then wire failure alerts in **Settings → Notifications**, because a spreadsheet pipeline breaks for a reason no other pipeline has: somebody renames a tab.

## The one-line version

Everything in a Sheets sync is easy except remembering that the service account is a stranger to your spreadsheet until you introduce them. If a run fails and the credential is fine, you already know which step to go back to.

Full field-by-field reference: the [Google Sheets setup guide](/docs/connectors/google-sheets) and the [connector page](/connectors/google-sheets).
