---
title: "I Designed Multi-Tenancy Wrong. Then I Fixed It Before It Mattered."
description: "Why I scrapped schema-per-tenant for a shared public schema with org_id filtering — and the architecture lesson about picking isolation models that match your query patterns."
date: 2026-04-10
author: "Datanika Team"
tags: ["architecture", "postgresql", "multi-tenancy", "engineering"]
heroImage: "/logo.png"
---

My original plan for [Datanika](https://datanika.io) was schema-per-tenant in PostgreSQL. Each organization gets its own schema. Clean isolation. Textbook approach.

Then I started implementing services and realized: **none of my SQLAlchemy queries set `search_path`**. Every service method would need schema-switching logic. Alembic migrations would need to run against every tenant schema. Testing would become painful.

So I scrapped it.

## What I Did Instead

I moved everything to the `public` schema with an `org_id` column on every table. Simple `WHERE` clause filtering. One migration path. One set of queries.

Every model inherits from `TenantMixin`:

```python
class TenantMixin:
    org_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("organizations.id"), nullable=False)
```

Every query is scoped through a session-level filter:

```python
async def get_connections(session, org_id: int) -> list[Connection]:
    result = await session.execute(
        select(Connection).where(Connection.org_id == org_id)
    )
    return list(result.scalars())
```

That's it. No schema switching, no `SET search_path`, no per-tenant migrations. Tenant isolation is enforced by application code, not by the database catalog.

## "But Schema-per-Tenant Is More Enterprise"

This felt like a downgrade at first. Schema-per-tenant sounds more "enterprise." Hosting providers love to talk about it. AWS RDS docs reference it. It's the "right" answer in academic database textbooks.

But for a SaaS where tenants share the same table structures, `org_id` filtering wins on every dimension that actually matters:

| Aspect | Schema-per-tenant | Shared schema + `org_id` |
|--------|-------------------|--------------------------|
| Migrations | Run N times (one per tenant) | Run once |
| Connection pooling | Expensive (per-schema warmup) | Cheap (shared pool) |
| Query plans | N copies (one per schema) | One copy, cached |
| Adding a new column | DDL on N schemas | DDL on 1 table |
| Testing | Need per-tenant test fixtures | One fixture, many `org_id` values |
| Cross-tenant analytics | Hard (UNION across schemas) | Trivial (`GROUP BY org_id`) |

The only thing schema-per-tenant gives you is *physical-level* isolation that protects against application bugs. But if your app has the kind of bug that lets one tenant query another tenant's data, the bug is in your security layer — and physical isolation is just papering over it. Better to test the security layer thoroughly. (I have [5 dedicated tenant isolation security tests](/docs/architecture#security) plus 73 total security tests.)

## Where Schema Isolation Still Makes Sense

I kept *one* thing from the original design: **per-tenant dbt project directories on disk** at `dbt_projects/tenant_{org_id}/`. dbt needs real files on disk, and a single dbt project can't cleanly handle multiple tenants' models, sources, and configs in one directory tree. So that isolation still makes sense — different problem, different solution.

The pattern I learned: pick the isolation model **per concern**, not per database.

- **App data with identical schemas**: shared table + tenant column
- **Per-tenant SQL files dbt needs to read**: filesystem-level isolation
- **Per-tenant secrets or keys**: encrypted column with rotation, not separate vaults

## Test Suite Bonus

The biggest unexpected win: my entire test suite runs on **in-memory SQLite** because there's no schema-switching to worry about. 1,400+ tests run in under a minute. CI is fast. Local development is fast. New engineers (well, future me) can run tests without spinning up a PostgreSQL container.

If I'd gone with schema-per-tenant, every test would need a real Postgres connection to set `search_path`. SQLite doesn't even support schemas the way Postgres does. The test suite would have been 5–10× slower.

## The Lesson

Pick the isolation model that matches your **actual query patterns**, not the one that looks best in an architecture diagram. For config tables with identical schemas across tenants, a shared table with a tenant column wins.

Pivots early in a project are cheap. Pivots after you've shipped to customers are expensive. If you're starting a multi-tenant project right now, write a few service methods first and *see how the queries look* before committing to a schema design.

Have you hit a similar architecture pivot early in a project? Reply on the [GitHub discussions](https://github.com/datanika-io/datanika-core/discussions) — I'm collecting war stories.

## Related

- [Architecture overview](/docs/architecture)
- [Self-host with Docker](/docs/self-hosting)
- [Why I built the whole thing solo](/blog/solo-etl-platform-18-phases)
- [Star on GitHub](https://github.com/datanika-io/datanika-core)
