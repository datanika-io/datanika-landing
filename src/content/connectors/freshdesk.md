---
title: "Connect Freshdesk to Datanika"
description: "Step-by-step guide to sync Freshdesk tickets into your warehouse with Datanika — get your API key, add the connection, pick resources, run, and schedule."
source: "freshdesk"
source_name: "Freshdesk"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Freshdesk is the system of record for customer support — tickets, conversations, SLA timers, and CSAT all live there. This guide lands Freshdesk data in your warehouse so you can build support-analytics dashboards (first-response time, resolution rate, agent load, CSAT trends) that join with product and revenue data. Get your API key, wire it into Datanika, pick resources, run, and schedule. Under 10 minutes.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported resources, incremental sync, pagination — see the [Freshdesk connector page](/connectors/freshdesk).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Freshdesk is **source-only**.
- A **Freshdesk account** with an agent whose API key you can use. An admin agent sees all tickets; a scoped agent sees only its groups.
- Your **Freshdesk subdomain** — the `yourcompany` part of `https://yourcompany.freshdesk.com`.

## Step 1 — Get your API key in Freshdesk

Every Freshdesk agent has a personal API key. Authentication is HTTP Basic: the **API key is the username** and the password can be any placeholder (Datanika handles this for you).

1. Sign in to Freshdesk and click your **profile picture** (top-right) → **Profile settings**.
2. On the profile page, find **Your API Key** in the right-hand sidebar.
3. Copy the key.

> **Least privilege.** The API key inherits the agent's ticket scope and role. For a full-instance sync, use an **account admin** agent. For a limited sync, use an agent restricted to specific groups.

![Finding the Freshdesk API key](/docs/connectors/freshdesk/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page.
2. From the **type dropdown**, pick **Freshdesk**.
3. Fill in:
   - **Connection Name** — e.g. `freshdesk-support` or `freshdesk-prod`.
   - **Freshdesk subdomain** — just the subdomain, not the full URL. If your Freshdesk is at `acme.freshdesk.com`, enter `acme`.
   - **API key** — paste the key from Step 1. Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **No "Test connection" button.** Freshdesk is an HTTP-API source — the credential is validated on the first run.

![Adding Freshdesk in Datanika](/docs/connectors/freshdesk/02-add-connection.png)

## Step 3 — Configure resources and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_freshdesk`.
3. Resources typically include:
   - `tickets` — the main table: status, priority, source, group, agent, requester, tags, custom fields
   - `contacts` — requesters / end-users
   - `companies` — customer org records
   - `agents` — support staff
   - `groups` — agent groups / queues
   - `conversations` — replies and private notes per ticket
   - `satisfaction_ratings` — CSAT responses
4. For each resource, pick a **Write disposition**:
   - `merge` — recommended for `tickets` and `conversations` (they change as tickets progress). Uses the ticket/record `id` as the primary key.
   - `replace` — fine for reference tables like `agents`, `groups`, `companies`.
5. Save.

> **Tip.** Freshdesk's ticket-list API only returns tickets **updated in the last 30 days** unless you page through history, and it caps at 300 pages. `merge` with an `updated_since` incremental cursor is the reliable way to keep a full ticket table fresh — start there rather than a wide `replace`.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Freshdesk returns up to 100 records per page. A few thousand tickets sync in a couple of minutes; large instances take longer on the first backfill.
3. If the subdomain or key is wrong, the run fails with `401 Unauthorized`.
4. When finished, open **Catalog → `raw_freshdesk`** and browse the tables.

![First Freshdesk run](/docs/connectors/freshdesk/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Common cadences:
   - **Hourly** — live support dashboards, SLA monitoring.
   - **Every 6 hours** — daily support reports, manager dashboards.
   - **Daily at 03:00** — weekly/monthly trend and CSAT analysis.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications**.

## Troubleshooting

### `401 Unauthorized`
**Cause.** The subdomain or API key is wrong — commonly the full URL was entered instead of just the subdomain, or the key was regenerated in Freshdesk.
**Fix.** Verify the subdomain and re-copy the key from **Profile settings**.

### Some tickets or fields are missing
**Cause.** The API key's agent only sees tickets in its assigned groups, and restricted agents can't read certain fields.
**Fix.** Use an account-admin agent's key for a complete sync.

### Custom fields aren't top-level columns
**Cause.** Freshdesk returns ticket custom fields nested under a `custom_fields` object, not as flat columns.
**Fix.** The raw table has a `custom_fields` JSON column — unnest and pivot it into named columns in a dbt staging model.

### `429 Too Many Requests` (with a `Retry-After` header)
**Cause.** Freshdesk enforces a per-minute rate limit that varies by plan (roughly 100–700 requests/minute).
**Fix.** dlt honors `Retry-After` and backs off automatically. If large syncs keep hitting it, schedule less frequently or split resources across pipelines.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** support-analytics models (first-response time, resolution rate, CSAT) from `raw_freshdesk` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Freshdesk connector spec](/connectors/freshdesk)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
