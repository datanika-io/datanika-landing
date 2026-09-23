---
title: "Snowflake, Redshift, Databricks: Loading Into a Warehouse Is Not the Same as Transforming Inside It"
description: "Datanika loads into more destinations than it can build dbt models in. Snowflake and Redshift are both; Databricks and Synapse are load-only. Here is why the two lists differ, and how to check which one your warehouse is on before you commit to a stack."
date: 2026-10-08
publishedAt: 2026-10-08
author: "Datanika Team"
category: "product"
tags: ["product", "snowflake", "redshift", "databricks", "synapse", "dbt"]
---

When you evaluate an ELT tool against your warehouse, you are really asking two questions, and it is easy to ask only one of them.

1. **Can it land data here?** That is the load layer — the machinery that writes rows into the target.
2. **Can it build models here?** That is the transform layer — dbt, running against the same warehouse.

Most tools answer these with one list, because most tools only do one of them. Datanika does both, which means we have two lists, and **they are not the same list**. This post is about the gap between them, because it is the kind of thing that is cheap to know in week one and expensive to discover in month three.

## Two layers, two requirements

Loading into a warehouse needs a working write path: a driver, credentials, and a dialect the loader knows how to generate DDL for. Building models in it needs something else entirely — **an installed dbt adapter**. Those are separate pieces of software with separate support matrices, and there is no reason in principle for them to cover the same set of systems.

In practice they mostly do. **Snowflake and Redshift are on both lists**: you can load into them, and you can point transformations and pipelines at them. So are PostgreSQL, BigQuery, ClickHouse, DuckDB and SQL Server.

**Databricks and Synapse are on the load list only.** An upload will write data into them. A transformation cannot target them — there is no adapter behind that half.

And some connectors are on neither, because they are extract sources: MySQL and SQLite read out, and do not receive.

The current list is rendered on [the transformations docs page](/docs/transformations), under *Destinations dbt can build in*, and it is derived from the catalogue rather than typed into the page. That is deliberate, and it is the list to trust. **Read on 2026-09-23, the two destinations that diverge are Databricks and Synapse** — but that is a reading with a date on it, and this post is a snapshot where that page is not. If you are making a decision on this, read it there.

## What it means if your warehouse is load-only

It is not a dead end, and it is worth saying what it actually looks like rather than leaving you to guess.

Data lands normally. Uploads run, schedules fire, tables appear, schema evolution works. What you do not get is Datanika's transformation layer running *inside* that warehouse — no models, no compiled SQL preview, no dbt packages managed through the UI against that target.

So the realistic shapes are:

- **Transform somewhere else, then load.** Put the modelling in a warehouse that is on both lists and load the results onward.
- **Run dbt yourself against that warehouse.** Datanika does the extract and load; your existing dbt setup owns the transform. This is a perfectly ordinary arrangement and it is the one we would suggest for a Databricks shop today.
- **Use it as a landing zone.** Plenty of teams want raw tables in the lakehouse and do their modelling in the query engine anyway.

What we will not do is imply that a transformation will run there and let you find out on the first pipeline.

## Why we publish the difference instead of one number

The tempting version of this page is a single "destinations" count, which would be larger and would read better. We do not publish it that way for a specific reason: those two lists have drifted before, in the direction that flatters us.

Our own architecture documentation asserted for months that the dbt layer ran against the same set of destinations the loader writes to. That was already wrong for three of them at the time it was written. Nothing was red, no build failed, and nobody was lying — the claim was simply never bound to the thing that decides it, so it stayed plausible while reality moved underneath.

The fix was structural rather than editorial. The transform list is now a named set in the catalogue with a comment explaining that it must not be derived from the load direction, a test that holds the two apart, and one page that owns rendering it. If somebody adds a destination without an adapter, the lists diverge in the data and not in the prose.

That is also why this post sends you to the page rather than quoting the list as gospel. A number in a blog post ages; a derived list on a page that a test guards does not age the same way.

## Checking before you commit

If you are sizing up Datanika against a specific warehouse, three things settle it quickly:

- Open [the transformations docs page](/docs/transformations) and look for your warehouse under *Destinations dbt can build in*. Present means both layers; absent means load-only or source-only.
- Read the connector page for the load-side detail — [Snowflake](/docs/connectors/snowflake), [Redshift](/docs/connectors/redshift), [Databricks](/docs/connectors/databricks) each carry their own setup guide and field reference.
- If you are bringing existing dbt models, check the materialization strategies you actually use. We have written about [how an incremental model with a null unique key silently duplicates rows](/blog/dbt-incremental-duplicates-null-unique-key/), which is a warehouse-independent trap worth knowing before you migrate anything.

Being on one list rather than two is a real limitation, and it is the kind we would rather state plainly than discover for you. It is the same instinct behind saying that [a SQL Server session is encrypted but the certificate is not verified](/blog/sql-server-synapse-encrypted-not-verified/): the useful version of a capability claim is the one that tells you where its edge is.

## Related

- [Transformations docs](/docs/transformations) — the live list of destinations dbt can build in
- [Snowflake setup guide](/docs/connectors/snowflake) · [Redshift setup guide](/docs/connectors/redshift) · [Databricks setup guide](/docs/connectors/databricks)
- [Transformations guide](/docs/transformations-guide) — materializations, packages and compiled SQL preview
