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

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported resources and pagination — see the [Asana connector page](/connectors/asana).

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
   - **API Key** — paste the personal access token from Step 1. Stored encrypted at rest with Fernet.
   - **Workspace GID** *(optional)* — the workspace whose projects to load, e.g. `1210548032693177`. Leave it blank to load every project the token can reach. Asana shows the GID in the URL when you open a workspace's admin console; `workspaces` is also one of the tables this connector loads, so a first run without it tells you the GID for later.
4. Click **Create Connection**.

> **Workspace GID scopes `projects`, and only `projects`.** Blank is a working configuration, not an unfinished one: Datanika then loads every project the token can reach. Fill it in and `projects` is restricted to that workspace. It is deliberately **not** applied to `tasks` (see Step 3), and `workspaces`, `users` and `tags` are account-wide either way. To narrow the sync further, use a token from a user with access to only what you want.
>
> **Test Connection really checks this credential.** Clicking it sends one authenticated request to the Asana API (it reads your own user record). A revoked, mistyped or suspended credential comes back **red**, naming the status Asana returned — it is no longer styled as a pass. What it does not check is **scope**: a credential that passes here can still lack access to the workspace you named above, or to the projects inside it, and that surfaces on the first run.

![Adding Asana in Datanika](/docs/connectors/asana/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters, digits and spaces — anything else is stripped as you type, so `asana-daily-sync` becomes `asanadailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Asana connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Asana is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Asana the list is `projects`, `tags`, `tasks`, `users`, `workspaces`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all — though unticking *every* box loads the full set rather than nothing.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **`tasks` is loaded per project, so a task that belongs to no project is not synced.** Asana has no "all tasks in a workspace" endpoint: `GET /tasks` is refused outright without a scope, and a workspace on its own is not a scope — it is still refused. Datanika therefore walks `projects` and fetches each project's tasks. A task sitting in no project has no route in and will be absent from the `tasks` table. That is Asana's API rather than a dropped row, so check for project-less tasks before reading a short `tasks` table as a bug.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **derived from the upload's name**: spaces become underscores and the whole thing is lower-cased. So `asanadailysync` creates schema `asanadailysync`, and an upload named `Asana Daily Sync` creates schema `asana_daily_sync` — worth knowing, since the name field accepts spaces. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

> **An endpoint that returns no records creates no table, and that is not a failed load.** Every endpoint is ticked by default, so finding fewer tables than boxes is normal: all of them were fetched, and dlt creates a table only for a resource that actually yields rows. On a new or lightly-used account that is the common case.
>
> Tell the two apart before assuming a bug: a table that is **missing** means that endpoint returned no records; a table that **exists but is short** means rows were dropped. Checking the count in Asana itself is the fastest way to settle it.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `asanadailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

**What a scheduled run does to your tables:** each run replaces the upload's tables with what that run fetched, so a schedule keeps one copy of each record instead of adding another. A record the API no longer returns is gone after the next run, and so are rows only an earlier run had loaded. To keep every run's rows, the upload needs an explicit `"write_disposition": "append"` in its raw JSON config.

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
