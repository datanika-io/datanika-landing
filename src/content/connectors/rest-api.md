---
title: "Connect a REST API to Datanika"
description: "Step-by-step guide to sync data from any REST API into your warehouse with Datanika — configure the base URL, authentication, endpoints, run, and schedule."
source: "rest_api"
source_name: "REST API"
category: "api"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

The REST API connector is the escape hatch for any data source that doesn't have a dedicated Datanika connector — internal microservices, niche SaaS tools, government open-data portals, or any system that exposes a JSON API. Point Datanika at a base URL, configure authentication, and it handles pagination, rate limiting, and schema inference. This guide covers the generic setup; specific API quirks depend on the source.

> **Looking for the connector spec?** This is the hands-on setup guide. For the full field-by-field reference — pagination strategies, response parsing, nested JSON handling — see the [REST API connector page](/connectors/rest-api).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. REST API is **source-only**.
- The **base URL** of the API you want to sync (e.g., `https://api.example.com/v1`).
- **Authentication credentials** — depends on the API: bearer token, API key, or basic auth (username + password). Some APIs require no auth at all.
- The API documentation — you'll need to know which endpoints to hit and what the response shape looks like.

## Step 1 — Gather API credentials

This step varies by API. Common patterns:

**Bearer token (most common):**
1. Find the API's authentication docs.
2. Generate or copy a token — usually from a developer portal, settings page, or OAuth flow.
3. The token is sent as `Authorization: Bearer <token>` on every request.

**API key:**
1. Find the API key in the service's settings or developer portal.
2. Typically sent as a query parameter (`?api_key=…`) or a custom header (`X-API-Key: …`).

**Basic auth:**
1. Use a username + password or username + API key pair.
2. Sent as `Authorization: Basic <base64(user:pass)>`.

**No auth:**
Some public APIs (government data, open datasets) require no authentication at all.

> **Least privilege.** Request read-only API keys or tokens whenever the API supports scoped permissions.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `rest_api`.
3. Fill in:
   - **Connection Name** — a label you'll recognize, e.g. `internal-users-api` or `weather-data`.
   - **Base URL** — the root URL all endpoints share, e.g. `https://api.example.com/v1`. Include the protocol and version prefix if applicable.
   - **API Key (optional)** — a bearer / API-key token, sent on the `Authorization` header. Leave blank for unauthenticated APIs. Stored encrypted at rest with Fernet.
   - **Extra Headers (optional, JSON)** — any additional request headers as a JSON object, e.g. `{"X-Custom-Header": "value"}`. Use this for API-key-in-custom-header schemes or extra auth headers.
4. Click **Test Connection** (an HTTP-API source returns *"Test not applicable for this type"*), then **Create Connection**.

> **The structured form is intentionally minimal.** It ships **three** fields — **Base URL**, **API Key (optional)**, and **Extra Headers (optional, JSON)** — not a per-auth-type builder. Bearer / API-key auth goes in **API Key**; anything more exotic (basic auth, custom header names, query-param keys) goes in **Extra Headers** as JSON, or use the **Use raw JSON config** escape hatch. Credentials are validated on the first pipeline run.

![Adding a REST API connection in Datanika](/docs/connectors/rest-api/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `restapi-daily-sync` becomes `restapidailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the REST API connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a REST API source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. Endpoints and pagination are set on the **connection** (Base URL, API Key, Extra Headers) — there is no endpoint selector on the upload form.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `restapidailysync` creates schema `restapidailysync` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `restapidailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `401 Unauthorized` or `403 Forbidden`
**Cause.** Wrong credentials, expired token, or the auth type doesn't match what the API expects.
**Fix.** Verify the auth type (`bearer` vs `api_key` vs `basic`) matches the API's documentation. Regenerate the token if expired.

### `404 Not Found`
**Cause.** The base URL or endpoint path is wrong.
**Fix.** Test the full URL (`base_url + path`) in a browser or `curl` first. Common mistakes: missing `/v1` or `/v2` version prefix, trailing slash mismatch, wrong casing.

### Response parsing fails (empty tables or wrong schema)
**Cause.** The API wraps data in a nested structure and the pipeline isn't configured to extract it.
**Fix.** Check the raw API response (use `curl` or your browser's dev tools) and set the **response path** to point at the array of records.

### Pagination doesn't work (only first page loaded)
**Cause.** The API uses a pagination scheme that the generic REST connector doesn't auto-detect.
**Fix.** Configure pagination explicitly in the pipeline settings — specify the pagination type (offset, cursor, link-header) and the relevant parameters.

### Rate limited (HTTP 429)
**Cause.** The API enforces request rate limits and the sync is hitting them.
**Fix.** dlt retries with backoff automatically. If persistent, reduce the number of endpoints per pipeline or add a `Retry-After`-aware delay.

## Related

- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **dbt tips:** generic staging patterns for API data in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [REST API connector spec](/connectors/rest-api)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
