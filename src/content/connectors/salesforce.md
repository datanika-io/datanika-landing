---
title: "Connect Salesforce to Datanika"
description: "Step-by-step guide to sync Salesforce into your warehouse with Datanika — create a Connected App, add the connection, pick objects, run, and schedule."
source: "salesforce"
source_name: "Salesforce"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
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
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `salesforce`.
3. Fill in the form:
   - **Connection Name** — a label for this connection, e.g. `salesforce-crm`.
   - **Access Token** — the OAuth access token from Step 1. Stored encrypted at rest with Fernet.
   - **Instance URL** — your Salesforce instance URL, e.g. `https://yourcompany.my.salesforce.com`.
4. Click **Create Connection**.

> **Test Connection for Salesforce.** The **Test Connection** button is present, but because Salesforce is an HTTP-API source it returns *"Test not applicable for this type"* — the token is validated for real on the first pipeline run, not at save time. If it's expired or invalid, the run fails immediately with a clear Salesforce API error.

![Adding the Salesforce connection in Datanika](/docs/connectors/salesforce/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `salesforce-daily-sync` becomes `salesforcedailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Salesforce connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Salesforce is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Salesforce the list is `accounts`, `contacts`, `opportunities`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all — though unticking *every* box loads the full set rather than nothing.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Salesforce rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `salesforcedailysync` creates schema `salesforcedailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `salesforcedailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

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
