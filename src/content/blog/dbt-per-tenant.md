---
title: "dbt Was Not Designed for Multi-Tenant SaaS. Here's How I Made It Work."
description: "dbt expects one project, one profiles.yml, one models/ dir. I run it across hundreds of tenant directories — here's the architecture, the scars, and the target/ cleanup loop."
date: 2026-04-10
author: "Datanika Team"
category: "engineering"
tags: ["dbt", "multi-tenancy", "architecture", "engineering"]
heroImage: "/logo.png"
---

dbt wants a project directory on disk. One `dbt_project.yml`. One `profiles.yml`. Files in `models/`. This works great for a single team. It doesn't work at all when you have hundreds of tenants.

In [Datanika](https://datanika.io), every organization gets its own dbt project at `dbt_projects/tenant_{org_id}/`. When a user creates a transformation in the UI, the backend writes a `.sql` file to their tenant's directory. When they run it, we invoke dbt against that directory with the tenant's own `profiles.yml` — generated on the fly from their destination credentials.

If you want the broader multi-tenancy context (why Datanika uses a shared `public` schema in Postgres but per-tenant directories for dbt), I wrote a separate post on [how I designed multi-tenancy wrong and then fixed it](/blog/multitenancy-mistake). This post is the dbt-specific follow-up.

## The Directory Layout

Every tenant gets a directory that looks like a stock dbt project:

```
dbt_projects/
├── tenant_1/
│   ├── dbt_project.yml
│   ├── profiles.yml
│   ├── models/
│   │   ├── stg_orders.sql
│   │   └── stg_orders.yml
│   ├── macros/
│   ├── tests/
│   ├── snapshots/
│   └── target/        ← ephemeral, cleaned on every run
├── tenant_2/
│   └── ...
└── tenant_N/
    └── ...
```

`ensure_project(org_id)` creates the skeleton on demand. The profile name is `tenant_{org_id}` — dbt's `profiles.yml` lookup key. That's how we keep profiles isolated even though multiple tenants can share the same destination type (e.g. both tenant 1 and tenant 2 load into BigQuery, but with different service account keys).

## Problem 1: target/ Fills Up the Disk

dbt leaves `target/` directories full of compiled SQL and run artifacts. With many tenants, disk usage grows fast. A single tenant's `target/` is small, but 100 tenants × repeated runs = gigabytes of stale compiled SQL you'll never look at.

**Fix, part one:** `clean_target(org_id)` before every pipeline and transformation run. No historical build artifacts survive past the next execution.

**Fix, part two:** an hourly Celery Beat task (`cleanup_dbt_targets`) that sweeps orphaned `target/` directories older than **48 hours**. If a tenant runs nothing for 48 hours, their `target/` is fair game for deletion — the next run will rebuild it.

Together, these two loops keep disk usage predictable even as tenant count grows.

## Problem 2: schema.yml Gets Duplicate Entries

Originally, I generated one `schema.yml` per dbt project listing every model. It worked until users started moving models between schemas — the file kept accumulating duplicate entries as models were deleted and re-added, and dbt would throw cryptic parse errors.

**Fix:** per-model YML files instead of one big shared file. Every `stg_orders.sql` gets a sibling `stg_orders.yml` with its own schema + tests declaration. Move a model? The YML moves with it. Delete a model? The YML goes too.

```
models/
├── stg_orders.sql
├── stg_orders.yml        ← only describes stg_orders
├── mart_revenue.sql
└── mart_revenue.yml
```

Less clever, far more robust.

## Problem 3: The SQL Editor Needs Macro Resolution

Datanika's [SQL editor](/docs/transformations-guide) has autocomplete for `ref()` and `source()` macros — when you type `{{ ref(`, it should suggest the tenant's existing models. That means parsing the tenant's dbt project to know which models and sources exist *right now*.

`dbt compile` handles this correctly, but it's slow — 500ms to a few seconds depending on project size. Unacceptable for an autocomplete dropdown.

**Fix:** cache the model/source catalog per tenant, refresh after every run. The cache lives in Redis (keyed by `org_id`) and is invalidated on pipeline success. Autocomplete reads from cache, which is microseconds. The only lag is right after a run — and by then, the user isn't typing, they're looking at results.

## Problem 4: Everything Else Has to Be Per-Tenant Too

Once the directory pattern is in place, every dbt feature needs to be wired through the same tenant path:

- **Snapshots** (SCD Type 2) — stored in `tenant_{org_id}/snapshots/`, run with `dbt snapshot` against the tenant's profile
- **Packages** (`dbt deps`) — each tenant has its own `packages.yml` and `dbt_packages/` folder. Installing `dbt_utils` is a per-tenant operation, not a global one
- **Source freshness** — `tenant_{org_id}/models/sources.yml` lists their sources with freshness thresholds; `dbt source freshness` runs per-tenant
- **Tests** — generic tests (`unique`, `not_null`, `accepted_values`, `relationships`) live in the same per-model YML; singular tests go in `tenant_{org_id}/tests/`

Each feature required wiring through the same tenant directory pattern. None were conceptually hard. All were fiddly.

## What This Costs

The dbt integration is easily the part of the Datanika codebase with the most "I wish dbt had a proper API for this" comments. dbt's CLI-first design assumes one project per process. Running N projects in the same Python process means managing:

- Working-directory changes (dbt inspects `$PWD` aggressively)
- Logging output capture per invocation
- `target/` cleanup between runs so stale artifacts don't leak
- Profile isolation so tenant A's credentials never resolve to tenant B's warehouse

You can [see the result](/docs/transformations-guide) in the UI — SQL editor, tests, snapshots, packages, freshness, all per-tenant. It works. It's not elegant under the hood, but it's contained in a single `DbtProjectService` and the rest of the codebase doesn't have to care.

## The Lesson

dbt is a brilliant tool for single-tenant data teams. For multi-tenant SaaS, you have to build the tenancy layer yourself — and the right architecture is filesystem-per-tenant plus aggressive `target/` cleanup, not something clever at the Python level.

If I were starting today, I'd still use dbt-core. The alternative is rebuilding macro resolution, ref graph tracking, incremental materializations, and SCD Type 2 snapshots — all of which dbt has solved. The wrapper code is annoying, but it's once-only work.

Anyone else running dbt in a multi-tenant setup? Open an [issue on GitHub](https://github.com/datanika-io/datanika-core/issues) — I'd love to compare notes.

## Related

- [Architecture overview](/docs/architecture) — how the pieces fit together
- [Transformation Guide](/docs/transformations-guide) — writing dbt models in the UI
- [Multi-tenancy mistake](/blog/multitenancy-mistake) — the Postgres side of the same problem
- [32 connectors, most took less than a day](/blog/32-connectors-most-took-a-day) — the other place where dlt and dbt's ecosystems paid off
- [Star on GitHub](https://github.com/datanika-io/datanika-core)
