---
title: "Connect Shopify to Datanika"
description: "Step-by-step guide to sync Shopify into your warehouse with Datanika — create an API key, add the connection, pick resources, run, and schedule."
source: "shopify"
source_name: "Shopify"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating the Shopify custom app](/docs/connectors/shopify/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. Open **Connections → New connection** and select **Shopify**.
2. Fill in:
   - **API Key** — the Admin API access token from Step 1. Stored encrypted.
   - **Store** — your Shopify store subdomain (e.g. `my-store` from `my-store.myshopify.com`). Just the subdomain, not the full URL.
3. Click **Save**.

> **No "Test connection" button.** Shopify is an HTTP-API source — credentials are validated on the first run.

![Adding Shopify in Datanika](/docs/connectors/shopify/02-add-connection.png)

## Step 3 — Configure resources

1. Open the connection and click **Configure pipeline**.
2. Pick the destination and target schema (e.g. `raw_shopify`).
3. Default resources: `orders`, `products`, `customers`. Select the subset you need.
4. Use `merge` write disposition — Shopify records are identified by their numeric ID.
5. Save.

## Step 4 — First run

1. Click **Run now**. Shopify Admin API uses cursor-based pagination — expect 1–5 minutes for a typical store.
2. Browse **Catalog → `raw_shopify`** to verify tables landed.

![First run](/docs/connectors/shopify/04-first-run.png)

## Step 5 — Schedule it

Hourly or every 6 hours is typical for e-commerce analytics. Daily works for financial reporting.

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
