---
title: "Connect Google Analytics to Datanika"
description: "Step-by-step guide to sync Google Analytics 4 into your warehouse with Datanika — create a service account, add the connection, pick properties, run, and schedule."
source: "google-analytics"
source_name: "Google Analytics"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Google Analytics is the highest-volume marketing source our users sync — landing GA4 data in a warehouse unlocks attribution modeling, funnel analysis, and cross-channel reporting that the GA4 interface alone can't do. This guide walks you end-to-end: create a GCP service account with GA4 read access, wire it into Datanika, pick which properties and reports to sync, run the first backfill, and put it on a schedule. Expect 5–15 minutes for a first run depending on your date range.

> **This guide covers Google Analytics 4 (GA4).** Universal Analytics was sunset by Google in July 2024. If you still need UA data, export it to BigQuery first and then pipe it via the BigQuery connector.

> **Looking for the connector spec?** For the full field-by-field reference — supported dimensions, metrics, date ranges, quotas — see the [Google Analytics connector page](/connectors/google-analytics).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika (PostgreSQL, BigQuery, Snowflake, Redshift, ClickHouse, or DuckDB). Google Analytics is **source-only** — you can't use it as a destination.
- A **Google Analytics 4 property** with data flowing in. You'll need the **Property ID** (a numeric ID like `123456789`), found in GA4 → Admin → Property Settings.
- A **GCP service account** with the Viewer role on the GA4 property. If you don't have GCP access, ask your Google Workspace admin — they can grant it from the GA4 Admin panel directly (see Option B below).

## Step 1 — Create credentials for Google Analytics

### Option A — GCP Service Account (recommended)

1. Open the GCP Console → **IAM & Admin → Service Accounts**.
2. Click **+ Create Service Account**. Name it `datanika-ga-reader`.
3. **Do not** grant any GCP project roles — GA4 permissions are managed inside the GA4 Admin panel, not IAM.
4. Create a **JSON key** for the service account: Keys → Add Key → Create new key → JSON. Download and store it securely.
5. Copy the service account email (e.g., `datanika-ga-reader@my-project.iam.gserviceaccount.com`).
6. In **GA4 → Admin → Property Access Management**, click **+**, paste the service account email, and grant the **Viewer** role.

### Option B — Grant directly in GA4 (no GCP Console needed)

1. In GA4, go to **Admin → Property Access Management → +**.
2. Add the service account email and grant **Viewer**.
3. You still need the JSON key file from GCP — ask the service account owner to share it.

> **Least privilege.** The Viewer role lets Datanika read reports and metadata. It cannot modify property settings, create audiences, or access raw event-level data beyond what the GA4 Data API exposes. Never grant Editor or Admin.
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `google_analytics`.
3. Fill in the form:
   - **Connection Name** — e.g. `ga4-prod` or `ga4-marketing`.
   - **Property ID** — the GA4 property ID (numeric), e.g. `123456789`.
   - **Service Account JSON (optional)** — paste the entire contents of the JSON key file from Step 1. Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **Test Connection for Google Analytics.** The **Test Connection** button is present, but because GA4 is an HTTP-API source it returns *"Test not applicable for this type"* — the credential is validated on the first pipeline run. If the service account lacks Viewer access, the run fails immediately with a clear permission error.

![Adding the Google Analytics connection in Datanika](/docs/connectors/google-analytics/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `ga4-daily-sync` becomes `ga4dailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Google Analytics connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Google Analytics is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Google Analytics the list is `report`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all — though unticking *every* box loads the full set rather than nothing.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Google Analytics rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `ga4dailysync` creates schema `ga4dailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `ga4dailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `403: User does not have sufficient permissions for this property`
**Cause.** The service account doesn't have the Viewer role on the GA4 property, or the Property ID in the connection doesn't match the property where access was granted.
**Fix.** In GA4 → Admin → Property Access Management, verify the service account email is listed with Viewer. Double-check the Property ID (numeric) matches.

### `429: Quota exhausted for the day`
**Cause.** The GA4 Data API daily token quota (200,000) has been exceeded. This happens with frequent schedules, large date ranges, or many concurrent reports.
**Fix.** Reduce the date range (use `start_date` to limit backfill), reduce schedule frequency to daily, or split reports across multiple runs. The quota resets at midnight Pacific Time.

### Run succeeds but tables are empty
**Cause.** The `start_date` is in the future, the property has no data for the requested date range, or the GA4 property is brand new and hasn't processed any events yet.
**Fix.** Check the GA4 Realtime report to confirm data is flowing. Set `start_date` to a date you know has traffic. New GA4 properties can take 24–48 hours before data appears in the Data API.

### Row counts don't match the GA4 interface
**Cause.** GA4 applies thresholding (data redaction for small user groups) and sampling to the Data API. The web interface uses a different query engine that may show unsampled results.
**Fix.** This is expected behavior and not a bug. Discrepancies under 5% are typical. For exact parity, use GA4's BigQuery export (raw events) instead of the Data API — then pipe from BigQuery to your warehouse using the [BigQuery connector](/docs/connectors/bigquery).

### `INVALID_ARGUMENT: Unknown dimension/metric`
**Cause.** A dimension or metric name in the report configuration doesn't exist in GA4's schema. This can happen with custom dimensions that were renamed or deleted.
**Fix.** Check the GA4 Data API [dimensions & metrics reference](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema). Update the report configuration in Datanika to use valid names.

## Related

- **Comparisons:** [Datanika vs Fivetran for Google Analytics](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** starter staging models for `raw_ga4` and attribution modeling in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Google Analytics connector spec](/connectors/google-analytics)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
