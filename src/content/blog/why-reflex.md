---
title: "I Wrote a Full SaaS UI Without a Single Line of JavaScript"
description: "Why I chose Reflex for the entire Datanika UI — pipeline builder, SQL editor, DAG viewer, billing, everything. Pure Python, one repo, one solo developer."
date: 2026-04-10
author: "Datanika Team"
category: "engineering"
tags: ["reflex", "python", "full-stack", "engineering", "build-in-public"]
heroImage: "/logo.png"
---

No React. No TypeScript. No separate frontend repo. Just Python.

I'm building [Datanika](https://datanika.io) — a data pipeline platform — and chose [Reflex](https://reflex.dev) for the entire UI. Reflex compiles Python to React under the hood. You write state classes and component functions in Python, and it handles the rest.

## Why Reflex

I'm a solo developer. Maintaining two codebases (Python backend + JavaScript frontend) would have killed the project before it shipped. Every feature would need API contracts, type duplication, a separate dependency tree, and a separate CI pipeline. For a single person shipping [18 phases in a month](/blog/solo-etl-platform-18-phases), that's not scope control — that's guaranteed failure.

With Reflex, my pipeline service, my UI state, and my page components all share the same language, the same types, the same imports. Need to show a list of connections on the frontend? The state class calls the service class directly. No fetch, no JSON parsing, no zod schema:

```python
class ConnectionState(BaseState):
    connections: list[dict] = []

    async def load(self):
        async with AsyncSessionLocal() as session:
            self.connections = await ConnectionService.list(session, org_id=self.current_org_id)
```

The service returns Python objects, the state holds them, the page renders them. One mental model, one type system, one debugger.

## It's Not Perfect

I'm not going to pretend Reflex is flawless. It isn't. A few things bit me:

**Reflex 0.8.x uses Starlette internally, not FastAPI.** Custom API routes can't use FastAPI decorators — you have to build `starlette.routing.Route` objects and append them to `app._api.routes`. This bit me when wiring up OAuth callbacks for Google and GitHub sign-in, and again when adding the Paddle webhook endpoint. It's not hard, but it's not documented anywhere prominently either. I wrote it down in my [architecture doc](/docs/architecture) so I'd never have to re-discover it.

**The WebSocket event system has quirks.** Reflex uses WebSockets to sync state between the Python backend and the React frontend. Most of the time it just works. Occasionally you hit an edge case where a state update doesn't propagate, and the fix is adding a `yield` in an async handler that doesn't obviously need one. I learned to treat "the button didn't update" as "missing yield" before any other hypothesis.

**Wrapping React components is possible but the docs are thin.** When you need something Reflex doesn't ship natively — a cron expression picker, a DAG/graph visualizer, a Monaco SQL editor — you wrap a React component in Python. It works. The wrapper pattern is clean. But the docs are thin, so I learned it by reading Reflex's own source code for the components they do ship.

**Hot reload is sometimes confused.** Reflex's dev server watches Python files and recompiles. When you touch `content.config.ts` or similar, the recompile sometimes picks up stale state. `Ctrl+C`, restart, done. Rare but annoying.

## What I Got in Return

The tradeoff was worth it. I built the following, all in Python, in one repo, by myself:

- Login, signup, social OAuth (Google + GitHub)
- SAML + OIDC SSO for Enterprise
- Pipeline builder with connection picker and load modes
- Full-screen SQL editor with autocomplete and dbt macro resolution
- DAG visualizer for pipeline dependencies
- Drag-and-drop CSV / JSON / Parquet file uploads
- Multi-org with RBAC (owner/admin/editor/viewer)
- Billing settings page with Paddle overlay checkout
- Notification channels config (Slack, Telegram, email, webhook)
- 9-language i18n with runtime switching
- [Data catalog](/docs/architecture) browsing all tables and models
- API keys management page

Every one of those would have needed a separate React component, a state-management integration, a TypeScript type, and a test setup if I'd used a split-stack architecture. Instead they're Python functions calling Python services calling Python models.

## The Layered Architecture Payoff

Because everything is Python, the layered architecture I set up in phase 1 extends all the way to the UI:

```
models/      → ORM, no logic
services/    → business logic, all state changes
tasks/       → Celery wrappers around services
ui/state/    → Reflex state classes, call services and tasks
ui/pages/    → functions returning rx.Component, no logic
```

Each layer imports the one below it. Reflex pages import state classes, which import services, which import models. No layer skips down. No layer imports up. When I add a new feature, I add one thing to each layer, in order.

This is the same layering I described in the [multi-tenancy mistake post](/blog/multitenancy-mistake) — and it's the same one that made the [dbt-per-tenant complexity](/blog/dbt-per-tenant) containable. Put the gnarly stuff in a service, expose it through a clean interface, and the layer above it doesn't have to care.

## When Reflex Fits — and When It Doesn't

Reflex isn't the right answer for every app. I wouldn't use it for:

- **Public marketing sites** — you want Astro, Next.js, or similar. This blog is built with Astro, not Reflex, precisely because it's static content.
- **Consumer apps with heavy client-side state** — games, editors, real-time collab tools. Reflex can do it, but you're fighting the framework.
- **Apps where the frontend team is separate from the backend team** — the whole point of a unified stack is that the same person owns both. If you have a dedicated React team, give them React.

But for **internal tools, B2B SaaS, admin panels, data platforms**, Reflex is seriously underrated. These apps have:

- Forms and tables (Reflex strength)
- CRUD workflows (Reflex strength)
- Server-driven state (Reflex strength)
- Small frontend teams or no frontend team at all (Reflex strength)

If you're a backend developer building a SaaS and dreading the frontend, Reflex is worth a serious look.

## Try It

Everything I described above is open source under AGPL-3.0. You can clone the Datanika repo, run `docker compose up -d`, and see Reflex in production:

- [Self-host with Docker](/docs/self-hosting)
- [Architecture overview](/docs/architecture) — including the "Reflex 0.8.x uses Starlette" note buried in there
- [Star on GitHub](https://github.com/datanika-io/datanika-core)
- [Try the cloud version free](https://app.datanika.io) — same codebase

Curious what others think about Python-only full-stack. Has anyone else tried this for production SaaS? Open an [issue or discussion on GitHub](https://github.com/datanika-io/datanika-core/issues) — I'd love to compare notes.

## Related

- [I Built an ETL Platform Solo. 18 Phases, 1,400+ Tests, One Month.](/blog/solo-etl-platform-18-phases) — how the scope control worked
- [I Designed Multi-Tenancy Wrong](/blog/multitenancy-mistake) — where layered architecture started paying off
- [dbt Was Not Designed for Multi-Tenant SaaS](/blog/dbt-per-tenant) — same layering applied to dbt integration
