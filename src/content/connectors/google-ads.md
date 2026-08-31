---
title: "Connect Google Ads to Datanika"
description: "Step-by-step guide to sync Google Ads reporting into your warehouse with Datanika — get a developer token, authorize OAuth, add the connection, run a GAQL query, and schedule it."
source: "google_ads"
source_name: "Google Ads"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-08-29"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Google Ads data is essential for marketing attribution, ROAS analysis and budget optimization — but the Google Ads UI makes it hard to join ad spend with revenue data from your CRM or warehouse. This guide lands Google Ads reporting in your warehouse so you can build cross-channel attribution that combines ad performance with conversion and revenue data.

> **Looking for the connector spec?** This is the hands-on setup guide. For the field-by-field reference, see the [Google Ads connector page](/connectors/google-ads).

## Read this before you start: the developer token is the long pole

Every Google Ads API request carries a **developer token**, and Google issues those on its own timetable. Datanika does not hold one on your behalf — you bring your own, the same way you bring a service-account key for BigQuery. That keeps your data under your own Google account and your own quota, but it does mean the Google-side paperwork is real:

- A developer token comes from a **Google Ads manager account (MCC)**, not from an ordinary Ads account. If you don't have a manager account, you'll create one.
- A brand-new token starts at **Test Account access**. At that level it can *only* query Google Ads test accounts — not the account running your real campaigns.
- To read a production account you apply for **Basic access** in the API Center. Google states a **5 business day** turnaround, and completing brand verification first tends to speed it up.
- Google usually grants **one developer token per company**. If your organization already uses the Ads API, reuse the existing token rather than applying again.

So: budget a few days before your first real row lands, and don't plan a launch around setting this up the same afternoon. Everything after the token is minutes.

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Google Ads is **source-only**.
- A **Google Ads manager account (MCC)** — this is where the developer token lives.
- The **customer ID** of the account you want to read: the 10-digit number at the top of the Google Ads UI, shown as `123-456-7890`. Paste it either way; Datanika strips the hyphens for you.
- A **Google Cloud project** where you can create an OAuth client.

## Step 1 — Get a developer token

