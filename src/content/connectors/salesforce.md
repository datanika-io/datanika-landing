---
title: "Connect Salesforce to Datanika"
description: "Step-by-step guide to sync Salesforce into your warehouse with Datanika — create a Connected App, add the connection, pick objects, run, and schedule."
source: "salesforce"
source_name: "Salesforce"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases:
  - "salesforce-to-bigquery"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Salesforce is the highest-value enterprise source connector — the data locked inside Accounts, Contacts, and Opportunities is what revenue teams need in their warehouse for pipeline analytics, forecasting, and lead scoring. This guide walks you end-to-end: create a Connected App in Salesforce, generate an access token, wire it into Datanika, pick the objects you want, run the first sync, and put it on a schedule.

> **Looking for the connector spec?** For the full field-by-field reference — supported Salesforce editions, API versions, SOQL customization — see the [Salesforce connector page](/connectors/salesforce).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika (BigQuery, Snowflake, PostgreSQL, etc.). Salesforce is **source-only** — you can't use it as a destination.
- **Salesforce access** with permission to create Connected Apps. On most orgs this requires the `System Administrator` profile or the `Manage Connected Apps` permission. You'll also need API access enabled on your Salesforce edition — Enterprise, Unlimited, Developer, and Performance editions include it; Professional may require an add-on.
- Your **Salesforce instance URL** — the domain you see when logged in, e.g. `https://yourcompany.my.salesforce.com`.

## Step 1 — Create a Connected App and generate an access token

Salesforce uses OAuth 2.0 for API access. The simplest path for server-to-server sync is a Connected App with the **Client Credentials** flow (no user interaction required on each run).

1. Sign in to Salesforce and go to **Setup → App Manager → New Connected App**.
2. Fill in the basics:
   - **Connected App Name** — `Datanika Sync`
   - **Contact Email** — your admin email
3. Under **API (Enable OAuth Settings)**:
   - Check **Enable OAuth Settings**
   - **Callback URL** — `https://login.salesforce.com/services/oauth2/callback` (required but not used for client credentials flow)
   - **Selected OAuth Scopes** — add `Full access (full)` or at minimum `Access and manage your data (api)` + `Perform requests on your behalf at any time (refresh_token, offline_access)`
4. Save and wait ~2–10 minutes for Salesforce to provision the app.
5. Go to **Manage Consumer Details**, copy the **Consumer Key** and **Consumer Secret**.
6. Generate a session token or use OAuth to obtain an **access token** and your **instance URL**. The easiest method for a quick start:
   ```bash
   curl -X POST https://login.salesforce.com/services/oauth2/token \
     -d "grant_type=password" \
     -d "client_id=<Consumer Key>" \
     -d "client_secret=<Consumer Secret>" \
     -d "username=<your Salesforce username>" \
     -d "password=<your password + security token>"
   ```
   The response contains `access_token` and `instance_url`. Copy both.

> **Security tip.** For production, use the Client Credentials flow or a dedicated integration user with a non-expiring token. The password grant shown above is quick for testing but ties the credential to your personal account.

