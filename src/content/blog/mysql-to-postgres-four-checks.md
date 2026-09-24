---
title: "Copying a MySQL Database into PostgreSQL, and Four Checks That Prove It Arrived"
description: "One run moved a small MySQL database into PostgreSQL: four tables and 7,182 rows. A matching row count is where checking starts, not where it ends. Here are the four checks we ran, in SQL you can copy, and the grant detail that spares you a maintenance chore."
date: 2026-10-23
publishedAt: 2026-10-23
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "mysql", "postgresql", "data-validation", "elt"]
---

We walked our [MySQL setup guide](/docs/connectors/mysql) end to end against a small online-store database: 50 sellers, 500 goods, 2,000 orders and 4,632 order items. The destination was PostgreSQL. One run later, the run page reported **Rows 7182**.

That number is the pipeline's report about itself. It is the right place to start and the wrong place to stop, because a load can finish, report a plausible total and still not have moved what you meant. Here are the four checks we ran against the two databases themselves, and what each one can catch that the others cannot.

## The setup, in three decisions

**A read-only user, granted on the whole database.**

```sql
CREATE USER 'datanika_readonly'@'%' IDENTIFIED BY '<strong-password>';
GRANT SELECT ON online_store.* TO 'datanika_readonly'@'%';
FLUSH PRIVILEGES;
```

A grant on `online_store.*` is a database-level privilege, so it also covers tables created after you run it. We checked rather than assumed: a table added to `online_store` after the grant was readable by this user straight away, while a table in a database the grant does not name was refused. There is nothing to re-run when the schema grows.

**The whole database in one upload.** With **Load Mode** `full_database` and **Table names** left blank, the upload reads every table the user can see. It lands them in a PostgreSQL schema named after the upload, here `onlinestoresync`, next to three bookkeeping tables of dlt's own (`_dlt_loads`, `_dlt_pipeline_state`, `_dlt_version`).

**Write Disposition `append`, the default.** Keep that in mind for check 2.

## Check 1: rows per table, on both sides

Run the same count in both databases:

```sql
-- MySQL
SELECT COUNT(*) FROM orders;
-- PostgreSQL
SELECT count(*) FROM onlinestoresync.orders;
```

| table | MySQL | PostgreSQL |
|---|---|---|
| `sellers` | 50 | 50 |
| `goods` | 500 | 500 |
| `orders` | 2,000 | 2,000 |
| `order_items` | 4,632 | 4,632 |

The four add up to 7,182, the Rows figure the run reported. That total covers every table the load wrote and leaves out dlt's bookkeeping tables, so compare it with the sum of your tables, not with any one of them.

A matching count tells you nothing went missing. It cannot tell you whether anything arrived twice.

## Check 2: distinct keys, not only rows

```sql
SELECT count(*) AS row_count, count(DISTINCT id) AS distinct_ids
FROM onlinestoresync.orders;
```

After the first run: **2,000 rows and 2,000 distinct ids**, and the same pattern on the other three tables.

This is the check that matters the second time you press Run. `append` does what the form's own description says: it *"adds new rows to the destination table without touching existing data"*. Every row of an unchanged database is new to that operation.

So we pressed Run again, with nothing changed in MySQL. The second run was green too, and it reported the same **Rows 7182**, which on a run page reads like steady ingestion. Afterwards:

| table | rows | distinct `id` |
|---|---|---|
| `sellers` | 100 | 50 |
| `goods` | 1,000 | 500 |
| `orders` | 4,000 | 2,000 |
| `order_items` | 9,264 | 4,632 |

Check 1 now fails, and check 2 says what happened: twice the rows over the same keys is a second copy of every row, not 2,000 new orders. Any revenue figure built on that table doubles along with it.

If you want a copy you can refresh, choose **replace** on the upload, or **merge** with a primary key. **append** is only safe for an upload you run once: every run reads the whole table, because an upload keeps no cursor from one run to the next ([core#1404](https://github.com/datanika-io/datanika-core/issues/1404)), so even a table that only ever gains rows gets a second copy of the old ones.

## Check 3: a sum, not only a count

Counts cannot see a value that arrived wrong. A total can:

```sql
-- MySQL
SELECT SUM(total_amount) FROM orders;
-- PostgreSQL
SELECT sum(total_amount) FROM onlinestoresync.orders;
```

Both returned **2181530.07**. `SUM(quantity)` on `order_items` returned **8741** on both sides. The money columns are `DECIMAL` in MySQL and landed as `numeric` in PostgreSQL, so every cent is still there and nothing was rounded through a floating-point type.

For a column that holds categories, compare the split instead of a sum. Grouping `orders` by `status` gave the same four counts on both sides: 111 cancelled, 1,404 delivered, 201 processing and 284 shipped. MySQL stored `status` as an `ENUM`; it landed as text.

## Check 4: the edges of every timestamp column

MySQL's `DATETIME` has no time zone. In PostgreSQL the same columns landed as `timestamp with time zone`, which means somebody decided what zone they were in. Compare the earliest and latest value, rendered in UTC on the PostgreSQL side:

```sql
-- MySQL
SELECT MIN(created_at), MAX(created_at) FROM orders;
-- PostgreSQL
SELECT min(created_at) AT TIME ZONE 'UTC', max(created_at) AT TIME ZONE 'UTC'
FROM onlinestoresync.orders;
```

Both sides gave `2023-12-24 12:46:00` and `2025-06-14 06:16:28`, and `sellers.registered_at` and `goods.created_at` matched the same way. The comparison is exact to the second: shifted by one hour, the same values do not match.

Our MySQL server runs in UTC, so equality was the expected answer. If yours runs in another zone, make this check before you trust any report that groups by day.

## What landed, type by type

| MySQL | PostgreSQL |
|---|---|
| `INT` | `bigint` |
| `VARCHAR` | `character varying` |
| `DECIMAL(10,2)`, `DECIMAL(12,2)` | `numeric` |
| `ENUM(...)` | `character varying` |
| `DATETIME` | `timestamp with time zone` |

Every table also gained two columns of dlt's: `_dlt_load_id`, the same on every row from one load, and `_dlt_id`, a unique id per row.

## Where to go from here

The copy in PostgreSQL is also where your transformations belong. MySQL is an extract source in Datanika, and there is no maintained dbt adapter for it, as [the post on MySQL and dbt](/blog/no-dbt-adapter-for-mysql/) explains.

The [MySQL setup guide](/docs/connectors/mysql) has every step of this walk, from the read-only user to the schedule. Its first-run step ends with the same advice as this post: count in the destination, and do not stop at the status badge.
