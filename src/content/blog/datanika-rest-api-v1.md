---
title: "Introducing the Datanika REST API v1"
description: "Programmatic access to your data pipelines — 36 endpoints, OpenAPI docs, scoped API keys, and plan-based rate limiting."
date: 2026-04-10
updatedDate: 2026-04-10
author: "Datanika Team"
category: "announcement"
tags: ["announcement", "api", "developer-experience"]
heroImage: "/logo.png"
---

## Your Pipelines, Programmable

Today we're shipping the Datanika REST API v1 — 36 endpoints that give you full programmatic control over your data pipelines.

Everything you can do in the UI, you can now do via HTTP: create connections, trigger pipeline runs, query run history, manage schedules, and configure notification channels.

## What's Included

### Full CRUD for Every Resource

| Resource | Endpoints |
|----------|-----------|
| Connections | List, Get, Create, Update, Delete, Test |
| Uploads | List, Get, Create, Update, Delete, Run |
| Pipelines | List, Get, Create, Update, Delete, Run |
| Transformations | List, Get, Create, Update, Delete, Run |
| Schedules | List, Get, Create, Update, Delete |
| Runs | List, Get, Logs |
| Notification Channels | List, Get, Create, Update, Delete |

### Authentication

API keys use Bearer token authentication. Create a key in **Settings > API Keys**, then include it in your requests:

```bash
curl -H "Authorization: Bearer etf_your_key_here" \
     https://app.datanika.io/api/v1/connections
```

Keys are scoped — you can limit a key to read-only access, run execution only, or specific resource types. See the [full scope reference](/docs/api#scopes) in our docs.

### Rate Limiting

Every plan gets generous API limits:

| Plan | Requests/minute | Burst/second |
|------|----------------|--------------|
| Free | 30 | 5 |
| Pro | 120 | 15 |
| Enterprise | 300 | 30 |

Rate limit headers (`X-RateLimit-Remaining`, `Retry-After`) are included in every response so your integrations can handle throttling gracefully.

Self-hosted users can configure limits via `API_RATE_LIMIT_RPM` and `API_RATE_LIMIT_BURST` environment variables.

### Interactive Docs

The API ships with an OpenAPI 3.0 spec and interactive Swagger UI at [`/api/v1/docs`](https://app.datanika.io/api/v1/docs). Try endpoints directly from your browser — no Postman needed.

## Use Cases

**CI/CD integration** — Trigger a pipeline run after your data model tests pass:
```bash
curl -X POST https://app.datanika.io/api/v1/pipelines/1/run \
     -H "Authorization: Bearer etf_ci_key"
```

**Custom monitoring** — Poll run status from your own alerting system:
```bash
curl https://app.datanika.io/api/v1/runs?status=failed \
     -H "Authorization: Bearer etf_monitor_key"
```

**Bulk setup** — Import connections, uploads, and pipelines from a JSON config:
```bash
curl -X POST https://app.datanika.io/api/v1/import \
     -H "Authorization: Bearer etf_admin_key" \
     -H "Content-Type: application/json" \
     -d @pipeline-config.json
```

**Scheduled reporting** — Fetch run history for weekly reports:
```bash
curl "https://app.datanika.io/api/v1/runs?target_type=pipeline&limit=100" \
     -H "Authorization: Bearer etf_report_key"
```

## What's Next

We're working on webhook triggers (run your pipeline when an external event fires) and a CLI tool built on top of the API. If you have feedback or feature requests, [open an issue on GitHub](https://github.com/datanika-io/datanika-core/issues).

## Try It

The API is available now on all plans, including Free. [Create an API key](https://app.datanika.io) and start automating.

Full documentation: [datanika.io/docs/api](/docs/api)

- [API Keys](/docs/api-keys) — create and manage API keys
- [Self-Hosting Guide](/docs/self-hosting) — the API works on self-hosted deployments too
- [32 Connectors](/connectors) — everything you can manage via the API
