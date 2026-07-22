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

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `pipedrive-daily-sync` becomes `pipedrivedailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Pipedrive connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Pipedrive is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Pipedrive the list is `activities`, `deals`, `organizations`, `persons`, `pipelines`, `stages`, `users`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `pipedrivedailysync` creates schema `pipedrivedailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `pipedrivedailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

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
