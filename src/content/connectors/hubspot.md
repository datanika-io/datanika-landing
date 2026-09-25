---
title: "Connect HubSpot to Datanika"
description: "Step-by-step guide to sync HubSpot CRM into your warehouse with Datanika — create an API key, add the connection, pick objects, run, and schedule."
source: "hubspot"
source_name: "HubSpot"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-09-25"
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
   - **API Key** — the private app access token from Step 1. Stored encrypted.
3. Click **Test Connection** — it really calls the HubSpot API — then **Create Connection**.

> **Test Connection really checks this credential.** Clicking it sends one authenticated request to the HubSpot API (it reads a single contact). A revoked, mistyped or suspended credential comes back **red**, naming the status HubSpot returned — it is no longer styled as a pass. What it does not check is **scope**: a credential that passes here can still lack access to the specific objects and properties you name on the upload, and that surfaces on the first run.

![Adding HubSpot in Datanika](/docs/connectors/hubspot/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** and an optional **Description**. The name field keeps **letters, digits and spaces** and strips everything else *as you type*, so `hubspot-daily-sync` becomes `hubspotdailysync` — but `HubSpot Daily Sync` is kept exactly as typed. Both were measured on the shipped form.
3. Pick the **Source connection** and the **Destination connection** — the HubSpot connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because HubSpot is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For HubSpot the list is `companies`, `contacts`, `deals`. Untick anything you do not want: each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all — though unticking *every* box loads the full set rather than nothing.
5. Click **Create Upload**. It appears in the table below with status `draft`.

![The New Upload form configured for HubSpot, showing the companies, contacts and deals endpoint checkboxes all ticked](/docs/connectors/hubspot/03-configure-upload.png)

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for HubSpot rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **derived from the upload's name**: spaces become underscores and the whole thing is lower-cased. So `hubspotdailysync` creates schema `hubspotdailysync`, and an upload named `HubSpot Daily Sync` creates schema `hubspot_daily_sync` — worth knowing, since the name field accepts spaces. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

Open the landed table from **Models** and click **Load first 100 rows**. That runs a live `SELECT` against your destination, so what you see is the warehouse rather than a status badge:

![The Data preview on the landed contacts table, showing HubSpot contacts read live from the destination warehouse](/docs/connectors/hubspot/04-first-run.png)

> **An endpoint that has no records creates no table, and that is not a failed load.** All three endpoints are ticked by default, so it is normal to tick three and find **one** table in the destination. In the run above, `contacts` returned 2 records while `companies` and `deals` each returned 0 — all three were fetched, and dlt creates a table only for a resource that yields rows.
>
> Tell the two apart before assuming a bug: a table that is **missing** means that endpoint had no records; a table that **exists but is short** means records were dropped. Checking the count in HubSpot itself is the fastest way to settle it.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `hubspotdailysync`. The field suggests your existing target names as you type, so you can pick rather than retype; nothing validates a name you type past the suggestion, and a target that does not exist simply never fires.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

![The New Schedule form targeting the hubspotdailysync upload with the cron expression 0 3 * * * in UTC](/docs/connectors/hubspot/05-schedule.png)

**What a scheduled run does to your tables:** each run replaces the upload's tables with what that run fetched, so a schedule keeps one copy of each record instead of adding another. A record the API no longer returns is gone after the next run, and so are rows only an earlier run had loaded. To keep every run's rows, the upload needs an explicit `"write_disposition": "append"` in its raw JSON config.

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
