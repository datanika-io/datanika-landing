---
title: "Connect Jira to Datanika"
description: "Step-by-step guide to sync Jira issues into your warehouse with Datanika — create an API token, add the connection, pick projects, run, and schedule."
source: "jira"
source_name: "Jira"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Jira is the system of record for engineering work at most companies — issues, sprints, epics, and story points all live there. This guide lands Jira data in your warehouse so you can build engineering-metrics dashboards (cycle time, throughput, sprint velocity) that don't depend on Jira's built-in reports. Create an API token, wire it into Datanika, run a backfill, and schedule syncs. Under 10 minutes.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported issue types, JQL filtering, pagination — see the [Jira connector page](/connectors/jira).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Jira is **source-only**.
- A **Jira Cloud** instance (Atlassian-hosted). Jira Server/Data Center uses different auth — see the Troubleshooting section.
- An **Atlassian account** with access to the Jira projects you want to sync.

## Step 1 — Create an API token in Atlassian

Atlassian API tokens authenticate as your user account with the same permissions. Create a dedicated token for Datanika so you can revoke it independently.

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token**.
3. Label it `datanika-readonly` and click **Create**.
4. Copy the token. **This is your only chance** — Atlassian doesn't show it again.

> **Least privilege.** The API token inherits your Jira permissions. If you have admin access but only need to sync issues, consider creating a dedicated Jira user with read-only project access and generating the token from that account.

![Creating an API token in Atlassian](/docs/connectors/jira/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Jira**.
3. Fill in:
   - **Connection Name** — e.g. `jira-eng` or `jira-product`.
   - **Jira server URL** — your Jira Cloud URL, e.g. `https://yourcompany.atlassian.net`. Include the protocol, no trailing slash.
   - **Account email** — the email associated with the Atlassian account that owns the API token.
   - **API token** — paste the token from Step 1. Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **No "Test connection" button.** Jira is an HTTP-API source — credentials are validated on the first pipeline run.

![Adding the Jira connection in Datanika](/docs/connectors/jira/02-add-connection.png)

## Step 3 — Configure projects and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_jira`.
3. Datanika discovers all projects your account can access. Select which ones to sync.
4. Resources typically include:
   - `issues` — all issues across selected projects (the main table)
   - `projects` — project metadata
   - `users` — team members
   - `sprints` — sprint definitions and dates
   - `boards` — Scrum/Kanban board configuration
5. For each resource, pick a **Write disposition**:
   - `merge` — recommended for issues (they update frequently). Uses the issue key as the primary key.
   - `replace` — fine for small reference tables like `projects` and `users`.
6. Save.

> **Tip.** Start with one project to validate the schema, then expand. Large Jira instances with 100k+ issues can take several minutes on the first backfill.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Jira's API paginates at 100 issues per request. A 10k-issue project takes 1–2 minutes; 100k+ issues can take 10+ minutes.
3. If the API token or email is wrong, the run fails with `401 Unauthorized`. Double-check both in the connection settings.
4. When finished, open **Catalog → `raw_jira`** and browse. The `issues` table contains one row per issue with columns for summary, status, assignee, reporter, priority, created, updated, story points, sprint, epic, labels, and custom fields.
5. Spot-check: `SELECT count(*) FROM raw_jira.issues WHERE project_key = 'ENG'` should roughly match the issue count in Jira's project sidebar.

![First Jira run](/docs/connectors/jira/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Jira data changes throughout the workday:
   - **Hourly** — sprint dashboards, standup metrics, real-time velocity tracking.
   - **Every 6 hours** — weekly reporting, manager dashboards.
   - **Daily at 03:00** — batch analytics, historical trend analysis.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications**.

## Troubleshooting

### `401 Unauthorized`
**Cause.** The email or API token is wrong, or the token was revoked.
**Fix.** Verify the email matches the Atlassian account that created the token. Create a new token if the old one was revoked.

### `403 Forbidden` on specific projects
**Cause.** The Jira user doesn't have "Browse project" permission on those projects.
**Fix.** Ask a Jira admin to grant the user (or a group it belongs to) "Browse project" on the missing projects.

### Jira Server/Data Center: `Connection refused` or TLS errors
**Cause.** Jira Server instances are self-hosted and may not be reachable from Datanika's network, or they may use self-signed TLS certificates.
**Fix.** Ensure Datanika can reach the Jira Server URL (allowlist egress IPs or use a VPN/tunnel). Self-signed certs require the CA to be added to the Datanika container's trust store.

### Custom fields land as `customfield_12345` instead of readable names
**Cause.** Jira's API returns custom fields by their internal ID, not the display name. This is an API-level behavior.
**Fix.** Join the `issues` table with Jira's field metadata (synced as part of the `fields` resource if available) in a dbt staging model, or create a column alias mapping.

### Rate limited (HTTP 429)
**Cause.** Atlassian enforces rate limits per user. Large backfills against busy instances can hit them.
**Fix.** dlt retries with backoff automatically. If persistent, reduce the number of projects per pipeline or schedule backfills during off-peak hours.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** engineering metrics models (cycle time, throughput) from `raw_jira` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Jira connector spec](/connectors/jira)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
