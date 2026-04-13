---
title: "Datanika is AI-Agent Native: Build Data Pipelines with Autonomous Agents"
description: "Datanika ships a 5-tier agent API, /llms.txt discovery, and a strategy guide that lets Claude, GPT, or any LLM build complete data pipelines without human intervention. No competitor offers this."
date: 2026-04-12
updatedDate: 2026-04-12
author: "Datanika Team"
category: "announcement"
tags: ["announcement", "ai-agents", "api", "developer-experience"]
heroImage: "/logo.png"
---

## The Problem: AI Agents Can't Use Your Data Pipeline Tool

AI agents are getting good at writing code, answering questions, and managing workflows. But try pointing one at Fivetran, Airbyte, or Stitch and asking it to build a data pipeline. It won't get far.

These platforms weren't designed for machines. Their APIs lack discovery endpoints, config schemas are undocumented blobs, and there's no way for an agent to validate its work before executing it. The agent guesses, fails, and loops.

We decided to fix this. (If you missed it, we shipped the [REST API v1](/blog/datanika-rest-api-v1) last week — the agent stack builds on top of it.)

## What We Shipped: 5 Tiers of Agent Compatibility

Starting today, Datanika's API is fully agent-native. We built five tiers of capability that give an autonomous agent everything it needs to build a complete data pipeline from scratch — no human intervention required.

### Tier 1 — Discover & Introspect

An agent needs to know what's available before it can build anything. Our meta endpoints return full JSON Schema for every connection type, dlt config option, dbt test type, and materialization strategy. The agent doesn't guess — it reads the schema and builds valid configs.

```
GET /api/v1/meta/connection-types     → 32 types with config schemas
GET /api/v1/meta/dlt-config-schema    → full upload config schema
GET /api/v1/meta/dbt-tests            → test types with parameter schemas
POST /api/v1/connections/{id}/introspect → list source tables
POST /api/v1/connections/{id}/columns    → column types and metadata
```

### Tier 2 — Build

Standard CRUD for every resource: connections, uploads, pipelines, transformations, schedules, and notification channels. The agent builds the pipeline piece by piece using the schemas it discovered in Tier 1.

### Tier 3 — Validate Before Executing

This is where most competitor APIs fall short. Datanika lets the agent compile a dbt transformation (catching Jinja and ref errors) and preview the output — all without touching production data. Typed error codes (`compilation_error`, `execution_error`, `unsafe_sql`) let the agent branch on failures instead of regex-matching error messages.

```
POST /api/v1/transformations/{id}/compile   → validate SQL + Jinja
POST /api/v1/transformations/{id}/preview   → sample output rows
```

### Tier 4 — Execute with Control

Trigger runs and wait for completion in a single request (`?wait=true`). Cancel stuck runs. Retry safely with `Idempotency-Key` headers — same key within 24 hours returns the cached response instead of creating duplicates.

```
POST /api/v1/uploads/{id}/run?wait=true     → run and wait
POST /api/v1/runs/{id}/cancel               → cancel if stuck
```

### Tier 5 — Machine-Readable Discovery

Two unauthenticated documents that tell any LLM how to use the platform:

- **`/llms.txt`** — plain-text discovery file at the site root. Contains the API summary, base URL, auth format, rate limits, and the 5-tier capability list. Point your agent here first.
- **`/api/v1/agent-guide.md`** — a 17-step golden-path loop that walks the agent through the entire process: discover → introspect → build → validate → execute → monitor.

## The Golden-Path Loop

Here's what an agent does after reading our discovery docs:

1. Read `/llms.txt` to learn the API surface
2. Read `/api/v1/agent-guide.md` for the strategy
3. Discover available connection types with full config schemas
4. Create source + destination connections
5. Test both connections
6. Introspect the source to list tables and columns
7. Create an upload (extract + load job)
8. Run the upload and wait for completion
9. Browse the data catalog to see loaded tables
10. Write SQL transformations referencing those tables
11. Compile to validate — fix errors if any
12. Preview the output
13. Schedule the pipeline
14. Monitor runs

No guessing. No hallucination loops. Every step uses typed schemas and returns typed errors.

## How Competitors Compare

| Capability | Datanika | Fivetran | Airbyte | Stitch | Hevo |
|---|---|---|---|---|---|
| `/llms.txt` discovery | Yes | No | No | No | No |
| Agent strategy guide | Yes | No | No | No | No |
| Typed config schemas in API | Yes | No | Partial | No | No |
| Source introspection via API | Yes | No | Yes | No | No |
| Compile-before-run validation | Yes | No | No | No | No |
| Typed error codes for agents | Yes | No | No | No | No |
| Idempotent retries | Yes | Yes | No | No | No |
| Wait mode on run triggers | Yes | No | No | No | No |

Fivetran has no agent API. Airbyte has no `/llms.txt`. dbt Cloud has no compile-before-run via API. None of them publish a strategy guide that tells an agent how to use the platform end-to-end.

## Try It: Build a Pipeline with Your AI Agent

Point Claude, GPT, or any LLM at your Datanika instance:

```python
import httpx

BASE = "https://app.datanika.io/api/v1"
HEADERS = {"Authorization": "Bearer etf_your_key"}

# 1. Discover what's available
types = httpx.get(f"{BASE}/meta/connection-types", headers=HEADERS).json()

# 2. Create a Stripe source
stripe = httpx.post(f"{BASE}/connections", headers=HEADERS, json={
    "name": "Stripe Production",
    "connection_type": "stripe",
    "config": {"api_key": "sk_live_..."},
}).json()

# 3. Create a BigQuery destination
bq = httpx.post(f"{BASE}/connections", headers=HEADERS, json={
    "name": "Analytics Warehouse",
    "connection_type": "bigquery",
    "config": {"project": "my-project", "dataset": "raw_stripe",
               "service_account_json": "..."},
}).json()

# 4. Introspect, build upload, run, transform...
# The agent guide at /api/v1/agent-guide.md has the full 17-step loop.
```

Or just tell your agent: *"Read https://app.datanika.io/llms.txt and build me a Stripe-to-BigQuery pipeline."*

For a head start, point the agent at our public [pipeline templates](/templates) — the [Stripe → Postgres](/templates/stripe-to-postgres) and [Postgres → BigQuery](/templates/postgres-to-bigquery) pages ship pre-validated schemas, prerequisites, and example transformations that collapse the Tier 1 discovery loop into a single read.

## What's Next

We're working on agent-specific observability (tracking which pipelines were built by agents vs. humans) and a Claude Code MCP integration for building pipelines directly from your terminal.

## Get Started

1. [Create a free account](https://app.datanika.io) — 500 model runs/month, no credit card
2. Generate an API key in Settings
3. Point your AI agent at `/llms.txt`

Read the full [AI Agents documentation](/docs/ai-agents), explore the [API reference](/docs/api), or see how we [compare to Airbyte](/compare/airbyte) and [Fivetran](/compare/fivetran).
