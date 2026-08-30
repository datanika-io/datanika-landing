---
title: "dbt Incremental Models Duplicate Rows When `unique_key` Is NULL — and the Fix Is Off by Default"
description: "Your incremental model has a unique_key and still grows duplicates every run. The cause is three-valued logic in the MERGE predicate. dbt shipped a fix in 2025 — behind a flag that defaults to false and has no docs page."
date: 2026-09-03
publishedAt: 2026-09-03
author: "Datanika Team"
category: "engineering"
tags: ["dbt", "sql", "troubleshooting", "data-modeling", "open-source"]
---

You have an incremental model. It has a `unique_key`. You ran it twice on overlapping data, and the row count went up instead of staying flat:

```sql
{{ config(materialized='incremental', unique_key='order_id') }}

select order_id, customer_id, status, updated_at
from {{ source('shop', 'orders') }}
{% if is_incremental() %}
  where updated_at > (select max(updated_at) from {{ this }})
{% endif %}
```

Most of the table updates correctly. A small, stubborn subset duplicates on every single run, and it is always the same rows.

Check whether `order_id` is `NULL` in exactly those rows. It almost certainly is.

## Why NULL keys never match

dbt's incremental merge strategy compiles to a `MERGE` statement whose join predicate compares the incoming batch to the existing table. In the default macro that predicate is, at heart:

```sql
merge into my_model as DBT_INTERNAL_DEST
    using my_model__dbt_tmp as DBT_INTERNAL_SOURCE
    on (DBT_INTERNAL_SOURCE.order_id = DBT_INTERNAL_DEST.order_id)

when matched then update set ...
when not matched then insert ...
```

Now recall what SQL does with `NULL = NULL`. It does not return `TRUE`. It does not return `FALSE`. It returns `UNKNOWN`, and `MERGE` treats anything that is not `TRUE` as "no match."

So for every row whose key is `NULL`:

1. `when matched` is never reached.
2. `when not matched then insert` fires.
3. A second copy is appended.

Run it again tomorrow and you get a third. The model is not broken in a way that errors — it is broken in a way that quietly accumulates. This is the same three-valued logic that makes `where status != 'shipped'` silently drop `NULL` statuses, arriving in a place where it costs you row counts instead of filter results.

Two consequences worth internalising:

- **`unique_key` is not a uniqueness constraint.** dbt never enforces it. It is a join hint, and a join hint that is `NULL` matches nothing.
- **The bug is proportional to your NULL rate, not your data volume.** A key that is `NULL` in 0.1% of rows produces a slow leak that no one notices until a dashboard's totals drift.

## dbt fixed it — in 2025, behind a flag, off by default

