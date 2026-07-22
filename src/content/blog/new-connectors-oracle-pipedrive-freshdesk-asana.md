---
title: "4 New Connectors: Oracle, Pipedrive, Freshdesk, and Asana"
description: "Datanika now connects to Oracle Database, Pipedrive, Freshdesk, and Asana — replicate enterprise SQL, CRM, support, and project data to your warehouse with dbt built in."
date: 2026-07-17
author: "Datanika Team"
category: "product"
tags: ["connectors", "oracle", "pipedrive", "freshdesk", "asana", "dlt"]
heroImage: "/logo.png"
publishedAt: 2026-07-17
---

Datanika just gained four new connectors: [Oracle](/connectors/oracle), [Pipedrive](/connectors/pipedrive), [Freshdesk](/connectors/freshdesk), and [Asana](/connectors/asana). That brings us to 36 connectors — and, like most of the [others](/blog/32-connectors-most-took-a-day), each one was mostly a config exercise on top of [dlt](https://dlthub.com), not a from-scratch integration.

Here's what each one unlocks.

## Oracle — get your data *out* of Oracle

[Oracle](/connectors/oracle) is the database enterprises ask for most, and almost always for the same reason: they want to move data *off* Oracle into a modern warehouse without paying for GoldenGate or a legacy ETL suite. Datanika connects to Oracle Database 12c and newer as a source, extracts full schemas or individual tables with incremental loading, and lands the data in [BigQuery](/connectors/bigquery), [Snowflake](/connectors/snowflake), [PostgreSQL](/connectors/postgresql), or any other destination — where dbt can reshape it.

It's source-only for now: extract from Oracle, load elsewhere. If you need Oracle as a *destination* too, [open an issue](https://github.com/datanika-io/datanika-core/issues) — it's a small addition on the same SQLAlchemy path.

## Pipedrive — sales analytics past the dashboard ceiling

[Pipedrive](/connectors/pipedrive)'s built-in reports are fine until you want to join deals against revenue or model win-rates the way *you* define them. This connector pulls deals, persons, organizations, activities, and pipelines into your warehouse, where you can build proper sales analytics with dbt — and join Pipedrive against [Stripe](/connectors/stripe) for real revenue attribution.

## Freshdesk — support metrics you actually control

[Freshdesk](/connectors/freshdesk) joins [Zendesk](/connectors/zendesk) as a support-data source. Extract tickets, contacts, agents, companies, and groups, then track resolution times, SLA compliance, and agent performance in your own warehouse — no more exporting CSVs by hand or fighting the built-in reporting.

## Asana — project reporting across teams

[Asana](/connectors/asana)'s native reporting is famously thin. This connector extracts tasks, projects, sections, users, and custom fields so you can build portfolio and velocity reporting dbt-side — and if you run more than one delivery tool, join Asana against [Jira](/connectors/jira) or [GitHub](/connectors/github) for a single picture of throughput.

## How to connect one

Same three steps as every other connector:

1. Add a connection under **Connections → New**, pick the connector, and paste your credentials (encrypted at rest with Fernet).
2. Create an upload with the new source and your warehouse destination, choose a load mode, and run it. Datanika handles extraction, schema mapping, and loading via dlt.
3. Write dbt models to transform the loaded data, then schedule the whole pipeline.

And because Datanika [bills per GB processed](/why-cheaper) — not per connector, not per row — adding these to your stack doesn't change your per-seat or per-connection math. Every connector is available on every plan, including Free.

## Try it

- [Browse all connectors](/connectors)
- [Oracle](/connectors/oracle) · [Pipedrive](/connectors/pipedrive) · [Freshdesk](/connectors/freshdesk) · [Asana](/connectors/asana)
- [Why per-GB pricing beats Fivetran's MAR](/why-cheaper)
- [Star on GitHub](https://github.com/datanika-io/datanika-core)
