---
title: "Connect Jira to Datanika"
description: "Step-by-step guide to sync Jira issues into your warehouse with Datanika — create an API token, add the connection, pick projects, run, and schedule."
source: "jira"
source_name: "Jira"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
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
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `jira`.
3. Fill in:
   - **Connection Name** — e.g. `jira-eng` or `jira-product`.
   - **Jira Domain** — just the subdomain, **not** the full URL. If your Jira is at `yourcompany.atlassian.net`, enter `yourcompany`.
   - **Email** — the email associated with the Atlassian account that owns the API token.
   - **API Key (optional)** — paste the API token from Step 1. Stored encrypted at rest with Fernet.
4. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **Credentials are validated on the first run.** Jira is an HTTP-API source, so the **Test Connection** button reports *"Test not applicable for this type"* — the domain/email/token are validated for real when the first pipeline runs.

![Adding the Jira connection in Datanika](/docs/connectors/jira/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `jira-daily-sync` becomes `jiradailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Jira connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Jira is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Jira the list is `issues`, `projects`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all — though unticking *every* box loads the full set rather than nothing.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Jira rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `jiradailysync` creates schema `jiradailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `jiradailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

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
