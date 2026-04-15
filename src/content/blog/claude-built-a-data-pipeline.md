---
title: "I Asked Claude to Build a Stripe → BigQuery Pipeline. It Did."
description: "A hands-on walkthrough of an AI agent building a complete data pipeline end-to-end — discovery, validation, execution — with zero human code in the loop."
date: 2026-04-16
updatedDate: 2026-04-16
author: "Datanika Team"
category: "tutorial"
tags: ["ai-agents", "llm", "tutorial", "api", "developer-experience"]
heroImage: "/logo.png"
---

## The Prompt

A few days after we shipped the [5-tier agent API](/blog/ai-agent-native), I ran the cleanest test I could think of. I opened Claude, pasted a Datanika API key, and typed exactly this:

> *"Read https://app.datanika.io/llms.txt and build me a Stripe-to-BigQuery pipeline. Load the charges and customers tables daily."*

No schema. No sample code. No starter template. Just a URL and a sentence.

What happened next is what an "AI data pipeline" tool is supposed to feel like — and as far as I can tell, it's the only ELT platform where it actually works today.

## What Claude Did (Transcript, Trimmed)

### Step 1 — Read the discovery doc

```
GET /llms.txt
```

`/llms.txt` is a plain-text manifest: base URL, auth header format, rate limits, the 5 agent capability tiers, and pointers to the full OpenAPI spec and the 17-step strategy guide at `/api/v1/agent-guide.md`. Claude pulled both. Total: ~8 KB of context. No HTML to parse, no JS to render, no cookie wall.

This is the piece every other ELT tool is missing. An LLM without a discovery doc has to guess endpoint names from documentation scraped months ago — and that documentation was written for humans, which means it's missing the machine-readable details the agent actually needs (exact parameter names, which fields are required, what errors mean).

### Step 2 — Discover connection types

```
GET /api/v1/meta/connection-types
```

Returns JSON for all 32 sources with full config schemas. Claude picked `stripe` and `bigquery`, read the schemas, and knew exactly which fields to set. No guessing `api_key` vs `secret_key` vs `token` — the schema said `api_key`, so `api_key` it was.

This is the thing I was most skeptical about before we built it. "Why not just document the endpoints?" we thought. Because documentation doesn't compile. A schema does.

### Step 3 — Create source and destination

```
POST /api/v1/connections  {"name": "Stripe Prod", "connection_type": "stripe", ...}
POST /api/v1/connections  {"name": "Warehouse",   "connection_type": "bigquery", ...}
POST /api/v1/connections/{id}/test
POST /api/v1/connections/{id}/test
```

Claude tested both connections before doing anything else. I didn't tell it to. The `agent-guide.md` golden-path loop says "test before building," and the agent followed it.

Both passed.

### Step 4 — Introspect the source

```
POST /api/v1/connections/{stripe_id}/introspect
```

Returns the list of Stripe tables Datanika's dlt pipeline can extract: `charges`, `customers`, `invoices`, `subscriptions`, `events`, and a dozen more. Claude matched "charges and customers" from the prompt to the exact table names and moved on.

