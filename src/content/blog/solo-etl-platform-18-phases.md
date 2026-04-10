---
title: "I Built an ETL Platform Solo. 18 Phases, 1,400+ Tests, One Month."
description: "How strict TDD, layered architecture, and a 45-step plan with hard scope boundaries let one person ship a multi-tenant ETL platform from scratch in a month."
date: 2026-04-10
updatedDate: 2026-04-10
author: "Datanika Team"
category: "engineering"
tags: ["engineering", "tdd", "open-source", "build-in-public"]
heroImage: "/logo.png"
---

Most ETL tools are built by teams of 20+. I built one by myself in about a month.

I'm building [Datanika](https://datanika.io) — a platform for managing data pipelines. Extract with [dlt](https://dlthub.com), transform with [dbt-core](https://www.getdbt.com), orchestrate with Celery and APScheduler, all wrapped in a Python UI using [Reflex](https://reflex.dev).

## Scope, Not Speed

The key decision was to *not* build everything at once. I broke the entire project into 18 phases, each small enough to finish in 1–3 days:

- **Phase 1**: Models and auth
- **Phase 2**: Connections and pipeline config
- **Phase 3**: dbt integration
- **Phase 4**: Scheduling and dependency DAGs
- **Phase 5**: Polish, dashboard, RBAC
- ... and so on

Each phase had a clear deliverable and a short feedback loop. If I couldn't finish a phase in three days, the scope was wrong, not the timeline.

## TDD Without Compromises

Each phase followed strict TDD: failing test first, then implementation, then commit. No exceptions. Even when the feature was "obviously going to work."

That discipline is the only reason I didn't drown in regressions. By the end, I had **1,424 tests** across 73 test files — covering models, services, tasks, security, end-to-end flows, and even multi-tenant isolation. (Plus 73 dedicated security tests for SQL injection, XSS, path traversal, auth attacks, and tenant boundary checks.)

The tests run in under a minute on SQLite. CI catches regressions before they reach a PR review.

## Layered Architecture Saves You

The hardest part wasn't any single feature. It was keeping the architecture clean enough that phase 18 didn't break phase 1.

Layered architecture helped — every change had to fit one of these layers:

| Layer | Responsibility | Rule |
|-------|---------------|------|
| `models/` | ORM definitions | No business logic |
| `services/` | Business logic | All state changes happen here |
| `tasks/` | Celery wrappers | Thin shells around services |
| `ui/state/` | Reactive state classes | Calls services and tasks |
| `ui/pages/` | Reflex page functions | Returns components, no logic |

Strict boundaries meant I could add features in phase 18 without rewriting foundations from phase 1. Need to add a new pipeline type? Add a model, a service method, a task wrapper, a state action. Done.

I write more about why I picked a [public schema with `org_id` filtering](/blog/multitenancy-mistake) over the textbook schema-per-tenant approach in another post.

## The Open-Core Plugin System

One non-obvious win: the [hooks system](/docs/architecture). Core emits events like `connection.before_create` and `run.upload_completed`. The cloud plugin (billing, quotas, metering) subscribes to those events. Core never imports the plugin — the plugin only loads when `DATANIKA_EDITION=cloud` is set.

This means the open-source core has zero billing code. It's not crippled — it's just *complete without billing*. Self-hosted users get every feature except the Paddle integration, which they don't need anyway.

## What I Learned

**Scope control matters more than speed.** A 45-step plan with clear boundaries beats "let me just build the whole thing." Most solo projects fail at scope — they either expand until burnout or never ship anything that works end-to-end.

**Pick boring tools.** Postgres, Celery, Redis, dlt, dbt-core — none of these are exciting in 2026. All of them work. I'd rather spend my creativity on the product than on figuring out which obscure framework to bet on.

**Tests as a forcing function.** TDD isn't about test coverage. It's about being forced to articulate what "done" means before you write the code. That alone catches 80% of design mistakes.

## See For Yourself

- [Architecture overview](/docs/architecture)
- [Self-host with Docker](/docs/self-hosting)
- [32 connectors](/connectors)
- [Star on GitHub](https://github.com/datanika-io/datanika-core)
- [Try the cloud version free](https://app.datanika.io)

Building this in public. Feedback welcome — open an [issue on GitHub](https://github.com/datanika-io/datanika-core/issues).
