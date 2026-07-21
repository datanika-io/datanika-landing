---
title: "Your Data Pipelines, Now an MCP Server"
description: "datanika-mcp is on PyPI and the official MCP registry: 25 tools that let Claude, Cursor, or any MCP client browse connections, preview tables, compile dbt models, and read run logs. Read-only by default."
date: 2026-08-04
publishedAt: 2026-08-04
author: "Datanika Team"
category: "product"
tags: ["mcp", "ai-agents", "claude", "dbt", "product"]
---

Datanika now speaks MCP two ways. Paste our hosted endpoint into a client that supports remote MCP servers and approve it in the browser:

```
https://app.datanika.io/mcp
```

Or run it locally — `datanika-mcp` is on [PyPI](https://pypi.org/project/datanika-mcp/) and listed on the [official MCP registry](https://registry.modelcontextprotocol.io) as `io.datanika/datanika-mcp`:

```bash
uvx datanika-mcp
```

Read-only by default on both. Full setup is in the [MCP server guide](/docs/mcp-server/).

## What your agent can actually do

The [Model Context Protocol](https://modelcontextprotocol.io) is how an LLM client gets typed tools instead of a blob of API documentation and a hope. We expose **25 tools** over the [Datanika REST API](/api/reference) — 17 read-only, plus 8 write tools that stay switched off until you ask for them.

The interesting part isn't the count. It's that the read-only set is genuinely enough to be useful:

- **Discover and introspect** — list connections, read the typed config schema for any connector, list schemas and tables inside a source, preview rows, run a read-only `SELECT`.
- **Validate** — compile a dbt model, which resolves Jinja, `ref()` and `source()` without touching your warehouse. Then preview its output.
- **Observe** — list uploads, pipelines, transformations and runs; fetch a specific run and *its logs*; browse the data catalog.

That last one changes the texture of debugging. "Why did last night's sync fail?" stops being a tab-switching expedition and becomes a question you ask in the same window where you're already working. The agent pulls the run, reads the logs, cross-references the connection config, and tells you the credential expired.

## Read-only by default, and why that matters

The 8 write tools — create a connection, create a model, trigger a run — refuse to execute unless you have deliberately enabled them. How deliberate depends on which path you took:

**Over the hosted endpoint, write access is granted at authorization time.** When a client asks for write scopes, you approve them in the browser once, and the key that approval mints carries exactly those scopes. A client that asks for nothing gets read-only — silence is never read as consent to write — and a pasted API key stays read-only on that endpoint even if its own scopes would allow writes.

**Locally, writes are an explicit opt-in:**

```bash
uvx datanika-mcp --allow-write
```

Either way the default is read-only, and enabling writes is a decision someone has to make on purpose rather than a setting that drifts on.

This is not security theatre, but it is also not the whole story, so here is the honest version. Authentication is the real ceiling: the server can't reach another organization or escalate its own scope, `query_connection` is `SELECT`-only enforced server-side, and everything an agent does lands in your [audit log](/docs/audit-log). The read-only default just means the *common* case — "help me understand why this pipeline is broken" — needs no write access at all, so you shouldn't grant it.

If you use the local path, use a dedicated API key for agent access rather than reusing one from CI. If an agent does something surprising, you revoke one key instead of untangling which automation broke. Over the hosted path there's no key to manage: consent mints one for you and revoking the grant is the off switch.

## What the agent leaves behind

There's a reason we shipped this as tools over dbt and dlt rather than as a natural-language pipeline builder with its own format.

An agent with write access can produce a great deal of work very quickly. If that work lands in a proprietary transformation format, the speed is a liability: you've automated the creation of something only one vendor can run. What `create_transformation` writes here is a dbt model — SQL with `ref()` and `source()`, testable, versionable, and runnable by plain `dbt run` on a machine that has never heard of Datanika.

We wrote about that trade-off in more detail on the [AI agents page](/ai-agents#portability). It's the reason the MCP server is deliberately thin: it forwards to the REST API, which orchestrates dlt and dbt-core. There is no clever middle layer accumulating state you can't take with you.

## Setting it up

If your client supports remote MCP servers, there is nothing to set up beyond pasting `https://app.datanika.io/mcp` and approving the consent screen. Everything below is the local path.

Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "datanika": {
      "command": "uvx",
      "args": [
        "datanika-mcp",
        "--url", "https://app.datanika.io",
        "--api-key", "etf_your_key_here"
      ]
    }
  }
}
```

Claude Code is one command:

```bash
claude mcp add datanika -- uvx datanika-mcp --api-key etf_your_key_here
```

Cursor reads `~/.cursor/mcp.json` and takes the same shape, or environment variables if you prefer. Self-hosting? Point `--url` at whatever origin serves `/api/v1` — with the default Docker Compose setup that's `http://localhost:8000`.

Get an API key from **Settings → API Keys**, then see the [full guide](/docs/mcp-server/) for the per-client details, the complete tool table, and troubleshooting.

## Where this fits

The MCP server joins the `/llms.txt` discovery document and the [agent guide](/docs/ai-agents) rather than replacing them. If you're driving Datanika from a script, a CI job, or your own agent framework, the REST API is still the direct path and the discovery documents still tell an LLM everything it needs. MCP is for the case where your agent already lives in a client that speaks it — which, increasingly, it does.

The server is open source under AGPL-3.0, in the [`datanika-mcp/`](https://github.com/datanika-io/datanika-core/tree/master/datanika-mcp) directory of the core repo. Issues and PRs welcome.

---

*Datanika is an open-source data pipeline platform built on dlt and dbt-core. [Start free](https://app.datanika.io/) with 10 GB/month, or [self-host it](/docs/self-hosting/).*
