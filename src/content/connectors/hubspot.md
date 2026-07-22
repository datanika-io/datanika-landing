---
title: "Connect HubSpot to Datanika"
description: "Step-by-step guide to sync HubSpot CRM into your warehouse with Datanika — create an API key, add the connection, pick objects, run, and schedule."
source: "hubspot"
source_name: "HubSpot"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases:
  - "hubspot-to-snowflake"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

HubSpot is the most common marketing + CRM source our users sync into their warehouse. This guide walks you through creating a private app token, wiring it into Datanika, and scheduling syncs of contacts, companies, and deals.

> **HubSpot is source-only.** You can extract data from HubSpot but can't use it as a destination.

## Prerequisites

- A **Datanika account** with permission to create connections.
- A **destination warehouse** already connected.
- **HubSpot account** with permission to create private apps (Super Admin or a user with App Marketplace permissions).

## Step 1 — Create a HubSpot private app

1. In HubSpot, go to **Settings → Integrations → Private Apps**.
2. Click **Create a private app**, name it `Datanika Sync`.
3. Under **Scopes**, grant read access to:
   - `crm.objects.contacts.read`
   - `crm.objects.companies.read`
   - `crm.objects.deals.read`
4. Click **Create app** and copy the **access token**. HubSpot shows it once — store it securely.

> **Least privilege.** Only grant `read` scopes. Datanika never writes to HubSpot.
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`** and pick `hubspot` from the type dropdown at the top of the inline New Connection form.
2. Fill in:
   - **Connection Name** — a label for this connection, e.g. `hubspot-crm`.
   - **API Key (optional)** — the private app access token from Step 1. Stored encrypted.
3. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **Credentials are validated on the first run.** HubSpot is an HTTP-API source, so the **Test Connection** button reports *"Test not applicable for this type"* — the token is validated for real when the first pipeline runs.

![Adding HubSpot in Datanika](/docs/connectors/hubspot/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `hubspot-daily-sync` becomes `hubspotdailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the HubSpot connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because HubSpot is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For HubSpot the list is `contacts`, `companies`, `deals`, `products`, `tickets`, `quotes`. Each endpoint becomes its own table in the destination.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **⚠️ Unticking does not currently narrow the load.** The selection is stored as `endpoints` in the upload config, and the HubSpot loader does not read it — it pulls its full default resource set regardless ([core#532](https://github.com/datanika-io/datanika-core/issues/532)). Nothing fails; you simply get every table rather than the subset you picked. Drop what you do not need in a dbt model downstream until this is wired up.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for HubSpot rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `hubspotdailysync` creates schema `hubspotdailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `hubspotdailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `401 Unauthorized`
**Fix.** The private app token was revoked or the app was deleted. Recreate it in HubSpot.

### Missing properties in the landed tables
**Fix.** HubSpot's API only returns default properties unless you specify custom ones. For custom properties, configure the pipeline's `resources` to request additional property fields.

### Rate limited
**Fix.** HubSpot's rate limit is 100 requests/10 seconds for private apps. dlt retries automatically. For very large portals, reduce schedule frequency.

## Related

- **Use cases:** [HubSpot → Snowflake](/use-cases/hubspot-to-snowflake)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **Connector reference:** [HubSpot connector spec](/connectors/hubspot)
