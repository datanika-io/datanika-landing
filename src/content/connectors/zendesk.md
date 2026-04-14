---
title: "Connect Zendesk to Datanika"
description: "Step-by-step guide to sync Zendesk tickets into your warehouse with Datanika — create an API token, add the connection, pick resources, run, and schedule."
source: "zendesk"
source_name: "Zendesk"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating an API token in Zendesk](/docs/connectors/zendesk/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Zendesk**.
3. Fill in:
   - **Connection Name** — e.g. `zendesk-support` or `zendesk-prod`.
   - **Zendesk subdomain** — just the subdomain, not the full URL. If your Zendesk is at `acme.zendesk.com`, enter `acme`.
   - **Account email** — the email of the Zendesk user whose permissions the API token inherits.
   - **API token** — paste the token from Step 1. Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **No "Test connection" button.** Zendesk is an HTTP-API source — the credential is validated on the first run.

![Adding Zendesk in Datanika](/docs/connectors/zendesk/02-add-connection.png)

## Step 3 — Configure resources and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_zendesk`.
3. Resources typically include:
   - `tickets` — all tickets with status, priority, assignee, requester, tags, custom fields (the main table)
   - `users` — agents and end-users
   - `organizations` — company/org records
   - `groups` — agent groups
   - `ticket_metrics` — first-reply time, full-resolution time, reopens, replies
   - `satisfaction_ratings` — CSAT scores
4. For each resource, pick a **Write disposition**:
   - `merge` — recommended for `tickets` and `ticket_metrics` (they update frequently as tickets progress). Uses the ticket ID as the primary key.
   - `replace` — fine for reference tables like `users`, `organizations`, `groups`.
5. Save.

> **Tip.** Start with `tickets` + `ticket_metrics` + `satisfaction_ratings` — these three tables power 90% of support dashboards (resolution time, CSAT, volume trends).

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Zendesk's incremental export API returns up to 1000 tickets per page. A 50k-ticket instance takes 2–5 minutes; large enterprise instances with 500k+ tickets may take 15+ minutes on the first backfill.
3. If the subdomain, email, or token is wrong, the run fails with `401 Unauthorized` or `Couldn't authenticate you`.
4. When finished, open **Catalog → `raw_zendesk`** and browse the tables.
5. Spot-check: `SELECT count(*) FROM raw_zendesk.tickets` should roughly match the ticket count in Zendesk's **Views → All unsolved tickets** + resolved tickets.

![First Zendesk run](/docs/connectors/zendesk/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Support data changes continuously during business hours:
   - **Hourly** — real-time support dashboards, SLA monitoring, escalation alerts.
   - **Every 6 hours** — daily support reports, manager dashboards.
   - **Daily at 03:00** — weekly/monthly trend analysis, board-level reporting.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications**.

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
