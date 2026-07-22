---
title: "Connect Shopify to Datanika"
description: "Step-by-step guide to sync Shopify into your warehouse with Datanika — create an API key, add the connection, pick resources, run, and schedule."
source: "shopify"
source_name: "Shopify"
category: "saas"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases:
  - "shopify-to-bigquery"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Shopify is the go-to e-commerce source for teams building revenue analytics, inventory dashboards, and customer cohort reports. This guide walks you through creating a Shopify custom app, wiring it into Datanika, and scheduling syncs of orders, products, and customers into your warehouse.

> **Shopify is source-only.** You can extract data from Shopify but can't use it as a destination.

## Prerequisites

- A **Datanika account** with permission to create connections.
- A **destination warehouse** already connected.
- **Shopify store** with access to create custom apps (requires Shopify Plus or a development store, or the store owner's permission).

## Step 1 — Create a Shopify custom app

1. In your Shopify admin, go to **Settings → Apps and sales channels → Develop apps**.
2. Click **Create an app**, name it `Datanika Sync`.
3. Under **API credentials → Admin API access scopes**, grant read access to:
   - `read_orders`, `read_products`, `read_customers`
   - Add more scopes for additional resources you want to sync.
4. Click **Install app** and copy the **Admin API access token**. This is shown only once.

> **Least privilege.** Only grant `read_*` scopes. Datanika never writes to Shopify.
## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`** and pick `shopify` from the type dropdown at the top of the inline New Connection form.
2. Fill in:
   - **Connection Name** — a label for this connection, e.g. `shopify-store`.
   - **API Key (optional)** — the Admin API access token from Step 1. Stored encrypted.
   - **Store Name** — your Shopify store subdomain (e.g. `my-store` from `my-store.myshopify.com`). Just the subdomain, not the full URL.
3. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **Credentials are validated on the first run.** Shopify is an HTTP-API source, so the **Test Connection** button reports *"Test not applicable for this type"* — the token is validated for real when the first pipeline runs.

![Adding Shopify in Datanika](/docs/connectors/shopify/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `shopify-daily-sync` becomes `shopifydailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Shopify connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Because Shopify is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. For Shopify the list is `orders`, `products`, `customers`. Untick anything you do not want; each ticked endpoint becomes its own table in the destination.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a SaaS source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here.

> **The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for Shopify rather than from your account, so it does not reflect custom objects. Anything outside the list needs the [REST API connector](/docs/connectors/rest-api).

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `shopifydailysync` creates schema `shopifydailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `shopifydailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `Shopify source requires 'api_key' and 'store'`
**Fix.** Both fields are required. Store must be just the subdomain (e.g. `my-store`), not `my-store.myshopify.com`.

### `401 Unauthorized`
**Fix.** The access token was revoked or the app was uninstalled. Reinstall the app in Shopify and paste the new token.

### Rate limited by Shopify
**Fix.** dlt retries with backoff automatically. For very large stores, reduce schedule frequency.

## Related

- **Use cases:** [Shopify → BigQuery](/use-cases/shopify-to-bigquery)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **Connector reference:** [Shopify connector spec](/connectors/shopify)