![Creating the Connected App in Salesforce Setup](/docs/connectors/salesforce/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Salesforce**.
3. Fill in the form:
   - **Access Token** — the OAuth access token from Step 1. Stored encrypted at rest with Fernet.
   - **Instance URL** — your Salesforce instance URL, e.g. `https://yourcompany.my.salesforce.com`.
4. Click **Save**.

> **Salesforce connections don't expose a "Test connection" button.** Salesforce is an HTTP-API source — the credential is validated on the first pipeline run, not at save time. If the token is expired or invalid, the run fails immediately with a clear Salesforce API error.

![Adding the Salesforce connection in Datanika](/docs/connectors/salesforce/02-add-connection.png)

## Step 3 — Configure objects and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — e.g. `raw_salesforce`.
3. **Objects** — Datanika's Salesforce source ships with the canonical CRM objects:
   - `accounts` — one row per Account (companies, organizations)
   - `contacts` — one row per Contact (people associated with Accounts)
   - `opportunities` — one row per Opportunity (deals in your pipeline)

   Select the subset you need. For a first run, `accounts` + `opportunities` gives you the core revenue pipeline data.
4. **Write disposition** — `merge` is the right choice for all Salesforce objects. Records are identified by their Salesforce `Id` field, and Salesforce objects are updated in place (e.g., an Opportunity moves from `Prospecting` to `Closed Won`).
5. Save the pipeline configuration.

> **Tip.** Start with 1–2 objects on a Salesforce sandbox or developer edition. Once you validate the schema lands correctly, enable the full set against production.

## Step 4 — First run

1. Click **Run now** on the pipeline page.
2. Open the **Runs** tab. Datanika uses the Salesforce REST API (v59.0) to pull objects. A typical first run against a mid-size Salesforce org (tens of thousands of records) takes 1–5 minutes.
3. If the access token is expired or missing permissions, the run fails immediately — jump to [Troubleshooting](#troubleshooting).
4. When done, open **Catalog → `<warehouse>` → `raw_salesforce`** and browse.
5. Spot-check: `SELECT count(*) FROM raw_salesforce.accounts;` should roughly match the Account count in Salesforce (Reports → Accounts).

![First run in the Runs tab](/docs/connectors/salesforce/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence:
   - **Hourly** — revenue dashboards, live pipeline forecasting.
   - **Every 6 hours** — sales ops reporting, weekly reviews.
   - **Daily at 06:00** — morning-ready dashboards for the sales team.
3. Choose a **timezone** — align with your sales team's working hours so dashboards are fresh when they check.
4. Save and wire up failure alerts in **Settings → Notifications**.

> **Token expiration.** Salesforce access tokens expire (typically after 2 hours for session tokens). For scheduled pipelines, use a refresh token flow or a Connected App with the Client Credentials grant — these auto-renew without manual intervention. If your token expires between runs, the run will fail and you'll need to regenerate it.

![Configuring the schedule](/docs/connectors/salesforce/05-schedule.png)

## Troubleshooting

### `Salesforce source requires 'access_token' and 'instance_url'`
**Cause.** One or both fields were left blank in the connection form.
**Fix.** Open the connection, paste both the access token and the instance URL, save.

### `INVALID_SESSION_ID: Session expired or invalid`
**Cause.** The access token has expired. Session tokens last ~2 hours by default.
**Fix.** Regenerate the access token using the OAuth flow from Step 1 and update the connection in Datanika. For long-running scheduled pipelines, switch to the Client Credentials flow which auto-renews.

### `INSUFFICIENT_ACCESS_OR_ORG_HAS_NO_LICENSES: ...`
**Cause.** The Salesforce user or Connected App lacks API access. Common on Professional edition without the API add-on, or when the integration user's profile doesn't have "API Enabled" checked.
**Fix.** In Salesforce Setup, go to the user's Profile → System Permissions → ensure **API Enabled** is checked. If you're on Professional edition, verify your org has the API access add-on.

### `REQUEST_LIMIT_EXCEEDED: TotalRequests Limit exceeded`
**Cause.** Salesforce enforces per-org API call limits (varies by edition — 100K/day for Enterprise, 500K/day for Unlimited). Very frequent schedules or large object syncs can exhaust the quota.
**Fix.** Reduce schedule frequency (daily is often sufficient for CRM data), narrow the object list, or request a higher API limit from Salesforce support.

### Run succeeds but only a few rows land
**Cause.** The integration user can only see records they own or have sharing rules for. Salesforce's record-level security applies to API queries — you don't get `SELECT *` unless the user has "View All Data" permission.
**Fix.** Grant the integration user the `View All Data` permission on the relevant objects, or use a user with the `System Administrator` profile.

### Instance URL is wrong
**Cause.** The instance URL should be `https://yourcompany.my.salesforce.com`, not `https://login.salesforce.com` (that's the auth endpoint, not the data endpoint).
**Fix.** Check the `instance_url` value in the OAuth response. It's also visible in your browser URL bar when logged into Salesforce.

## Related

- **Use cases:** [Salesforce → BigQuery](/use-cases/salesforce-to-bigquery)
- **Comparisons:** [Datanika vs Fivetran for Salesforce](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** starter staging models for `raw_salesforce` and CRM analytics patterns in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Salesforce connector spec](/connectors/salesforce)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