No LLM hallucination, no "I think Stripe has a `transactions` table" (it doesn't). The source told the agent what tables existed.

### Step 5 — Build the upload and run it

```
POST /api/v1/uploads
  {"source_id": ..., "destination_id": ..., "tables": ["charges", "customers"],
   "write_disposition": "merge"}

POST /api/v1/uploads/{id}/run?wait=true
```

`?wait=true` is the part I want to call out. Most ELT APIs let you trigger a run and return immediately — then you have to poll for completion. Agents loop forever on polling. We added blocking mode specifically because `wait=true` compresses 30 lines of agent code into one call. The agent fires the request, sits on it for however long the run takes (up to the timeout), and gets back a typed result: success, failure with error code, or timeout.

Claude's first run succeeded. 4 seconds. 127 charges loaded. 48 customers.

### Step 6 — Write a transformation, compile it, preview it

Claude decided to add a `monthly_revenue` model on top of raw charges — I didn't ask it to, but it's a sensible default for a Stripe pipeline, and the [agent guide](https://app.datanika.io/api/v1/agent-guide.md) explicitly tells agents to offer a starter transformation.

```sql
SELECT
  DATE_TRUNC(created_at, MONTH) AS month,
  SUM(amount) / 100.0 AS revenue_usd,
  COUNT(*) AS charge_count
FROM {{ ref('charges') }}
WHERE status = 'succeeded'
GROUP BY month
```

Then — the step no other ELT platform offers over the API:

```
POST /api/v1/transformations/{id}/compile   → 200 OK
POST /api/v1/transformations/{id}/preview   → returns 12 rows of sample output
```

**Compile-before-run.** Datanika runs dbt's compile step against the live warehouse schema, catches Jinja errors, catches missing refs, catches type mismatches, catches `unsafe_sql` — and returns a typed error code if any of those fail. Claude hit one `compilation_error` on its first draft (used `total` instead of `amount`), the API returned the failed line and column, Claude fixed the SQL and re-compiled. Green on the second try.

Preview ran a `LIMIT 12` against the compiled SQL and returned actual rows. Claude checked they looked sane and moved on.

### Step 7 — Schedule it

```
POST /api/v1/schedules  {"pipeline_id": ..., "cron": "0 2 * * *", "timezone": "UTC"}
```

Daily at 2 AM UTC. Done.

Total time from prompt to running autonomous data pipeline: **~4 minutes, ~23 API calls, zero human intervention after the initial sentence.**

## Why This Works (And Why Your Other ELT Tool Can't)

I keep going back to the same list. An agent needs five things to build an autonomous data pipeline without supervision:

1. **Machine-readable discovery** so it knows the platform exists and how to talk to it. (`/llms.txt` + `/api/v1/agent-guide.md`.)
2. **Typed schemas** for every config object so it doesn't guess field names. (The `/api/v1/meta/*` endpoints.)
3. **Source introspection via API** so it can match user intent ("charges and customers") to actual source tables. (`POST /connections/{id}/introspect`.)
4. **Compile-before-run validation** so it can fix SQL mistakes before burning warehouse credits or production data. (`POST /transformations/{id}/compile`.)
5. **Typed error codes** so it can branch on failure instead of regex-matching English error messages. (`compilation_error`, `execution_error`, `unsafe_sql`, `idempotent_replay`.)

[Fivetran has no agent API.](/compare/fivetran) [Airbyte has connectors but no discovery doc and no compile-before-run.](/compare/airbyte) dbt Cloud compiles, but only inside its own UI — not over the API. Stitch's API is read-mostly. Hevo's is a thin CRUD layer with no schemas exposed.

We're the only [AI-native ETL](/ai-agents) platform on this list where you can hand an LLM a URL and walk away.

## What This Unlocks

The thing I didn't expect when we shipped the 5-tier API is how quickly the interaction model shifts. When you're the human, you stop writing pipeline code and start writing pipeline *intent*.

"Load charges and customers daily" is not a spec a human could hand to another human and expect a finished pipeline. But it's a complete spec for an agent that has typed schemas, introspection, and compile validation. The missing 98% of the spec is filled in by the platform, not the person.

That's the actual thesis of LLM data pipelines — not "AI writes your SQL" but "the platform exposes enough structured surface area that an agent can fill in the gaps deterministically."

## Try It Yourself

If you have a free Datanika account and ten minutes:

1. Grab an API key from **Settings → API Keys**.
2. Paste this into Claude, ChatGPT, or any LLM with tool-use:

   > *"Read https://app.datanika.io/llms.txt, then build a [your-source]-to-[your-destination] pipeline that loads [your-tables] daily. Use API key `etf_...`."*

3. Watch it work.

For the impatient, our [Stripe → Postgres template](/templates/stripe-to-postgres) collapses steps 2-4 into a single pre-validated config. Point the agent at the template URL and it'll skip straight to running.

Full details on the API surface are in the [AI Agents docs](/docs/ai-agents), and the behind-the-scenes post on why we built all this is at [Datanika is AI-Agent Native](/blog/ai-agent-native).

We also [compare to Fivetran](/compare/fivetran) and [Airbyte](/compare/airbyte) if you want to see the capability gap on one page.

## What's Next

We're working on a Claude Code MCP server that wraps the whole 5-tier API so you can build pipelines directly from your terminal without any HTTP ceremony. If you'd like early access, [create a free account](https://app.datanika.io) and drop us a note — no credit card, 500 model runs/month, 10 GB/month of data.

The point isn't that an AI built a pipeline. The point is that the pipeline platform was built so an AI *could*.
