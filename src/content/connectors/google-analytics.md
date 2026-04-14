---
title: "Connect Google Analytics to Datanika"
description: "Step-by-step guide to sync Google Analytics 4 into your warehouse with Datanika — create a service account, add the connection, pick properties, run, and schedule."
source: "google-analytics"
source_name: "Google Analytics"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases:
  - "google-analytics-to-bigquery"
  - "google-analytics-to-snowflake"
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

![Granting the service account Viewer access in GA4](/docs/connectors/google-analytics/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Google Analytics**.
3. Fill in the form:
   - **Name** — e.g. `ga4-prod` or `ga4-marketing`.
   - **Property ID** — the GA4 property ID (numeric), e.g. `123456789`.
   - **Service Account JSON** — paste the entire contents of the JSON key file from Step 1. Stored encrypted at rest with Fernet.
4. Click **Save**.

> **Google Analytics connections don't have a "Test connection" button.** The GA4 Data API doesn't expose a lightweight health-check endpoint. The credential is validated on the first pipeline run. If the service account lacks Viewer access, the run fails immediately with a clear permission error.

![Adding the Google Analytics connection in Datanika](/docs/connectors/google-analytics/02-add-connection.png)

## Step 3 — Configure reports and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_ga4` so it's obvious where the data came from.
3. **Reports** — Datanika's GA4 source ships with pre-built report configurations:
   - `pages` — page views, sessions, engagement metrics by page path
   - `traffic_sources` — sessions, users, conversions by source/medium/campaign
   - `demographics` — users by country, city, language, device category
   - `events` — event counts by event name, with parameters

   Pick the subset you need. Each report maps to one table in the warehouse.
4. **Date range** — set a `start_date` for the backfill. GA4 retains data for 14 months by default (or 2/50 months on free/360). Setting a start date avoids hitting empty ranges.
5. **Write disposition** — `replace` is the standard choice for GA4. Google Analytics data is aggregated and can be reprocessed retroactively (e.g., spam filter updates change historical counts). A daily `replace` ensures your warehouse always matches what GA4 reports.
6. Save the pipeline configuration.

> **Tip.** Start with `pages` + `traffic_sources` for the first run. These are the two reports most teams need, and they validate that the credential and property ID are correct before you pull the full set.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. dlt calls the GA4 Data API in batches of 100,000 rows per request. A typical first run against 12 months of data takes 2–10 minutes depending on traffic volume.
3. When the run finishes, open **Catalog → `<your warehouse>` → `raw_ga4`** to browse the landed tables. You should see one table per report — `pages`, `traffic_sources`, etc.
4. Spot-check: compare a known metric (e.g., total sessions last week) between the warehouse and the GA4 interface. Small discrepancies (< 2%) are normal due to sampling and processing lag.

![First run in the Runs tab](/docs/connectors/google-analytics/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence:
   - **Daily at 06:00** — the standard choice. GA4 finalizes the previous day's data overnight, so a morning run picks up complete data.
   - **Every 6 hours** — if you need intraday freshness. Be aware that GA4 data within the current day is provisional and may change.
   - **Weekly** — for low-traffic properties or secondary reporting.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications** so broken runs surface before dashboards go stale.

> **Why daily and not hourly?** GA4's Data API has a daily quota of 200,000 tokens per property. Each report request costs tokens proportional to the dimensions and date range queried. Hourly runs against a large property can exhaust the quota by midday. Daily at 06:00 is the safest default.

![Configuring the schedule](/docs/connectors/google-analytics/05-schedule.png)

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

- **Use cases:** [Google Analytics → BigQuery](/use-cases/google-analytics-to-bigquery), [Google Analytics → Snowflake](/use-cases/google-analytics-to-snowflake)
- **Comparisons:** [Datanika vs Fivetran for Google Analytics](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** starter staging models for `raw_ga4` and attribution modeling in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Google Analytics connector spec](/connectors/google-analytics)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
