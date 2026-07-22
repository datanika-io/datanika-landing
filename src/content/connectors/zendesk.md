---
title: "Connect Zendesk to Datanika"
description: "Step-by-step guide to sync Zendesk tickets into your warehouse with Datanika — create an API token, add the connection, pick resources, run, and schedule."
source: "zendesk"
source_name: "Zendesk"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Zendesk is the system of record for customer support — tickets, satisfaction scores, agent performance, and SLA compliance all live there. This guide lands Zendesk data in your warehouse so you can build support-analytics dashboards (first-response time, resolution rate, CSAT trends) that join with product and revenue data. Create an API token, wire it into Datanika, pick resources, run, and schedule. Under 10 minutes.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported ticket fields, incremental exports, pagination — see the [Zendesk connector page](/connectors/zendesk).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Zendesk is **source-only**.
- A **Zendesk account** (any plan — Team, Growth, Professional, Enterprise). You need admin or agent access to create API tokens.
- Your **Zendesk subdomain** — the `yourcompany` part of `https://yourcompany.zendesk.com`.

## Step 1 — Create an API token in Zendesk

Zendesk API tokens authenticate as a specific user via email + token. Create a dedicated token for Datanika.

1. In Zendesk, go to **Admin Center → Apps and Integrations → Zendesk API**.
2. Under the **Settings** tab, ensure **Token Access** is enabled.
3. Click **Add API token**.
4. Give it a description: `datanika-readonly`.
5. Copy the token. **Zendesk shows it only once.**

> **Least privilege.** The API token inherits the permissions of the email account used to authenticate. Consider creating a dedicated Zendesk agent with "View only" access to tickets and using that email with the token.
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `zendesk`.
3. Fill in:
   - **Connection Name** — e.g. `zendesk-support` or `zendesk-prod`.
   - **Subdomain** — just the subdomain, not the full URL. If your Zendesk is at `acme.zendesk.com`, enter `acme`.
   - **Email** — the email of the Zendesk user whose permissions the API token inherits.
   - **API Key (optional)** — paste the API token from Step 1. Stored encrypted at rest with Fernet.
4. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **Credentials are validated on the first run.** Zendesk is an HTTP-API source, so the **Test Connection** button reports *"Test not applicable for this type"* — the subdomain/email/token are validated for real when the first pipeline runs.

![Adding Zendesk in Datanika](/docs/connectors/zendesk/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `zendesk-daily-sync` becomes `zendeskdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Zendesk connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Zendesk is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Zendesk the list is `organizations`, `tickets`, `users`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Zendesk rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `zendeskdailysync` creates schema `zendeskdailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `zendeskdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `Couldn't authenticate you` (401)
**Cause.** The subdomain, email, or API token is wrong. Common mistakes: using the full URL instead of just the subdomain, or using a user email that doesn't have API access.
**Fix.** Verify all three fields. Create a fresh token if needed.

### `You do not have access to this page` (403)
**Cause.** The authenticated user doesn't have permission to the requested resource. For example, an agent without admin access trying to export `groups`.
**Fix.** Elevate the Zendesk user's role or limit the pipeline to resources the user can access.

### Tickets synced but custom fields are missing
**Cause.** Custom fields are returned as `custom_fields` — an array of `{id, value}` pairs. They're not top-level columns by default.
**Fix.** The raw table has a `custom_fields` JSON column. Unnest and pivot it in a dbt staging model to get named columns.

### Incremental runs are slow
**Cause.** Zendesk's incremental export API has a rate limit of 10 requests per minute for the exports endpoint. Large backlogs of updated tickets can take a while.
**Fix.** This is expected behavior. Subsequent incremental runs are much faster once the initial backfill is done. dlt respects the rate limit automatically.

### CSAT scores don't match the Zendesk dashboard
**Cause.** Zendesk calculates CSAT % based on rated tickets only (excludes unrated). Your warehouse query may be including rows with NULL ratings.
**Fix.** Filter: `WHERE satisfaction_rating IS NOT NULL AND satisfaction_rating != 'unoffered'`.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** support analytics models (first-response time, CSAT trends, resolution rate) from `raw_zendesk` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Zendesk connector spec](/connectors/zendesk)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
