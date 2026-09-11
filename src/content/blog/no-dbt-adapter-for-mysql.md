---
title: "There Is No Maintained dbt Adapter for MySQL. Here Is What That Means for Your Pipeline"
description: "If your operational data lives in MySQL and you want to model it with dbt, the answer is not a plugin — it is an architecture. MySQL is an extraction source; the transformation happens in the warehouse you land it in."
date: 2026-10-09
publishedAt: 2026-10-09
author: "Datanika Team"
category: "tutorial"
tags: ["mysql", "dbt", "elt", "data-engineering", "warehouse"]
---

You have an application database in MySQL. You want to model it — staging tables, tests, incremental facts, the usual dbt shape. So you go looking for `dbt-mysql`.

You will find one. It was last released in **April 2024**, and it pins **dbt-core 1.7**.

That pin is the whole story, and it is worth understanding before you decide anything else.

## What a version pin on your transformation layer costs

An adapter that pins an old `dbt-core` does not just deny you new dbt features. It **holds the floor down for everything that shares the environment.** `dbt-core` pulls in a substantial dependency tree, and pinning it to a 2023-era minor version pins large parts of that tree with it. Security updates elsewhere in your stack start colliding with the pin, and the usual resolution is to stop upgrading.

So the cost is not "we are on an older dbt". The cost is that one adapter, for one database you did not especially need to transform in, becomes the constraint on your whole transformation environment.

We looked at shipping it anyway. We decided not to, and we say so on the [MySQL connector page](/connectors/mysql) rather than leaving people to find out at the first run.

## MySQL is a source, and that is not a consolation prize

The instinct when a tool cannot transform in place is to treat it as a gap. It is worth pushing back on that.

Your MySQL instance is serving an application. It is sized for transactional reads and writes, its indexes are tuned for the queries your product makes, and the last thing it needs is a nightly wave of analytical scans building wide aggregate tables next to production traffic. **Transforming in your operational database is usually the wrong idea even when the tooling supports it.**

The shape that works is the one ELT was named for:

1. **Extract** from MySQL — full tables, or incrementally on a monotonic column.
2. **Load** into a warehouse, raw and untransformed.
3. **Transform** there, with dbt, where the compute is separate from the database your customers are hitting.

Step 3 is where your dbt project lives, and the adapter question moves to the warehouse — which is a much better place for it, because that is where the maintained adapters are.

## Where you can actually run dbt

These are all dbt transformation targets, and all of them are destinations you can land MySQL data into:

**PostgreSQL · SQL Server · ClickHouse · DuckDB · BigQuery · Snowflake · Redshift**

That list covers most of the reasonable answers. If you already have a warehouse, you almost certainly have one of these. If you do not, DuckDB is a genuinely serious option for small-to-mid volumes and costs nothing to try; [Snowflake](/connectors/snowflake) and BigQuery are the usual answers once concurrency matters.

The pattern is identical whichever you pick, and we walked through it end to end for a different source in [PostgreSQL to BigQuery](/blog/postgresql-to-bigquery/) — the extraction side changes, the modelling side does not.

## One thing our own tool will not do

Symmetry demands this bit.

**MySQL is not a destination in Datanika either.** You can extract from it; you cannot load into it. The underlying extraction library has never had a MySQL destination, so an upload configured to target MySQL does not degrade gracefully — it fails with an unhandled error rather than a clean message saying the combination is unsupported.

That is our defect, not the user's, and it is tracked. We mention it here for the same reason it is on the connector page: if you were planning MySQL → MySQL replication, you should find that out from a blog post rather than from a stack trace.

## The short version

- There is no maintained dbt adapter for MySQL, and the unmaintained one pins your transformation environment to 2023.
- That is not the blocker it first appears, because **transforming inside your operational database was already the wrong architecture.**
- Extract from MySQL, land in a warehouse, run dbt there. The [MySQL setup guide](/docs/connectors/mysql) covers the extraction half.
- If you specifically need MySQL as a *target*, we do not support that and neither does the layer underneath us.

---

*Datanika is an open-source data platform — extraction, loading, transformation and scheduling in one place. Every connector page lists what the connector cannot do, next to what it can.*
