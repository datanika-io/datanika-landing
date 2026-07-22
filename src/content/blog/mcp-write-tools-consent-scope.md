---
title: "Your Agent Can Now Change Things — If You Say So Once"
description: "MCP write tools are live. An agent connected to Datanika can create connections, build pipelines and trigger runs — but only when you grant it at OAuth consent, and a client that asks for nothing gets read-only."
date: 2026-08-09
publishedAt: 2026-08-09
author: "Datanika Team"
category: "product"
tags: ["mcp", "ai-agents", "security", "oauth", "product"]
---

Until now, an agent connected to Datanika over [MCP](/docs/mcp-server/) could look but not touch. It read your connections, previewed tables, compiled dbt models and pulled run logs — genuinely useful for debugging, and deliberately unable to change anything.

The eight write tools are now available over the hosted endpoint: create connections, uploads, pipelines and transformations, bulk-import a whole project, and trigger runs. This is the first release where an agent can act on your data rather than only read it.

The interesting part isn't the tools. It's where the decision lives.

## The decision is yours, and you make it once

Write access is granted at **OAuth consent time**. When a client asks for write scopes, you approve them in the browser, and the API key that approval mints carries exactly those scopes. There is no runtime toggle, no per-call prompt, and nothing to restart.

We considered a per-call confirmation — the agent asks, you approve each write. It doesn't survive contact with a stateless transport, and more importantly it gates the wrong party: a token the agent mints and echoes back to itself is a ritual, not a control. The agent is the thing being gated, so it can't also hold the gate.

So the human decision moves to the one moment a human is definitely present and definitely paying attention: the consent screen. What you approve is what the credential can do, and enforcement stays on the key's scopes where it already lived.

## Three properties worth knowing

**Silence is not consent.** A client that omits `scope`, or asks for something we don't recognise, gets read-only. Clients omit it routinely, so this had to be the default rather than an error — an agent should never acquire write access because a request was ambiguous.

**A pasted API key stays read-only on the hosted endpoint** — even if that key's own scopes would permit writes. Nothing recorded a human decision, so the hosted path won't infer one from a credential you copied into a config file. (Your key's scopes still bound what the REST API does with it; this is specifically about what the MCP layer will expose.)

**There is no "may build but may not trigger" tier**, and this is the refinement we deliberately didn't ship. It sounds prudent: let the agent draft a pipeline, reserve the run for a human. But the REST API gives `create_upload` and `trigger_upload` the same `uploads:write` scope. A checkbox splitting them could only be enforced inside the MCP layer, while the credential itself still permitted both — a control the token doesn't back, which is exactly the kind of security theatre the per-call confirmation would have been. Spend is bounded by your key's rate limit and byte quota instead, which are real limits rather than a UI promise.

## What the screen tells you

A read-only grant shows a green **Read-only** badge and says the app cannot create, modify, delete or trigger anything.

A write grant shows an amber **Read and write** badge and spells the capability out: *"Create, modify and delete connections, uploads, pipelines, transformations, schedules and notifications — and trigger runs"*, with a caution that the app can change your data and start jobs that use your quota.

It also names the API key that approving will create — `MCP: <app name>` — so you know what to look for later. Revoking that key in **Settings → API Keys** ends the grant; the authority travels with the credential, so there's no second place to check.

## Should you grant it?

Often, no — and that's not false modesty. The most common thing people want from an agent here is *"help me understand why this pipeline broke,"* which is entirely a read operation. Read-only is the better default for a connection you'll leave in place.

Write access earns its keep when you want the agent to actually build: scaffold a set of dbt models, wire up a new source, re-run a failed load while you're reading the logs. If that's the job, grant it — knowingly, to a client you trust, with a key you can revoke in one click.

What we'd suggest either way: use a separate grant for agent work rather than reusing a key from CI. If an agent does something surprising, you want to revoke one thing and know exactly what you broke.

## What the agent leaves behind

The write tools create dbt models and dlt-backed uploads — the same artifacts you'd have built by hand. `create_transformation` writes SQL with `ref()` and `source()`, testable and runnable by plain `dbt run` on a machine that has never heard of Datanika.

That matters more with write access than without it. An agent can produce a lot of work quickly, and if that work lands in a proprietary format the speed becomes a liability. We wrote about that trade-off on the [AI agents page](/ai-agents#portability); write tools are the point where it stops being theoretical.

## Getting started

Full setup, the complete tool list, and the security model are in the [MCP server guide](/docs/mcp-server/). If you're already connected read-only, re-authorize with a client that requests write scopes — the consent screen will show you the difference.

---

*Datanika is an open-source data pipeline platform built on dlt and dbt-core. [Start free](https://app.datanika.io/) with 10 GB/month, or [self-host it](/docs/self-hosting/).*