1. Sign in to your **Google Ads manager account** and open the [API Center](https://ads.google.com/aw/apicenter) (`ads.google.com/aw/apicenter`). It only appears under a manager account.
2. Complete the API sign-up form if you haven't before. You'll be issued a token at **Test Account** access level.
3. Click **Apply for Basic Access** and fill in the application. This is the step that unlocks your live campaign data.
4. Wait for the approval email — Google's published turnaround is 5 business days.

> **You can wire up the rest of this guide while you wait.** The connection saves fine with a test-level token; it's the first run against a production customer ID that fails until Basic access lands.

## Step 2 — Create an OAuth client and get a refresh token

Datanika authenticates as **you**, using a standard OAuth user credential — not a service account. This is not a preference: service accounts reaching the Google Ads API additionally require Workspace domain-wide delegation, which most people can't arrange on their own domain, so the user-credential path is the one that works.

1. In the [Google Cloud Console](https://console.cloud.google.com/), open **APIs & Services → Credentials**.
2. **Create credentials → OAuth client ID**, application type **Desktop app**. Name it `datanika-ads`.
3. Copy the **Client ID** and **Client secret**.
4. Enable the **Google Ads API** for the project: **APIs & Services → Enable APIs → search "Google Ads API" → Enable**.
5. Generate a **refresh token** for the Google account that can see your Ads data, with the `https://www.googleapis.com/auth/adwords` scope. Google's [OAuth desktop-app flow](https://developers.google.com/google-ads/api/docs/oauth/overview) walks through this; the [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) is the quickest route for a one-off.

> **Grant read access, not admin.** The Google account you authorize needs only read access to the Ads account. Datanika never modifies campaigns, budgets or ad groups — the connector issues `searchStream` report queries and nothing else.

## Step 3 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `google_ads`.
3. Fill in:
   - **Connection Name** — e.g. `google-ads-prod`.
   - **Customer ID** — the account you want to read, e.g. `123-456-7890`.
   - **Developer token** — from Step 1.
   - **OAuth client ID**, **OAuth client secret**, **OAuth refresh token** — from Step 2.
   - **Manager (MCC) customer ID** — *optional*. Fill this in only when the Google account you authorized is a manager account reading a child account. Leave it empty when the OAuth user has direct access to the customer ID above.
4. Click **Create Connection**. The three secret fields are stored encrypted at rest with Fernet.

> **Credentials are validated on the first run.** Google Ads is an HTTP-API source, so **Test Connection** reports *"Test not applicable for this type"*. Access, token level and OAuth scope are all checked when the first pipeline runs — that run is the real test.

![Adding Google Ads in Datanika](/docs/connectors/google-ads/02-add-connection.png)

## Step 4 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `googleads-daily-sync` becomes `googleadsdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Google Ads connection from Step 3 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Under **Select endpoints to load** you'll see a single checkbox: **`report`**. That is deliberate and it is the honest offer — Google Ads is a *query* API, not a set of collections. One GAQL query is one report is one table.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database.

### What you get by default

Left alone, the connector runs campaign performance by day — the report almost every account starts from, and one you can build on without knowing how the account is structured:

```sql
SELECT campaign.id, campaign.name, campaign.status, segments.date,
       metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM campaign
WHERE segments.date DURING LAST_30_DAYS
```

Google returns each row nested (`campaign.id`, `metrics.clicks`), and Datanika flattens it to one column per leaf joined with `_` — so you get `campaign_id`, `campaign_name`, `segments_date`, `metrics_clicks`, `metrics_cost_micros`. Columns come from the rows Google actually returns, so a field it sends without being asked still lands rather than being dropped.

### Running a different report

The query is yours to replace. Any valid [GAQL](https://developers.google.com/google-ads/api/docs/query/overview) statement works — ad groups, keywords, search terms, assets, conversion actions. Set `query` in the upload's `dlt_config` to override the default, and `api_version` to pin a different Google Ads API major version.

> **Pin the API version when Google sunsets one.** Google Ads carries the major version in the URL path, ships roughly four majors a year, and sunsets each about twelve months after release. Datanika targets **v25** by default. When that sunsets, `api_version` is a config change on a live connection rather than a wait for a release — and the error Datanika surfaces names the version Google rejected, so the cause is legible.

## Step 5 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed table. The upload lands it in a schema **named after the upload** — `googleadsdailysync` creates schema `googleadsdailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the Google Ads UI. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 6 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `googleadsdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 3 * * *` nightly at 03:00 suits a `LAST_30_DAYS` window.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily cadences you compare against the Ads UI.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `DEVELOPER_TOKEN_NOT_APPROVED`
**Cause.** Your token is still at Test Account access and you pointed it at a production account.
**Fix.** Apply for Basic access in the [API Center](https://ads.google.com/aw/apicenter) and wait for approval. Nothing on the Datanika side changes — re-run the upload once the email arrives.

### `USER_PERMISSION_DENIED` or `PERMISSION_DENIED`
**Cause.** The Google account behind your refresh token doesn't have access to that customer ID, or you're reading a child account without naming the manager.
**Fix.** Confirm the account can open that customer ID in the Ads UI. If it reaches it *through* a manager account, fill in **Manager (MCC) customer ID**.

### `CUSTOMER_NOT_FOUND` / `INVALID_CUSTOMER_ID`
**Cause.** The customer ID points at a manager account rather than the account serving ads, or at an account the credential can't see.
**Fix.** Use the 10-digit ID of the leaf account. Hyphens are fine — Datanika strips them before the request.

### A 404 naming the API version
**Cause.** The Google Ads API version in the request path has been sunset.
**Fix.** Set `api_version` in the upload's `dlt_config` to a current major. The error message names the version that was refused.

### Cost values look 1,000,000× too high
**Cause.** The Ads API returns cost in **micros** (1 USD = 1,000,000 micros). This is by design, and `metrics.cost_micros` is in the default query.
**Fix.** Divide in your dbt staging model: `metrics_cost_micros / 1000000.0 AS cost_usd`.

### Conversion numbers don't match the Google Ads UI
**Cause.** Google Ads attributes conversions over a lookback window (default 30 days), so recent days change retroactively as conversions are attributed.
**Fix.** Keep re-pulling a trailing window — the default `LAST_30_DAYS` query does this — and treat the most recent days as provisional.

### The run succeeds with zero rows
**Cause.** Your GAQL `WHERE` clause matched nothing — a date range with no spend, or a filter on a campaign that doesn't exist.
**Fix.** Run the same query in the Ads UI's query builder first. A query that returns nothing is a successful request as far as Google is concerned.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **Cross-channel:** pair with [Google Analytics](/docs/connectors/google-analytics) and [Facebook Ads](/docs/connectors/facebook-ads) for full-funnel attribution
- **dbt tips:** ad-spend attribution models in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** [Google Ads connector spec](/connectors/google-ads)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
