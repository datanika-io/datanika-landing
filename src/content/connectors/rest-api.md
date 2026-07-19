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

## Step 3 — Configure endpoints and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — e.g., `raw_api` or `raw_<service_name>`.
3. Configure the endpoints to sync. Each endpoint maps to one table:
   - **Path** — the relative path from the base URL, e.g. `/users`, `/orders`, `/products`.
   - **Response path** — if the API wraps results in a nested key (e.g., `{"data": {"items": [...]}}`), specify the JSON path to the array.
4. For each endpoint, pick a **Write disposition**:
   - `replace` — full refresh every run. The simplest option, works for any API.
   - `append` — adds new records. Use for event/log-style endpoints.
   - `merge` — upserts by a primary key. Use for entity endpoints (users, orders) if the API supports filtering by `updated_since`.
5. Save.

> **Tip.** Start with one small endpoint (`/users` or `/health`) to validate the connection and response parsing before configuring the full set.

## Step 4 — First run

1. Click **Run now**.
2. Watch the **Runs** tab. Performance depends entirely on the target API — fast APIs with few records finish in seconds; slow paginated APIs with millions of records can take minutes to hours.
3. Common first-run failures:
   - `401 Unauthorized` — bad token or wrong auth type.
   - `404 Not Found` — wrong base URL or endpoint path.
   - `JSONDecodeError` — the API returned HTML or XML instead of JSON (wrong URL, auth redirect, or the API isn't JSON-based).
4. When finished, open **Catalog → `raw_api`** and browse. One table per endpoint.
## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. The right cadence depends on how often the source data changes:
   - **Hourly** — event streams, rapidly changing data.
   - **Every 6 hours** — entity data that changes throughout the day.
   - **Daily at 03:00** — reference data, slow-moving catalogs.
3. Choose a **timezone** and save.

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
