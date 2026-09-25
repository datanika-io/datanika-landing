---
title: "Jira, Notion and Zendesk Land Current State, Not History"
description: "Each scheduled run replaces the upload's tables with what that run fetched. For three sources whose records are edited constantly, that turns a whole class of ordinary-looking metrics into questions your warehouse cannot answer — and the query still returns a number."
date: 2026-11-02
publishedAt: 2026-11-02
author: "Datanika Team"
category: "product"
tags: ["product", "jira", "notion", "zendesk", "analytics", "data-modeling"]
---

There is a difference between the sources people usually pipe into a warehouse and these three, and it decides which questions the resulting tables can answer.

A Stripe charge is written once. A Jira issue is written once and then **edited for weeks** — Backlog, In Progress, In Review, Done, reopened, re-pointed, moved to another sprint. A Zendesk ticket is opened, reassigned twice, escalated, solved and sometimes reopened. A Notion row is whatever someone last typed into it. The row in your warehouse is not a record of an event. It is a **photograph of a thing that is still moving.**

That is fine, and it is often exactly what you want. It stops being fine the moment somebody writes a query with a date range in it, because those queries keep returning numbers whether or not the data can support them.

## What the three actually land

All three are **source-only** — you connect them as a source and Datanika loads them into a warehouse you have already connected. None of them is a destination.

The upload form for a SaaS source shows **Select endpoints to load**, a checkbox per resource, all ticked by default. The lists are short and fixed:

| Source | Endpoints |
|---|---|
| [Jira](/docs/connectors/jira) | `issues`, `projects` |
| [Notion](/docs/connectors/notion) | `databases`, `pages` |
| [Zendesk](/docs/connectors/zendesk) | `organizations`, `tickets`, `users` |

Each ticked endpoint becomes its own table in the destination. Two things about that form are worth knowing before you plan anything on top of it.

**The endpoint list is a fixed default, not a live fetch.** It comes from Datanika's built-in map for each source rather than from your account, so it does not reflect custom objects you have created. If the thing you need is not in the list above, it is not one checkbox away — it needs the [REST API connector](/docs/connectors/rest-api) instead. Better to discover that now than after you have modelled around a table that is never going to appear.

**A SaaS source has no write-disposition, load-mode, source-schema or table-name field**, and that is deliberate: those controls are rendered only when the source is a SQL database. The endpoint checkboxes are the equivalent control here. What every upload does carry, regardless of source, is a **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables**, **Columns**, **Data Type** — which decide whether an incoming shape that has changed evolves the destination or fails the run.

Tables land in a schema **derived from the upload's name** — whitespace runs become single underscores and the whole thing is lower-cased — so an upload called `zendeskdailysync` creates the schema `zendeskdailysync`, and one called `Zendesk Daily Sync` creates `zendesk_daily_sync`. There is no target-schema field to choose, so the upload's name is a modelling decision, not a label.

## The sentence that decides everything downstream

From each of the three setup guides, in identical words:

> Each run replaces the upload's tables with what that run fetched, so a schedule keeps one copy of each record instead of adding another. A record the API no longer returns is gone after the next run, and so are rows only an earlier run had loaded.

Read that twice against the first section. Your nightly Zendesk sync does not accumulate. Tonight's run does not add to last night's — it **stands in for it**. The table is not a log of what your support queue has been. It is a fresh photograph, taken at 03:00, of what your support queue is.

For Stripe that distinction barely matters, because a charge from March is still a charge from March and the API keeps returning it. For a ticket that was open on 12 March and solved on 14 March, it matters completely: after the 15 March run, nothing anywhere in your warehouse remembers that it was ever open.

## Three metrics that look fine and are not

None of these throws an error. Each returns a plausible number, which is the whole problem.

### "How many tickets were open on 12 March?"

