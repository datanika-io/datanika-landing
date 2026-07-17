---
title: "Connect Asana to Datanika"
description: "Step-by-step guide to sync Asana projects and tasks into your warehouse with Datanika — create a token, add the connection, pick resources, run, and schedule."
source: "asana"
source_name: "Asana"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-17"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Asana is where a lot of teams run projects, tasks, and delivery workflows. This guide lands Asana data in your warehouse so you can build execution and throughput dashboards (cycle time, completion rate, load per assignee, project burn-down) that join with engineering and business data. Create a personal access token, wire it into Datanika, pick resources, run, and schedule. Under 10 minutes.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported resources, incremental sync, pagination — see the [Asana connector page](/connectors/asana).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Asana is **source-only**.
- An **Asana account** that's a member of the workspace(s) you want to sync. Datanika syncs every workspace the token can access.

## Step 1 — Create a personal access token in Asana

A personal access token (PAT) authenticates as you and can read everything your account can see.

1. Go to the Asana **developer console** at **`https://app.asana.com/0/my-apps`** (or **Profile settings → Apps → Manage developer apps**).
2. Click **Create new token** under **Personal access tokens**.
3. Give it a description: `datanika-readonly`, agree to the API terms, and click **Create token**.
4. Copy the token. **Asana shows it only once.**

> **Least privilege.** A PAT sees exactly what its user sees. To sync a whole workspace, use a token from a member with access to all the relevant projects (or a dedicated service account). Asana PATs are read/write at the API level — Datanika only ever reads.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page.
2. From the **type dropdown**, pick **`asana`**.
3. Fill in:
   - **Connection Name** — a label for this connection, e.g. `asanaprojects`.
   - **API Key** — paste the personal access token from Step 1. (The field is labelled *API Key (optional)*, but Asana needs it.) Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **All accessible workspaces sync.** There's no workspace field — Datanika syncs every workspace the token can reach. To scope the sync, use a token from a user with access to only the workspaces you want.
>
> **Test Connection doesn't apply here.** Asana is an HTTP-API source; clicking **Test Connection** shows *"Test not applicable for this type."* The credential is validated on the first run instead.

![Adding Asana in Datanika](/docs/connectors/asana/02-add-connection.png)

## Step 3 — Configure resources and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_asana`.
3. Resources typically include:
   - `tasks` — the main table: name, assignee, completed status, due date, project, section, timestamps, custom fields
   - `projects` — project metadata and status
   - `sections` — columns/phases within a project
   - `users` — workspace members
   - `teams` — team structure
   - `tags` — labels applied to tasks
   - `stories` — the activity log / comments on tasks
4. Every Asana object is keyed by a **`gid`** (a stable string ID). For each resource pick a **Write disposition**:
   - `merge` — recommended for `tasks` and `stories` (they change constantly). Uses `gid` as the primary key with a `modified_at` cursor.
   - `replace` — fine for small reference tables like `users`, `teams`, `tags`.
5. Save.

> **Tip.** Asana's API won't return every task in a workspace from a single unscoped call — tasks are fetched per project (or per assignee). Sync `projects` first, then `tasks`; Datanika iterates projects to assemble the full task table.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Asana paginates results and enforces a per-minute rate limit, so large workspaces with thousands of tasks take a few minutes on the first backfill.
3. If the token is wrong, the run fails with `401 Unauthorized`.
4. When finished, open **Catalog → `raw_asana`** and browse the tables.

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Common cadences:
   - **Hourly** — live delivery dashboards, stand-up prep.
   - **Every 6 hours** — daily throughput and load reports.
   - **Daily at 03:00** — weekly/monthly cycle-time and completion analysis.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications**.

## Troubleshooting

### `401 Unauthorized`
**Cause.** The personal access token is wrong or was deauthorized in Asana.
**Fix.** Create a fresh token in the developer console and update the connection.

### `403 Forbidden` on some projects
**Cause.** The token's user isn't a member of that project or workspace, so Asana hides it.
**Fix.** Add the user to the projects/workspace, or use a token from a member with broader access.

### Tasks are missing for a workspace
**Cause.** Asana doesn't expose a "all tasks in workspace" endpoint — tasks must be fetched per project, tag, or assignee.
**Fix.** Make sure `projects` is included in the sync so Datanika can iterate them to collect tasks. Tasks in no project won't appear unless queried by assignee.

### `429 Too Many Requests`
**Cause.** Asana enforces a per-minute rate limit (roughly 150 req/min on free, higher on paid).
**Fix.** dlt backs off and retries automatically. For very large workspaces, schedule less frequently or split projects across pipelines.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** delivery-analytics models (cycle time, completion rate, load per assignee) from `raw_asana` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Asana connector spec](/connectors/asana)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
