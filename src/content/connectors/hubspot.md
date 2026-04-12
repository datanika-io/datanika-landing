---
title: "Connect HubSpot to Datanika"
description: "Step-by-step guide to sync HubSpot CRM into your warehouse with Datanika — create an API key, add the connection, pick objects, run, and schedule."
source: "hubspot"
source_name: "HubSpot"
category: "saas"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating the HubSpot private app](/docs/connectors/hubspot/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. Open **Connections → New connection** and select **HubSpot**.
2. Fill in:
   - **API Key** — the private app access token from Step 1. Stored encrypted.
3. Click **Save**.

> **No "Test connection" button.** HubSpot is an HTTP-API source — credentials are validated on the first run.

![Adding HubSpot in Datanika](/docs/connectors/hubspot/02-add-connection.png)

## Step 3 — Configure objects

1. Open the connection and click **Configure pipeline**.
2. Pick the destination and target schema (e.g. `raw_hubspot`).
3. Default objects: `contacts`, `companies`, `deals`. Select the subset you need.
4. Use `merge` — HubSpot records are identified by their `hs_object_id`.
5. Save.

## Step 4 — First run

1. Click **Run now**. HubSpot CRM API uses cursor-based pagination — expect 1–5 minutes for a mid-size account.
2. Browse **Catalog → `raw_hubspot`** to verify tables.

![First run](/docs/connectors/hubspot/04-first-run.png)

## Step 5 — Schedule it

Every 6 hours is typical for marketing analytics. Daily for reporting.

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
