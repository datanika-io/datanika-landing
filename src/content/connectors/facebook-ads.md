---
title: "Connect Facebook Ads to Datanika"
description: "Step-by-step guide to sync Facebook Ads campaigns into your warehouse with Datanika — create a Marketing API access token, add the connection, pick reports, run, and schedule."
source: "facebook_ads"
source_name: "Facebook Ads"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Facebook Ads (Meta Ads) is one of the two pillars of paid digital marketing — together with Google Ads it typically represents 60–80% of ad spend for B2C and D2C brands. This guide lands Facebook Ads data in your warehouse so you can build cross-channel attribution dashboards, track ROAS alongside revenue data, and stop context-switching between Ads Manager and your analytics stack. Create a Marketing API access token, wire it into Datanika, pick reports, run, and schedule.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported breakdowns, metrics, attribution windows — see the [Facebook Ads connector page](/connectors/facebook-ads).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Facebook Ads is **source-only**.
- A **Meta Business account** with at least one active ad account.
- The **ad account ID** — found in Meta Business Suite under **Settings → Ad accounts**. It looks like `act_1234567890` — enter it without the `act_` prefix in Datanika.
- A **Marketing API access token** (created in Step 1).

## Step 1 — Create a Marketing API access token

Facebook's Marketing API uses access tokens scoped to specific ad accounts and permissions. The easiest path for warehouse syncs is a **System User token** with long-lived access.

1. In [Meta Business Suite](https://business.facebook.com/), go to **Settings → Users → System users**.
2. Click **Add** and create a system user named `datanika-reader` with the **Employee** role (not Admin).
3. Click **Generate new token** on the system user.
4. Select the app (create one at [developers.facebook.com](https://developers.facebook.com/) if you don't have one — a basic "Business" app is sufficient).
5. Grant these permissions:
   - `ads_read` — read ad performance data
   - `read_insights` — read campaign insights/metrics
6. Set token expiration to **Never** (system user tokens can be non-expiring).
7. Copy the token.
8. **Assign ad account access:** on the system user page, click **Assign assets → Ad accounts** → select the ad account → grant **View performance** access.

> **Least privilege.** Only grant `ads_read` + `read_insights`. Never grant `ads_management` — Datanika never creates or modifies campaigns.

![Creating a system user token](/docs/connectors/facebook-ads/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Facebook Ads**.
3. Fill in:
   - **Connection Name** — e.g. `facebook-ads-prod` or `meta-ads-acme`.
   - **Marketing API access token** — paste the system user token from Step 1. Stored encrypted at rest with Fernet.
   - **Ad account ID** — the numeric ID without the `act_` prefix, e.g. `1234567890`.
4. Click **Create Connection**.

> **No "Test connection" button.** Facebook Ads is an HTTP-API source — the token and ad account access are validated on the first run.

![Adding Facebook Ads in Datanika](/docs/connectors/facebook-ads/02-add-connection.png)

## Step 3 — Configure reports and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_facebook_ads`.
3. Resources typically include:
   - `campaigns` — campaign-level daily metrics (spend, impressions, clicks, conversions)
   - `ad_sets` — ad set-level daily metrics
   - `ads` — individual ad creative performance
   - `insights` — aggregated account-level insights
4. For each resource, pick a **Write disposition**:
   - `merge` — recommended for daily metrics. Uses campaign/ad set/ad ID + date as the compound key.
   - `replace` — fine for reference data like campaign settings.
5. Set a **date range** for the initial backfill. Facebook retains up to 37 months of data.
6. Save.

> **Tip.** Start with `campaigns` at the daily grain for the last 90 days. Facebook's attribution windows mean recent data changes retroactively — `merge` handles this naturally.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Facebook's Insights API is pre-aggregated, so reports generate quickly — most accounts sync in 2–5 minutes.
3. If the token doesn't have access to the ad account, the run fails with `(#100) Missing permissions` or `Error validating access token`.
4. When finished, open **Catalog → `raw_facebook_ads`** and browse. The `campaigns` table has one row per campaign per day with columns for spend, impressions, clicks, reach, frequency, CPM, CPC, and conversions.
5. Spot-check: compare yesterday's total spend against Ads Manager.

![First Facebook Ads run](/docs/connectors/facebook-ads/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Facebook Ads data has a 1–3 day attribution lag:
   - **Daily at 06:00** — standard for marketing dashboards. Include a 7-day lookback for attribution updates.
   - **Every 6 hours** — spend monitoring and pacing dashboards.
3. Choose a **timezone** and save.

## Troubleshooting

### `Error validating access token`
**Cause.** The token is expired, revoked, or was pasted incorrectly.
**Fix.** System user tokens set to "Never expire" shouldn't expire, but they can be revoked if the system user is removed or the app is deactivated. Regenerate the token in Meta Business Suite.

### `(#100) Missing permissions`
**Cause.** The system user doesn't have `ads_read` or `read_insights` permissions, or it hasn't been assigned access to the ad account.
**Fix.** Check both: (a) the token's permission scopes and (b) the system user's asset assignments under **Settings → System users → Assign assets**.

### `(#17) User request limit reached`
**Cause.** Facebook enforces per-app rate limits based on the app's tier. Heavy usage during peak hours can trigger throttling.
**Fix.** dlt retries with backoff automatically. If persistent, apply for a higher API tier at [developers.facebook.com](https://developers.facebook.com/) (Standard → Advanced access).

### Spend values are in cents
**Cause.** Some API versions return spend in the account's currency with no conversion needed — but check whether your account currency uses minor units.
**Fix.** Verify the `spend` column unit by comparing one row against Ads Manager. If it's in cents, divide by 100 in a dbt staging model.

### Conversion numbers keep changing for past dates
**Cause.** Facebook attributes conversions over a configurable window (default 7-day click, 1-day view). Data from the attribution window changes retroactively.
**Fix.** This is expected. Use `merge` with a lookback re-pull matching your attribution window (7 or 28 days). Accept that recent days' numbers are always provisional.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** ad-spend attribution models from `raw_facebook_ads` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Facebook Ads connector spec](/connectors/facebook-ads)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