The upstream issue is [dbt-core#7597](https://github.com/dbt-labs/dbt-core/issues/7597) / [dbt-adapters#159](https://github.com/dbt-labs/dbt-adapters/issues/159), *"[CT-2563] [Bug] Incremental updates result in duplicates if values for any `unique_key` are `null`"*. It was opened in May 2023, went stale twice, and was **closed as resolved on 2026-03-03** by [dbt-adapters#744](https://github.com/dbt-labs/dbt-adapters/pull/744), which merged on 2025-02-04.

If you find that thread while debugging, it reads as fixed. It is fixed only if you opt in.

Here is the shipped `equals` macro on dbt-adapters' `main`, in `macros/utils/equals.sql`:

```jinja
{% macro default__equals(expr1, expr2) -%}
{%- if adapter.behavior.enable_truthy_nulls_equals_macro.no_warn %}
    case when (({{ expr1 }} = {{ expr2 }}) or ({{ expr1 }} is null and {{ expr2 }} is null))
        then 0
        else 1
    end = 0
{%- else -%}
    ({{ expr1 }} = {{ expr2 }})
{%- endif %}
{% endmacro %}
```

The NULL-aware comparison is real, and it is on the `if` branch. The `else` branch — the one you get by default — is still the plain `=` that started the problem.

The flag's registration in `dbt/adapters/base/impl.py` is worth reading in full:

```python
{
    "name": "enable_truthy_nulls_equals_macro",
    "default": False,
    "docs_url": "",
},
```

`"default": False`, and an **empty `docs_url`**. There is no documentation page to link to, which is a fair part of why a fix that has been available since early 2025 is still an unfamiliar flag in 2026.

Turn it on in `dbt_project.yml`:

```yaml
flags:
  enable_truthy_nulls_equals_macro: true
```

Then recompile a model and read the generated SQL in `target/run/` before you trust it. If the predicate still says `(DBT_INTERNAL_SOURCE.order_id = DBT_INTERNAL_DEST.order_id)` with no `is null` branch, the flag has not taken effect — which is your signal that your installed dbt-adapters predates PR #744.

## The flag does not cover composite keys

This is the part that will bite people who enable the flag and assume they are done.

A `unique_key` can be a single column or a list. Those two take different paths through `default__get_merge_sql`, and only one of them goes near the `equals` macro:

```jinja
{% if unique_key is sequence and unique_key is not mapping and unique_key is not string %}
    {% for key in unique_key %}
        {% set this_key_match %}
            DBT_INTERNAL_SOURCE.{{ key }} = DBT_INTERNAL_DEST.{{ key }}
        {% endset %}
        {% do predicates.append(this_key_match) %}
    {% endfor %}
{% else %}
    {% set unique_key_match = get_merge_unique_key_match(source_unique_key, target_unique_key) %}
    {% do predicates.append(unique_key_match) %}
{% endif %}
```

The list branch writes a bare `=` for each column and never calls `get_merge_unique_key_match`, which is the only route to `equals()`. So in the default merge macro, `unique_key: ['tenant_id', 'order_id']` stays NULL-unsafe whether or not you set the flag.

One honest caveat on that: this is the **default** macro from dbt's global project. Adapters are free to override `get_merge_sql` and `get_merge_unique_key_match`, so your warehouse's adapter may behave differently. Compile the model and read the emitted predicate — that is the only answer that is true for your stack.

## What to do instead

**Fix the data, not the comparison.** A `NULL` in a key column is usually telling you something upstream is wrong. Before reaching for a workaround, find out why `order_id` is missing.

When the NULL is legitimate, give the merge something real to match on. A sentinel keeps the predicate on the fast path:

```sql
{{ config(
    materialized='incremental',
    unique_key='order_key'
) }}

select
    coalesce(order_id, -1)                      as order_key,
    ...
```

For composite keys, collapse them into one surrogate column so you are back on the scalar branch — and so that a single NULL component does not silently disable the whole match:

```sql
{{ config(materialized='incremental', unique_key='row_key') }}

select
    {{ dbt_utils.generate_surrogate_key(['tenant_id', 'order_id']) }} as row_key,
    ...
```

`generate_surrogate_key` coalesces NULLs to a string literal before hashing, which is exactly the property you want here. It also means one column to test rather than two to reason about.

## Catch it before a dashboard does

The reason this bug survives so long in real projects is that nothing fails. Add the tests that turn silence into a red run:

```yaml
models:
  - name: orders
    columns:
      - name: order_id
        tests:
          - not_null
          - unique
```

`not_null` on the key column is the one that matters — it fails at the source of the problem rather than at the symptom. `unique` is the backstop that catches duplication arriving by any other route.

If you use a composite key, test the surrogate:

```yaml
      - name: row_key
        tests:
          - not_null
          - unique
```

A model whose `unique_key` has no `not_null` test is a model that has assumed something it never checked. That assumption is free until the day a source system starts emitting partial rows.

## Where this fits

We run dbt-core in production, one project per tenant, so compiled SQL is something we read rather than something we take on faith. This bug is a good argument for a habit that generalises well beyond it: **when a tool gives you a green run, ask what the green actually compared.** dbt's incremental run succeeded. It emitted valid SQL. It inserted rows. Every layer reported success, and the model was still wrong — because nothing in the chain was checking the thing that broke.

If you would rather run dlt extraction, dbt transformation and scheduling in one place instead of gluing them together, that is what [Datanika](/) is. It is open source, self-hostable with `docker compose up`, and the [docs](/docs/) start with a working pipeline rather than a concepts tour.

**Further reading:** [How we run a dbt project per tenant](/blog/dbt-per-tenant/) · [Building a Stripe revenue dashboard with dbt](/blog/stripe-revenue-dashboard-dbt/)
