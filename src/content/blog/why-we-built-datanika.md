---
title: "Why We Built Datanika: One Tool Instead of Five"
description: "The modern data stack asks a two-person team to run five tools to move one table. Here's the case for collapsing ingestion, transformation, orchestration, and observability into a single platform — and what that trade-off costs."
date: 2026-07-30
publishedAt: 2026-07-30
author: "Datanika Team"
category: "company"
tags: ["origin-story", "modern-data-stack", "elt", "dbt", "dlt"]
---

Ask someone what it takes to get a Postgres table into a warehouse and put a chart on top of it. The honest answer, for most teams in 2026, is five tools.

One to move the data. One to transform it. One to schedule the transformations. One to hold the credentials and glue. One to tell you when it broke. Five vendors, five bills, five sets of documentation, five places to look when a number is wrong on Monday morning.

Each of those tools is good. That's the frustrating part. The problem was never any individual piece — it was the seams between them.

## The seams are the work

Here is what nobody puts on a pricing page: the integration is the job.

Your ingestion tool lands a table in `raw`. Your transformation tool needs to know it arrived, and how fresh it is. Your orchestrator needs to know that the transform depends on the load, which means it needs to reach into both. Your alerting needs to distinguish "the load failed" from "the load succeeded but produced zero rows" from "the transform ran on yesterday's data" — three very different pages at 3am, and none of the tools involved can see the whole picture.

So you write glue. A little Airflow DAG that pokes the ingestion API. A sensor that waits on a table. A Slack webhook with some `if` statements. None of it is hard. All of it is yours to maintain forever, and none of it is the thing you were actually hired to do.

For a data team of twelve with a platform engineer, that's an acceptable cost — it buys best-of-breed at every layer, and at real scale that matters.

For a team of two, it's most of the job.

## What we actually wanted

Datanika started from a narrow, unglamorous question: what would it take for one person to run a real pipeline — sources, transforms, schedules, monitoring — without becoming a full-time integrator?

Not a toy. Real credentials, real incremental loads, real dbt models with tests, real retries, real multi-tenancy. Just without the five-way integration tax.

The answer turned out to be: use the good open-source pieces, but own the seams.

- **[dlt](https://dlthub.com) for extract and load.** We didn't write our own extractors. dlt already handles schema evolution, incremental state, and normalization better than anything we'd build.
- **[dbt-core](https://www.getdbt.com) for transforms.** Not a dbt-like DSL. Actual dbt, with `ref()`, tests, snapshots, and packages — so your models are portable and your team already knows the tool.
- **Celery and APScheduler for orchestration.** Boring, proven, and — crucially — aware of both the loads and the transforms, because they live in the same system.
- **One UI over all of it**, so a run's lineage from source to model is a thing you can look at rather than reconstruct.

The insight isn't that any of these are novel. It's that when one system owns ingestion *and* transformation *and* scheduling, the dependency between them stops being integration code you write and starts being a property of the platform. A transform that depends on a load is a dropdown, not a sensor.

## What it looks like in practice

A pipeline that would be four tools and a hundred lines of glue becomes: add a source connection, add a destination, pick tables, write a model, set a schedule. There are [36 connectors](/connectors) — all 36 work as sources and 11 of them also work as destinations — and every one of them is available on every plan, including the free one. We gate on volume, not on capability, because a connector you can't use is not a feature.

When something breaks, the run history shows which step failed, with logs, in the same place you configured it. When a model is wrong, you compile it before you run it, against the warehouse, and see the SQL dbt actually generated.

## The honest trade-off

An all-in-one platform is not free of cost, and pretending otherwise would be exactly the kind of marketing we find irritating in everyone else.

**You get less depth per layer.** Fivetran has more connectors than we do — several hundred more. If your business depends on a long-tail SaaS API we haven't built, best-of-breed wins, and we'll say so.

**You're consolidating risk.** Five tools means five things that can fail independently; one tool means one thing whose failure takes everything. Our answer to that is the open-source core: the platform is AGPL and [self-hostable](/docs/self-hosting), so "the vendor disappears" is a recoverable event rather than an extinction one. That's also why the [billing plugin is a separate, optional layer](/blog/open-core-plugin) rather than something woven through the core.

**Opinionated defaults are only good if you share the opinions.** We chose dlt and dbt. If your transformation layer is Spark or SQLMesh, we are the wrong tool, and no amount of UI will fix that.

The bet is that for most teams below a certain size — and that's a *lot* of teams — the depth they lose is worth less than the seams they stop maintaining. We wrote out the arithmetic in [The Real Cost of Your Modern Data Stack](/blog/real-cost-modern-data-stack) and put it side by side with the alternatives in [Datanika vs the Modern Data Stack](/blog/datanika-vs-modern-data-stack).

## Why the pricing works this way

The same instinct shaped how we charge. Per-row and per-connector pricing punishes you for the shape of your schema — a wide table costs more than a narrow one for the same information. We bill for **gigabytes processed**: 10 GB free, then a published per-GB rate with no per-seat or per-connector multipliers. The reasoning, including where it makes us *more* expensive than the alternatives, is in [the pricing post](/blog/pricing-v2-math-and-why) and the [cost comparison](/why-cheaper).

## Where this goes

The platform is open source, the core is AGPL, and it runs on your infrastructure if you want it to. The hosted version exists because most people don't want to operate Postgres, Redis, and a Celery worker to move a table — not because we're holding features hostage.

If you've been maintaining glue between five tools and quietly wondering whether that's just what the job is: it isn't.

[Start free](https://app.datanika.io/) with 10 GB/month, or read [how it's put together](/docs/architecture) first.
