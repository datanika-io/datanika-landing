---
title: "Connect Pipedrive to Datanika"
description: "Step-by-step guide to sync Pipedrive CRM into your warehouse with Datanika — get an API token, add the connection, pick resources, run, and schedule."
source: "pipedrive"
source_name: "Pipedrive"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-17"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Pipedrive is the sales CRM of record for many SMBs — deals, pipelines, activities, and contacts all live there. This guide lands Pipedrive data in your warehouse so you can build revenue and sales-velocity dashboards (win rate, stage conversion, activity-to-close) that join with product and finance data. Get an API token, wire it into Datanika, pick resources, run, and schedule. Under 10 minutes.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — supported resources, incremental sync, pagination — see the [Pipedrive connector page](/connectors/pipedrive).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. Pipedrive is **source-only**.
- A **Pipedrive account**. Any user can read their own API token, but company admins can restrict API access — check with your admin if the token is missing.

## Step 1 — Get your API token in Pipedrive

Pipedrive personal API tokens authenticate as a specific user and inherit that user's visibility.

1. In Pipedrive, click your **profile picture / account name** (top-right) → **Personal preferences**.
2. Open the **API** tab.
3. Copy your **personal API token**. (If the tab is empty, an admin has disabled API access for your role — ask them to enable it or use an admin user.)

> **Least privilege.** The token sees exactly what its user sees. For a full-company sync, use a token from an admin (or a dedicated "integrations" user) with visibility to all pipelines. For a scoped sync, use a limited user.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page.
2. From the **type dropdown**, pick **`pipedrive`**.
3. Fill in:
   - **Connection Name** — a label for this connection, e.g. `pipedrivesales`.
   - **API Key** — paste the token from Step 1. (The field is labelled *API Key (optional)*, but Pipedrive needs it.) Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **The token is all you need.** Datanika calls the global Pipedrive API host, so there's no company-domain field — the personal API token is already scoped to its own company.
>
> **Test Connection doesn't apply here.** Pipedrive is an HTTP-API source; clicking **Test Connection** shows *"Test not applicable for this type."* The credential is validated on the first run instead.

![Adding Pipedrive in Datanika](/docs/connectors/pipedrive/02-add-connection.png)

## Step 3 — Configure resources and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_pipedrive`.
3. Resources typically include:
   - `deals` — the main table: value, stage, status, owner, pipeline, won/lost timestamps
   - `persons` — contacts
   - `organizations` — company records
   - `activities` — calls, meetings, tasks
   - `pipelines` and `stages` — the funnel definition (needed to label deal stages)
   - `users` — sales reps
4. For each resource, pick a **Write disposition**:
   - `merge` — recommended for `deals`, `persons`, `activities` (they update as the sale progresses). Uses the record `id` as the primary key.
   - `replace` — fine for small reference tables like `pipelines`, `stages`, `users`.
5. Save.

> **Tip.** Sync `deals` + `stages` + `pipelines` together — you need the latter two to turn `stage_id` on a deal into a human-readable funnel step in dbt.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Pipedrive paginates results; a few thousand deals sync in a minute or two. Large instances with heavy activity history take longer on the first backfill.
3. If the token is wrong, the run fails with `401 Unauthorized`.
4. When finished, open **Catalog → `raw_pipedrive`** and browse the tables.

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Common cadences:
   - **Hourly** — live sales dashboards, pipeline-review prep.
   - **Every 6 hours** — daily rep/manager reports.
   - **Daily at 03:00** — weekly/monthly revenue and forecast analysis.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications**.

## Troubleshooting

### `401 Unauthorized`
**Cause.** The API token is wrong or was regenerated in Pipedrive.
**Fix.** Re-copy the token from **Personal preferences → API** and paste it into the connection's **API Key** field.

### A pipeline or user sees fewer deals than expected
**Cause.** Personal API tokens only return records the token's user can see. A rep's token won't return other reps' private deals.
**Fix.** Use an admin (or dedicated integrations) user's token for a full-company sync.

### Custom fields show up as random 40-character column names
**Cause.** Pipedrive returns custom fields keyed by a hashed API key (e.g. `dcf558a...`), not by their display label.
**Fix.** This is expected. Map the hashes to friendly names in a dbt staging model — the key-to-label mapping is available from the `dealFields` / `personFields` endpoints.

### `429 Too Many Requests`
**Cause.** Pipedrive enforces a per-token rate limit (token-based budget that varies by plan).
**Fix.** dlt backs off and retries automatically. If it recurs on large syncs, schedule less frequently or split resources across pipelines.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** sales-funnel models (stage conversion, win rate, cycle time) from `raw_pipedrive` in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Pipedrive connector spec](/connectors/pipedrive)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
