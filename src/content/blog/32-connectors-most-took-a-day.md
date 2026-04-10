---
title: "I Added 32 Connectors to My Data Platform. Most Took Less Than a Day Each."
description: "How dlt's plugin architecture made adding 32 data connectors mostly a config exercise — and why picking extensible tools matters more than writing extraction code."
date: 2026-04-10
updatedDate: 2026-04-10
author: "Datanika Team"
category: "engineering"
tags: ["engineering", "connectors", "dlt", "open-source"]
heroImage: "/logo.png"
---

When I started, [Datanika](https://datanika.io) had 4 database connectors. Now it has 32: 27 sources, 11 destinations, and 11 dbt adapters. The secret is that I'm not writing connectors from scratch.

## The Architecture

For databases (Postgres, MySQL, MSSQL, ClickHouse, DuckDB, MongoDB), there's a [dlt](https://dlthub.com) source adapter per type. Each one maps connection credentials to dlt's config format and handles type-specific quirks. The actual extraction is dlt's job — I'm just wiring up the UI and storing config in the database.

For SaaS sources ([Stripe](/connectors/stripe), [GitHub](/connectors/github), [HubSpot](/connectors/hubspot), [Salesforce](/connectors/salesforce), [Shopify](/connectors/shopify), [Jira](/connectors/jira), [Slack](/connectors/slack), Google Analytics, Facebook Ads, and more), I use dlt's REST API source or its verified sources. Each connector is really just a config: base URL, auth method, and a list of default endpoints. Stripe, for example, ships with 6 endpoints pre-configured (customers, charges, invoices, subscriptions, products, prices).

For destinations ([BigQuery](/connectors/bigquery), [Snowflake](/connectors/snowflake), [Redshift](/connectors/redshift), [Databricks](/connectors/databricks), Azure Synapse, ClickHouse, DuckDB), it's dlt destination objects plus matching dbt adapters.

## The Hard Ones

The hardest connectors weren't the obvious ones. Two stand out:

- **ClickHouse** has three different table engine modes — standalone MergeTree, clustered ReplicatedMergeTree, and ClickHouse Cloud. Each requires different DDL and a different mental model for replication.
- **MongoDB** needed a custom dlt source because the standard one didn't handle nested documents the way I wanted. Flattening nested arrays into relational tables for analytics is more opinionated than it sounds.

Everything else was mostly: read the API docs, fill in the dlt config schema, write 5–10 tests, ship it.

## Phased Rollout

I rolled the SaaS connectors out in three phases over two days, not all at once:

- **Phase A**: 4 connectors (the highest-demand ones)
- **Phase B**: 7 more
- **Phase C**: 7 more

Each phase was a single commit with tests. This kept reviewable diffs small and let me catch architecture issues early. If phase A broke something subtle in the connection model, phase B would have surfaced it before I shipped 14 more connectors on top.

## The Lesson

Pick tools that are themselves extensible. dlt's plugin architecture meant "add a connector" was mostly config, not code. If I'd built extraction from scratch, I'd still be on connector #4.

This is also why Datanika uses [dbt-core](https://www.getdbt.com) for transformations rather than rolling our own SQL execution engine. The ecosystem has solved problems I don't need to re-solve — packages, tests, snapshots, materializations, lineage. Building on it gives users 100% dbt compatibility for free.

## What's Next

I'm thinking about adding Webhooks (push-based ingestion) and a generic "S3-compatible" source that works with R2, MinIO, Backblaze, etc. — anything that speaks the S3 API.

What connectors would *you* want to see next? Open an [issue on GitHub](https://github.com/datanika-io/datanika-core/issues) or try the existing 32 at [datanika.io/connectors](/connectors).

## Try It

- [View all 32 connectors](/connectors)
- [PostgreSQL → BigQuery in 5 minutes](/blog/postgresql-to-bigquery)
- [Self-host with Docker](/docs/self-hosting)
- [Star on GitHub](https://github.com/datanika-io/datanika-core)