The obvious query filters `created_at <= '2026-03-12'` and `status = 'open'`. What it actually returns is *tickets created on or before 12 March that are open **now***. A ticket opened on 10 March and solved on 11 March is excluded, even though it was open on the 12th. A ticket opened in January and still open when you run the query is included, correctly. The number comes out too low, by an amount nobody can estimate, and it moves every night for reasons that have nothing to do with March.

### "What is our cycle time?"

Computed from Jira issues as `resolved_at - created_at`, this is fine for issues that are done. It is silently **survivorship-weighted**: the issues that have been sitting in In Progress for four months have no resolution date, so they drop out of the average. Cycle time improves the longer your worst issues stay unfinished, and the metric is at its most flattering exactly when the team is most stuck.

### "How many Notion rows did the team add this quarter?"

Notion rows are edited in place, and the table holds one copy of each. A row created in January and rewritten a few days ago is one row with recent-looking properties. Counting rows by any "last edited" field measures editing activity, not creation — and counting rows that no longer exist is not possible at all, because a deleted row is simply absent from the next run.

## What follows, and what does not

The useful discipline here is not a setting. It is knowing which of two questions you are asking:

- **"What is true now?"** — how many tickets are open, which issues are in review, what the current state of a Notion board is. These tables answer this **well**, and the answer is as fresh as your cron expression.
- **"What was true then?"** — anything with a date range over a *state* rather than over an event. These tables cannot answer this, and no query phrasing changes that.

For the second kind, the only fields you can honestly build on are the ones the **source itself carries inside the row** — timestamps the API returns, like an issue's resolution date or a ticket's solved date. Those travel with the record and survive a replace, because they are data rather than history. A question that needs a *state* the row no longer carries needs that history captured deliberately, in your transform layer, before the next run overwrites the evidence. Our [transformations guide](/docs/transformations) is where that work lives.

Be honest with the people reading the dashboard about which kind each tile is. "Open tickets" is a live number. "Open tickets over time" is a claim about history, and it is worth knowing whether you are actually keeping any.

## Scheduling, and two things that look like failures

Scheduling an upload is a **real five-field cron string** — there is no cadence picker and no "manual only" option, because leaving an upload unscheduled *is* manual-only. `0 * * * *` is hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00. The [scheduling guide](/docs/scheduling) covers the rest.

Two normal outcomes get reported as bugs more often than anything else here:

**Fewer tables than checkboxes is not a partial load.** Every endpoint is ticked by default, and dlt creates a table only for a resource that actually yields rows. On a new or lightly-used account, finding no `organizations` table simply means that endpoint returned nothing. Tell the two cases apart before assuming a fault: a table that is **missing** means the endpoint returned no records; a table that **exists but is short** means rows were dropped. Checking the count in Zendesk or Jira itself settles it faster than reading logs.

**Bookkeeping tables you cannot see are still there.** dlt writes `_dlt_loads`, `_dlt_pipeline_state` and `_dlt_version` into the same schema, and **Models** does not list them. Seeing only your own tables in the catalog is correct, not evidence of a partial load.

One Jira-specific wrinkle, because it surprises everyone: **custom fields land as `customfield_12345`, not as readable names.** That is Jira's API returning internal IDs, not a Datanika behaviour, and the fix is a mapping in a staging model rather than a setting.

## Where this fits

If you are joining these against billing or CRM data, the identity problem is its own subject and we wrote it up separately in [the HubSpot and Stripe customer 360](/blog/customer-360-hubspot-stripe/) — the join is genuinely the hard part. If you want the modelling patterns on a source whose records *don't* move underneath you, [the Stripe revenue dashboard walkthrough](/blog/stripe-revenue-dashboard-dbt/) is the contrast case, and reading the two together is the fastest way to see why one of them needs a whole section on history and the other does not.

The three setup guides — [Jira](/docs/connectors/jira), [Notion](/docs/connectors/notion) and [Zendesk](/docs/connectors/zendesk) — each take under ten minutes end to end, and the full catalogue is at [all connectors](/connectors/).

A photograph is not a lie. It is just not a film, and the trouble starts when somebody asks it what happened.
