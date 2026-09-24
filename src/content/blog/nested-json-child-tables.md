---
title: "109 Rows for 17 Products: What Happens to Nested JSON When You Load an API"
description: "A Shopify upload reported 109 rows for a store with 17 products and 3 customers, and every one of them was real. Lists inside API records become tables of their own. Here is how to read that count, and how to join the tables back."
date: 2026-10-15
publishedAt: 2026-10-15
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "shopify", "dlt", "nested-data", "dbt"]
---

When we walked our Shopify setup guide against a real store, the run finished and reported **109 rows**. The store had **17 products and 3 customers**.

Nothing was duplicated and nothing went wrong. Those 109 rows are exactly what the store holds, spread across seven tables instead of two. Load any API that returns nested JSON and you will see a number like this on your first run. It is worth understanding before you start reconciling it against the source.

## Where the other 89 rows came from

A Shopify product is not a flat record. Each one carries a list of variants, a list of images and a list of options, and every option carries its own list of values. A customer carries a list of addresses.

A table cell cannot hold a list and still let you query it, so the loading library underneath Datanika, [dlt](https://dlthub.com), does what a careful data modeller would do by hand: **each list becomes a table of its own**, named after the path that leads to it.

| table | rows |
|---|---|
| `products` | 17 |
| `products__variants` | 26 |
| `products__images` | 18 |
| `products__options` | 17 |
| `products__options__values` | 26 |
| `customers` | 3 |
| `customers__addresses` | 2 |
| **all tables** | **109** |

Two things in that table are worth noticing.

**The double underscore is a path.** `products__options__values` is the `values` list inside each entry of the `options` list inside each product. The nesting goes as deep as the data does.

**Child counts do not have to match their parent.** Seventeen products have 26 variants between them, because some products come in several variants and others in just one. That one-to-many shape is the whole reason those rows cannot live in `products`.

## What the Rows figure on a run counts

On `/runs`, the **Rows** figure for an upload is the sum across **every table that load wrote**, leaving out only dlt's own bookkeeping tables (`_dlt_loads`, `_dlt_pipeline_state`, `_dlt_version`). It includes all five product tables, not just `products`.

That makes it a good answer to *did this load move data?* and a poor answer to *how many products do I have?* **Reconcile per table, never against the run total.** Open **Models** (`/models`) and each of the seven tables is listed on its own; the bookkeeping tables are not.

## How the tables point at each other

dlt adds a few columns of its own so that the structure survives the split. Three of them matter here:

- `_dlt_id`: a unique key on every row, in every table.
- `_dlt_parent_id`: on each row of a nested table, the `_dlt_id` of the row it came from.
- `_dlt_list_idx`: the position the item held in its original list.

A variant finds its product through `_dlt_parent_id = products._dlt_id`, and an option value finds its option the same way, one level further down.

## Joining it back in a transformation

After a successful upload, Datanika reads the tables that actually landed and declares **all of them** as dbt sources, under a source named after the upload's schema. The schema, in turn, is named after the upload, so an upload called `shopifydailysync` puts every nested table one `source()` away from a transformation:

```sql
select
    p.id            as product_id,
    p.title         as product_title,
    v.id            as variant_id,
    v.sku,
    v.price,
    v._dlt_list_idx as variant_position
from {{ source('shopifydailysync', 'products') }} as p
join {{ source('shopifydailysync', 'products__variants') }} as v
    on v._dlt_parent_id = p._dlt_id
```

Shopify happens to put a `product_id` on each variant too, so you could join on that instead. **Do not build the habit.** The next API you load may carry no key back to the parent at all, and even here `products__options__values` holds nothing but the values themselves. `_dlt_parent_id` is on every nested table from every source, which makes it the one join you can write without first reading the vendor's schema.

Two levels down works the same way, one hop at a time:

```sql
select
    p.title as product_title,
    o.name  as option_name,
    ov.*
from {{ source('shopifydailysync', 'products') }} as p
join {{ source('shopifydailysync', 'products__options') }} as o
    on o._dlt_parent_id = p._dlt_id
join {{ source('shopifydailysync', 'products__options__values') }} as ov
    on ov._dlt_parent_id = o._dlt_id
```

## A checklist for the first run of any nested source

1. **Count per table.** The run's Rows figure is a sum. A store whose numbers look multiplied has usually loaded correctly.
2. **Expect tables you did not ask for.** Ticking one endpoint can write several tables, and an endpoint you untick is not fetched, so none of its nested tables are written either.
3. **Join on `_dlt_parent_id` = `_dlt_id`** rather than on vendor keys, so the model survives your next source.
4. **Keep `_dlt_list_idx`** wherever order carries meaning, such as the first image in a gallery.

## If you would rather not have the child tables

dlt can cap how deep it nests and keep everything below that depth as JSON. Datanika does not expose that setting on an upload, so the tables arrive shaped like the data. For most reporting that is the better default anyway: a JSON column is easy to produce and awkward to query, while the tables above are one join away from any shape you want.

The [Shopify setup guide](/docs/connectors/shopify) walks the upload this run came from, and the [transformations guide](/docs/transformations-guide) covers `source()` and `ref()`. For a model that joins more than one source, see [Customer 360 from HubSpot and Stripe](/blog/customer-360-hubspot-stripe/).

---

*Datanika is an open-source data platform: extraction, loading, transformation and scheduling in one place.*
