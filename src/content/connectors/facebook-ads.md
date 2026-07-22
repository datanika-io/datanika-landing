---
title: "Connect Facebook Ads to Datanika"
description: "Step-by-step guide to sync Facebook Ads campaigns into your warehouse with Datanika — create a Marketing API access token, add the connection, pick reports, run, and schedule."
source: "facebook_ads"
source_name: "Facebook Ads"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
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
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `facebook_ads`.
3. Fill in:
   - **Connection Name** — e.g. `facebook-ads-prod` or `meta-ads-acme`.
   - **Access Token** — paste the Marketing API system-user token from Step 1. Stored encrypted at rest with Fernet.
   - **Ad Account ID** — your ad account ID, e.g. `act_1234567890`.
4. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **Credentials are validated on the first run.** Facebook Ads is an HTTP-API source, so the **Test Connection** button reports *"Test not applicable for this type"* — the token and ad-account access are validated when the first pipeline runs.

![Adding Facebook Ads in Datanika](/docs/connectors/facebook-ads/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `facebookads-daily-sync` becomes `facebookadsdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Facebook Ads connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Facebook Ads is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Facebook Ads the list is `campaigns`, `ad_sets`, `ads`, `leads`, `creatives`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Facebook Ads rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `facebookadsdailysync` creates schema `facebookadsdailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `facebookadsdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

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
