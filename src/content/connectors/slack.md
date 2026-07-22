---
title: "Connect Slack to Datanika"
description: "Step-by-step guide to sync Slack messages and channels into your warehouse with Datanika — create a bot token, add the connection, pick channels, run, and schedule."
source: "slack"
source_name: "Slack"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Slack is where decisions happen — feature requests, incident timelines, customer feedback, and team coordination all flow through channels. This guide lands Slack data in your warehouse so you can analyze communication patterns, build searchable archives, measure response times, and join Slack activity with data from Jira, GitHub, or your CRM. Create a Slack bot, wire it into Datanika, and schedule syncs. About 10 minutes.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported message types, thread handling, pagination — see the [Slack connector page](/connectors/slack).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Slack is **source-only**.
- A **Slack workspace** where you have permission to install apps (workspace admin or owner, or a workspace with open app installation).

## Step 1 — Create a Slack app and bot token

Slack uses bot tokens scoped to specific API permissions. Create a dedicated app for Datanika.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From scratch**.
2. Name it `Datanika Reader` and select the workspace.
3. In the left sidebar, go to **OAuth & Permissions**.
4. Under **Bot Token Scopes**, add:
   - `channels:history` — read messages in public channels
   - `channels:read` — list public channels
   - `groups:history` — read messages in private channels the bot is in
   - `groups:read` — list private channels the bot is in
   - `users:read` — resolve user IDs to names
   - `users:read.email` — include email addresses (optional)
5. Scroll up and click **Install to Workspace → Allow**.
6. Copy the **Bot User OAuth Token**. It starts with `xoxb-…`.

> **Least privilege.** Only add `groups:history` and `groups:read` if you explicitly need private channel data. The bot can only read private channels it has been invited to — it doesn't get blanket access.

### Step 1.5 — Invite the bot to private channels (optional)

The bot automatically sees all public channels. For private channels, you must explicitly invite it:

1. Open the private channel in Slack.
2. Type `/invite @Datanika Reader`.
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `slack`.
3. Fill in:
   - **Connection Name** — e.g. `slack-workspace` or `slack-eng-team`.
   - **API Key (optional)** — paste the `xoxb-…` bot token from Step 1. Stored encrypted at rest with Fernet.
4. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **Credentials are validated on the first run.** Slack is an HTTP-API source, so the **Test Connection** button reports *"Test not applicable for this type"* — the token is validated for real when the first pipeline runs.

![Adding the Slack connection in Datanika](/docs/connectors/slack/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `slack-daily-sync` becomes `slackdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Slack connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Slack is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Slack the list is `channels`, `messages`, `users`, `threads`. Untick anything you do not want; each ticked endpoint becomes its own table in the destination.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Slack rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `slackdailysync` creates schema `slackdailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `slackdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `invalid_auth`
**Cause.** The bot token is revoked, the app was uninstalled from the workspace, or the token was pasted incorrectly.
**Fix.** Go to [api.slack.com/apps](https://api.slack.com/apps), open the app, and check **OAuth & Permissions**. If the token is gone, reinstall the app to the workspace.

### `missing_scope`
**Cause.** The bot doesn't have the required OAuth scope for the requested resource.
**Fix.** Add the missing scope under **OAuth & Permissions → Bot Token Scopes**, then reinstall the app. The token value changes after adding scopes — update it in Datanika.

### `channel_not_found` for a private channel
**Cause.** The bot hasn't been invited to the private channel.
**Fix.** Open the channel in Slack and type `/invite @Datanika Reader`.

### Rate limited (HTTP 429)
**Cause.** Slack enforces per-method rate limits (typically 1–50 requests per minute depending on the endpoint). Large workspace syncs can hit these.
**Fix.** dlt retries with backoff automatically. For very large workspaces, consider splitting into separate pipelines per channel group.

### Messages appear without user names
**Cause.** The `users:read` scope is missing, so Slack returns user IDs (`U01ABC…`) without the ability to resolve them to names.
**Fix.** Add `users:read` to the bot's scopes, reinstall the app, update the token in Datanika, and re-run. Join `messages.user` with `users.id` in a dbt model.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** communication analytics models from `raw_slack` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Slack connector spec](/connectors/slack)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
