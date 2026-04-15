---
title: "Connect Google Ads to Datanika"
description: "Step-by-step guide to sync Google Ads campaigns into your warehouse with Datanika — set up a service account, add the connection, pick reports, run, and schedule."
source: "google_ads"
source_name: "Google Ads"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating a service account for Google Ads](/docs/connectors/google-ads/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Google Ads**.
3. Fill in:
   - **Connection Name** — e.g. `google-ads-prod` or `google-ads-acme`.
   - **Google Ads customer ID** — the 10-digit ID without hyphens, e.g. `1234567890`.
   - **Service account JSON** — paste the full contents of the JSON key file. Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **No "Test connection" button.** Google Ads is an HTTP-API source — credentials and access are validated on the first run.

![Adding Google Ads in Datanika](/docs/connectors/google-ads/02-add-connection.png)

## Step 3 — Configure reports and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_google_ads`.
3. Resources typically include:
   - `campaigns` — campaign-level performance (impressions, clicks, cost, conversions)
   - `ad_groups` — ad group-level performance
   - `ads` — individual ad performance
   - `keywords` — keyword performance and quality scores
   - `search_terms` — actual search queries that triggered your ads
4. For each resource, pick a **Write disposition**:
   - `merge` — recommended for daily metrics tables. Uses campaign/ad group/ad ID + date as the compound key.
   - `replace` — fine for reference data like campaign settings.
5. Set a **date range** for the first backfill. Google Ads can provide up to 3 years of history.
6. Save.

> **Tip.** Start with `campaigns` at the daily grain for the last 90 days. This gives you enough data for trend analysis without a massive first backfill.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Google Ads reports are pre-aggregated on Google's side, so even large accounts with millions of clicks sync in a few minutes.
3. If the service account doesn't have access to the Google Ads customer ID, the run fails with `PERMISSION_DENIED` or `USER_PERMISSION_DENIED`. Check the access grant in Step 1.5.
4. When finished, open **Catalog → `raw_google_ads`** and browse. The `campaigns` table has one row per campaign per day with columns for impressions, clicks, cost (in micros — divide by 1,000,000 for the dollar amount), conversions, and conversion value.
5. Spot-check: compare yesterday's total cost against the Google Ads UI dashboard.

![First Google Ads run](/docs/connectors/google-ads/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Google Ads data is finalized with a 2–3 day lag (conversion attribution windows):
   - **Daily at 06:00** — standard for marketing dashboards. Pull yesterday's data plus a 3-day lookback window for conversion updates.
   - **Every 6 hours** — near-real-time spend monitoring.
3. Choose a **timezone** and save.

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
