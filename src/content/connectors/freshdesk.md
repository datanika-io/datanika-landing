---
title: "Connect Freshdesk to Datanika"
description: "Step-by-step guide to sync Freshdesk tickets into your warehouse with Datanika — get your API key, add the connection, pick resources, run, and schedule."
source: "freshdesk"
source_name: "Freshdesk"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-17"
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
- Your **Freshdesk domain** — the `yourcompany` part of `https://yourcompany.freshdesk.com` (just the subdomain, not the full URL). You'll enter this in the **Freshdesk Domain** field.

## Step 1 — Get your API key in Freshdesk

Every Freshdesk agent has a personal API key. Authentication is HTTP Basic: the **API key is the username** and the password can be any placeholder (Datanika handles this for you).

1. Sign in to Freshdesk and click your **profile picture** (top-right) → **Profile settings**.
2. On the profile page, find **Your API Key** in the right-hand sidebar.
3. Copy the key.

> **Least privilege.** The API key inherits the agent's ticket scope and role. For a full-instance sync, use an **account admin** agent. For a limited sync, use an agent restricted to specific groups.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page.
2. From the **type dropdown**, pick **`freshdesk`**.
3. Fill in:
   - **Connection Name** — a label for this connection, e.g. `freshdesksupport`.
   - **Freshdesk Domain** — just the subdomain, not the full URL. If your Freshdesk is at `acme.freshdesk.com`, enter `acme`.
   - **API Key** — paste the key from Step 1. (The field is labelled *API Key (optional)*, but Freshdesk needs it.) Stored encrypted at rest with Fernet.
4. Click **Create Connection**.

> **Test Connection doesn't apply here.** Freshdesk is an HTTP-API source; clicking **Test Connection** shows *"Test not applicable for this type."* The credential is validated on the first run instead.

![Adding Freshdesk in Datanika](/docs/connectors/freshdesk/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `freshdesk-daily-sync` becomes `freshdeskdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Freshdesk connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Freshdesk is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Freshdesk the list is `agents`, `companies`, `contacts`, `groups`, `tickets`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all.
5. Click **Create Upload**. It appears in the table below with status `draft`.

![The New Upload form with a Freshdesk source and its endpoint checkboxes](/docs/connectors/freshdesk/03-configure-upload.png)

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `freshdeskdailysync` creates schema `freshdeskdailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `freshdeskdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `401 Unauthorized`
**Cause.** The **Freshdesk Domain** or API key is wrong — commonly the full URL was entered instead of just the subdomain, or the key was regenerated in Freshdesk.
**Fix.** Confirm the **Freshdesk Domain** is just the subdomain (e.g. `acme`, not `acme.freshdesk.com`) and re-copy the key from **Profile settings**.

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
