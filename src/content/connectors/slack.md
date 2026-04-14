---
title: "Connect Slack to Datanika"
description: "Step-by-step guide to sync Slack messages and channels into your warehouse with Datanika — create a bot token, add the connection, pick channels, run, and schedule."
source: "slack"
source_name: "Slack"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating a Slack app](/docs/connectors/slack/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Slack**.
3. Fill in:
   - **Connection Name** — e.g. `slack-workspace` or `slack-eng-team`.
   - **Slack bot token** — paste the `xoxb-…` token from Step 1. Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **No "Test connection" button.** Slack is an HTTP-API source — the token is validated on the first run.

![Adding the Slack connection in Datanika](/docs/connectors/slack/02-add-connection.png)

## Step 3 — Configure channels and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_slack`.
3. Resources typically include:
   - `messages` — all messages across synced channels (the main table)
   - `channels` — channel metadata (name, topic, purpose, member count)
   - `users` — workspace members (name, email, title, status)
4. For each resource, pick a **Write disposition**:
   - `append` — natural for messages (new messages are always new rows, old messages aren't re-fetched).
   - `replace` — fine for `channels` and `users` (small reference tables).
5. Save.

> **Tip.** If you only need specific channels, configure the pipeline to filter by channel name or ID rather than syncing the entire workspace. This dramatically reduces API calls and run time.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Slack's API paginates at 200 messages per request. A channel with 50k messages takes a few minutes; workspace-wide syncs of very active workspaces can take longer.
3. If the bot token is invalid, the run fails with `invalid_auth`. Check the token in **OAuth & Permissions** on [api.slack.com/apps](https://api.slack.com/apps).
4. When finished, open **Catalog → `raw_slack`** and browse. The `messages` table contains one row per message with columns for channel, user, text, timestamp, thread parent, and reactions.

![First Slack run](/docs/connectors/slack/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Slack data is high-volume and continuous:
   - **Hourly** — real-time communication analytics, incident response tracking.
   - **Every 6 hours** — daily standups, team activity dashboards.
   - **Daily at 03:00** — historical analytics, searchable archives.
3. Choose a **timezone** and save.

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
