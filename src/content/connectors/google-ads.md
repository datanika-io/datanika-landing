---
title: "Connect Google Ads to Datanika"
description: "Step-by-step guide to sync Google Ads campaigns into your warehouse with Datanika — set up a service account, add the connection, pick reports, run, and schedule."
source: "google_ads"
source_name: "Google Ads"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Google Ads data is essential for marketing attribution, ROAS analysis, and budget optimization — but the Google Ads UI makes it hard to join ad spend with revenue data from your CRM or warehouse. This guide lands Google Ads data in your warehouse so you can build cross-channel attribution dashboards that combine ad performance with conversion and revenue data. Create a service account, wire it into Datanika, pick reports, run, and schedule.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported report types, metrics, dimensions — see the [Google Ads connector page](/connectors/google-ads).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Google Ads is **source-only**.
- A **Google Ads account** with campaigns you want to analyze. You need the **customer ID** (the 10-digit number at the top of the Google Ads UI, formatted `123-456-7890` — enter it without hyphens in Datanika).
- A **Google Cloud project** with the Google Ads API enabled.
- A **service account** with domain-wide delegation, or a service account linked to the Google Ads account via the Manager Account (MCC) pattern.

## Step 1 — Create a service account and enable the Google Ads API

If you already have a GCP service account from setting up BigQuery or Google Analytics in Datanika, you can reuse it — just enable the Ads API and grant access.

1. In the [Google Cloud Console](https://console.cloud.google.com/), go to **IAM & Admin → Service accounts**.
2. Create a service account named `datanika-ads-reader`. No IAM roles needed.
3. Create a JSON key: **Keys → Add key → Create new key → JSON**. Download the file.
4. Enable the **Google Ads API**: go to **APIs & Services → Enable APIs → search "Google Ads API" → Enable**.
5. **Grant the service account access to your Google Ads account:**
   - If you use a **Manager Account (MCC)**: in the MCC, go to **Admin → Access and security → Invite user** → paste the service account email → grant **Read only** access.
   - If you don't use an MCC: you'll need domain-wide delegation. See [Google's service account guide](https://developers.google.com/google-ads/api/docs/oauth/service-accounts) for the domain-wide delegation flow.

> **Least privilege.** Grant **Read only** access. Datanika never modifies campaigns, budgets, or ad groups.
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `google_ads`.
3. Fill in:
   - **Connection Name** — e.g. `google-ads-prod` or `google-ads-acme`.
   - **Customer ID** — your 10-digit Google Ads customer ID, e.g. `123-456-7890`.
   - **Service Account JSON (optional)** — paste the full contents of the JSON key file. Stored encrypted at rest with Fernet.
4. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **Credentials are validated on the first run.** Google Ads is an HTTP-API source, so the **Test Connection** button reports *"Test not applicable for this type"* — the credentials and access are validated when the first pipeline runs.

![Adding Google Ads in Datanika](/docs/connectors/google-ads/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `googleads-daily-sync` becomes `googleadsdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Google Ads connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Google Ads is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Google Ads the list is `customers`, `campaigns`, `ad_groups`, `ads`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Google Ads rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `googleadsdailysync` creates schema `googleadsdailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `googleadsdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `PERMISSION_DENIED` or `USER_PERMISSION_DENIED`
**Cause.** The service account doesn't have read access to the Google Ads customer ID.
**Fix.** In Google Ads (or MCC), go to **Admin → Access and security** and verify the service account email has at least **Read only** access.

### `INVALID_CUSTOMER_ID`
**Cause.** The customer ID is wrong, includes hyphens, or points to a Manager Account instead of a leaf account.
**Fix.** Use the 10-digit customer ID without hyphens. If you're using an MCC, enter the child account ID, not the MCC ID.

### `GOOGLE_ADS_API_NOT_ENABLED`
**Cause.** The Google Ads API isn't enabled for the GCP project.
**Fix.** Go to **APIs & Services → Enable APIs → Google Ads API → Enable** in the Cloud Console.

### Cost values look 1,000,000x too high
**Cause.** Google Ads API returns cost in **micros** (1 USD = 1,000,000 micros). This is by design.
**Fix.** Divide by 1,000,000 in your dbt staging model: `cost_micros / 1000000.0 AS cost_usd`.

### Conversion numbers don't match the Google Ads UI
**Cause.** Google Ads attributes conversions over a lookback window (default 30 days). Data from the last 30 days can change retroactively as conversions are attributed.
**Fix.** Use `merge` write disposition with a 30-day lookback re-pull, or accept that recent days' numbers are provisional.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** ad-spend attribution models from `raw_google_ads` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Google Ads connector spec](/connectors/google-ads)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
