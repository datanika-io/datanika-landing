---
title: "Your Airtable Sync Will Land Record IDs Where You Expected Names"
description: "Airtable's API returns linked record fields as arrays of rec... IDs, not the display values you see in the grid. The sync is correct, the table looks wrong, and the fix is a join you have to plan for before you pick which tables to load."
date: 2026-09-23
publishedAt: 2026-09-23
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "airtable", "connectors", "dbt", "elt"]
---

Airtable sits in the gap between a spreadsheet and a database, which is exactly why it accumulates things nobody meant to make load-bearing: the CRM tracker, the content calendar, the inventory list, the client roster that finance now reconciles against.

Getting it into a warehouse is a five-minute job. What is not a five-minute job is the moment afterwards, when you open the landed table and find a column full of this:

```
["recA9dK2mQp1xLzYt"]
```

where you expected `Acme Corp`. Nothing is broken. This post is about why, and about the decision it forces you to make *before* you configure the sync rather than after.

## Why the IDs show up

Airtable's grid shows you a linked record as its display value — the primary field of the row it points at. That display value is a **rendering**, not the stored data. What the API returns for a linked record field is an array of record IDs, each starting with `rec`.

This is an API-level behaviour, not a Datanika quirk, and no connector can paper over it: resolving `recA9dK2mQp1xLzYt` to `Acme Corp` requires reading the *other* table, which the API will not do for you inside a single response.

The consequence for your pipeline is concrete. **If you sync only the table you care about, its most useful columns arrive as opaque IDs pointing at rows you did not load.** The fix is to sync both sides and rejoin them downstream — which means you need to know, at configuration time, which tables the one you want actually links to.

## Step 1 — A token, scoped to the bases you mean

Personal access tokens replaced Airtable's legacy API key in 2024. They are scoped per base and per permission, which is a real improvement: you can give Datanika read access to exactly one base.

At [airtable.com/create/tokens](https://airtable.com/create/tokens), create a token named something you will recognise, like `datanika-readonly`, and grant exactly two scopes:

- `data.records:read` — read records from tables
- `schema.bases:read` — read base schema, so table names and field types are discoverable

Under **Access**, add the specific bases. Avoid "All current and future bases" unless you have a reason — a token that automatically gains access to a base created next quarter is a token nobody will remember to review.

**Copy the value when it is shown.** It starts with `pat`, and Airtable shows it exactly once. Only read scopes are needed; Datanika never writes back to Airtable.

You also need the **base ID**, which is in the base's URL and starts with `app`.

## Step 2 — The connection

Open **`/connections`** — the form is rendered on the page already — pick the Airtable type, and give it a name, the base ID, and the token. The token is encrypted at rest with Fernet.

## Step 3 — Choosing endpoints, and the checkbox that does the opposite

At **`/uploads`**, create the upload. The name field accepts letters and digits only and strips the rest as you type, so `airtable-daily-sync` becomes `airtabledailysync` — remember that, because the schedule references the upload by name, exactly as saved.

Because Airtable is a SaaS source, the form shows **Select endpoints to load** — a checkbox per resource, **all ticked by default**. Untick anything you do not want; each ticked endpoint becomes its own table in the destination, and unticked ones are not fetched at all.

Two things about that list are worth knowing before you start unticking.

**Unticking every box does not load nothing — it loads the full set.** An empty selection is treated as "no filter specified", not as "the user chose zero endpoints". If you were planning to untick everything and re-tick one thing, untick carefully; passing through the empty state is fine, but *leaving* it empty gives you everything.

**The endpoint list is a fixed built-in map, not a live fetch from your account.** It does not reflect custom objects. If what you need is not on the list, the [REST API connector](/docs/connectors/rest-api) is the way to reach it.

This is the point where the linked-record problem becomes a configuration decision rather than a surprise. If the table you want has linked record fields, **tick the tables on the other end of those links too.** You are not loading them for their own sake; you are loading them so the IDs resolve.

The remaining controls — **Batch size** (10000 by default) and the **Schema Contract** dropdowns for **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. There is no write disposition, load mode, source schema or table-name field for a SaaS source; those appear only for SQL databases.

## Step 4 — Run it, then look in the destination

Click **Run** on the upload's row and watch `/runs` for the status badge, timestamps and **Rows** count.

The tables land in a schema **named after the upload**, so `airtabledailysync` creates schema `airtabledailysync`. dlt's own `_dlt_loads`, `_dlt_pipeline_state` and `_dlt_version` tables are created there too but are not listed in **Models** — seeing only your own tables is correct.

Spot-check the row count against the base. A green run means the load finished, not that it moved what you expected.

## Step 5 — Rejoin the linked records

Now the part you configured for. Sync both tables, and resolve the IDs in a dbt model:

```sql
select
    a.*,
    b.name as project_name
from raw_airtable.tasks a
left join raw_airtable.projects b
    on b._airtable_id = any(a.project)
```

`a.project` is the array of record IDs; `b._airtable_id` is the linked row's own ID. The `any(...)` handles the array, and the `left join` is deliberate — a linked field can point at a record that was deleted, and an inner join would silently drop the task rather than showing you a null project.

If a field can hold multiple links, you have a genuine one-to-many and the join will fan out rows. Decide whether you want one row per task with an aggregated list, or one row per task-project pair. Both are defensible; picking by accident is not.

## Two failures you will actually hit

**`INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND`.** The token is missing `data.records:read` or `schema.bases:read`, or the base is not in its **Access** list. Edit the token at [airtable.com/create/tokens](https://airtable.com/create/tokens) and add what is missing — you do not need to regenerate it or update anything in Datanika.

**`429 Too Many Requests`.** Airtable enforces 5 requests per second per base, and a full sync of a large base with many tables will reach it. dlt retries with exponential backoff automatically, so an occasional 429 is not a problem. Persistent ones mean the sync is too wide for one pipeline: split it, with high-priority tables on a fast cadence and the rest nightly.

A **`NOT_FOUND`** on one specific table almost always means it was renamed or deleted in Airtable after you configured the pipeline. Re-open the upload config and re-select — the base schema is rediscovered each time you open it.

## Step 6 — Schedule

At **`/schedules`**: target type `upload`, target name exactly as saved (`airtabledailysync`), a real five-field cron expression, and a timezone that defaults to `UTC`. There is no cadence picker, and leaving an upload unscheduled *is* manual-only.

## The short version

Airtable syncs cleanly. The thing that makes a landed Airtable table useful is not the sync, it is having loaded the tables on the other end of the links — and that is a decision you make at configuration time, before you have any way of noticing you got it wrong.

Full reference: the [Airtable setup guide](/docs/connectors/airtable) and the [connector page](/connectors/airtable).
