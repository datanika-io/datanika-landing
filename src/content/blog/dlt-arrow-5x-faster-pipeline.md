---
title: "How We Built a 5.8x Faster Data Pipeline with DLT + Arrow"
description: "We ran DLT three ways on 54M MySQL rows: legacy custom operators (99 min), DLT+JSON (174 min), DLT+Arrow (17 min). Here's the architecture, the numbers, and the file_max_bytes war story."
date: 2026-04-16
updatedDate: 2026-04-16
author: "Datanika Team"
category: "engineering"
tags: ["dlt", "arrow", "performance", "benchmark", "etl", "elt", "open-source"]
heroImage: "/logo.png"
publishedAt: 2026-05-09
---

Before Datanika existed, the founding team ran production data pipelines at [Whisk](https://whisk.com) — a food-tech platform processing 54 million MySQL rows and 8.6 million MongoDB documents daily into ClickHouse. We went through three generations of architecture, and the numbers tell the story better than any pitch.

## The three generations

### v1: Custom Airflow operators (99 min for 54M rows)

Each source type had its own operator. `MySqlToClickHouseTransfer`, `PostgresToClickHouseOperator`, `MongoToCH` — four files with duplicated logic, no shared schema management, no execution logging, no incremental state.

It worked. For small tables it was fine. But the main table — `user_recipe_rel`, 54 million rows — took 99 minutes as a batch INSERT over the native ClickHouse protocol. Acceptable, not fast.

### v2: DLT + JSON normalization (174 min — slower)

We unified everything behind DLT's `sql_database` source and a single `DltRunOperator`. YAML-driven table configs, automatic schema evolution, centralized execution logging, incremental state tracking. The operator improvement was night and day.

The performance was not.

DLT's default mode processes rows as Python dicts: fetch from source, convert each row to a dict, run schema inference, write to JSONL, convert to Parquet, upload. For 54 million rows, this JSON normalization pipeline took **174 minutes** — 75% slower than the legacy batch INSERT.

The operator was better. The throughput was worse.

### v3: DLT + Arrow mode (17 min — 5.8x faster)

Arrow mode changes the data flow completely:

```
MySQL --> Server-side cursor --> PyArrow Tables --> Parquet Files --> ClickHouse
          (chunk_size rows)     (in memory)        (file_max_bytes)   (HTTP insert)
```

No dict conversion, no schema inference, no JSONL intermediate step. The source yields `pa.Table` objects directly, DLT writes them to Parquet files, and the Parquet files upload to ClickHouse via HTTP.

**54 million rows in 17 minutes. 5.8x faster than legacy, 10x faster than DLT + JSON.**

## The numbers

### MySQL: `user_recipe_rel` (54M rows, production)

| Metric | Legacy operator | DLT + JSON | DLT + Arrow |
|--------|----------------|------------|-------------|
| Fetch from MySQL | ~99 min (bundled) | ~72 min | **~10 min** |
| Normalize + Load | bundled | ~102 min | **~7 min** |
| **Total time** | **99 min** | **174 min** | **17 min** |
| Load files | batch inserts | 547 | 5,462 |
| **Speedup vs legacy** | baseline | 0.57x (slower) | **5.8x faster** |

The Arrow fetch is 7x faster because it reads columnar batches instead of iterating row-by-row through Python dicts. The normalize step drops from 102 minutes to effectively zero because Arrow's normalizer does a direct Parquet file import — a file rename, not data processing.

### MongoDB: `hostedImages` (8.6M documents, dev)

| Metric | Legacy operator | DLT + JSON | DLT + Arrow |
|--------|----------------|------------|-------------|
| Fetch from MongoDB | ~49 min (prod, 29.7M) | ~11 min | **~3.3 min** |
| Normalize | N/A | ~12 min (JSONL) | **~1 sec** |
| Load to ClickHouse | bundled | ~1 min | **~40 sec** |
| **Total** | **~49 min** (29.7M) | **~23.5 min** (8.6M) | **~4 min** (8.6M) |
| **Normalized: sec/M rows** | 99s | 164s | **28s** |
| **vs legacy** | baseline | 0.6x (slower) | **3.5x faster** |

Extrapolated to production scale (29.7M documents), DLT + Arrow would complete in approximately 14 minutes versus the legacy operator's 49 minutes.

## The `file_max_bytes` war story

Arrow mode has one critical configuration that doesn't exist in JSON mode: `DATA_WRITER__FILE_MAX_BYTES`.

Without it, DLT concatenates all Arrow chunks from the extract step into a single Parquet file. For 54 million rows, that's a multi-gigabyte file. And when you try to upload a 2 GB Parquet file via HTTP to ClickHouse through an nginx proxy, you get a timeout.

The fix: set `DATA_WRITER__FILE_MAX_BYTES=100MB`. This splits the extract output into manageable ~100 MB Parquet files — 5,462 files for the 54M-row table. Each uploads in seconds.

The gotcha: the environment variable must use the `DATA_WRITER__` prefix, not `NORMALIZE__DATA_WRITER__`. Arrow's direct-import path skips the normalize step entirely, so normalize-scoped config has no effect. We discovered this after a week of "why is `NORMALIZE__DATA_WRITER__FILE_MAX_ITEMS` not splitting files" debugging.

## Why this matters for Datanika

This architecture is what powers Datanika's [ELT mode](/features/volume-pricing/) — the one that reads 3-5x fewer billable bytes for the same source data.

When you select ELT mode on a Datanika pipeline, the data flows as compressed Parquet directly to your warehouse, bypassing our normalization layer. The meter counts post-compression bytes, not post-normalization bytes. A 1 GB JSON export that would read as 3 GB on ETL mode reads as ~0.8 GB on ELT.

That difference is the same architectural split we measured at Whisk:

- **ETL** = fetch rows as dicts, normalize through JSON, write JSONL, convert to Parquet. Our infrastructure does the work, we meter the amplified volume.
- **ELT** = fetch as Arrow tables, write Parquet directly, stream to destination. The warehouse does the normalization in SQL. Less work on our side, fewer bytes metered, lower bill.

On our [CPX32 benchmark](/blog/datanika-vs-modern-data-stack/) (10.1M rows, Postgres to DuckDB), the full pipeline — extract, normalize, load — completes in 571 seconds at 17,704 rows/s. That throughput is built on the same Arrow-first data path we proved at production scale.

## Key takeaways

1. **DLT's JSON normalization is the bottleneck, not the source fetch.** Switching to Arrow skips it entirely.
2. **Arrow mode requires explicit file splitting.** Without `DATA_WRITER__FILE_MAX_BYTES`, you'll build multi-GB files that timeout on upload.
3. **The speedup is not from Arrow being faster at reading** — it's from eliminating the dict-to-JSON-to-Parquet conversion chain.
4. **The same architecture that made our pipelines 5.8x faster is what makes "Pick ELT, pay less" work** — compressed Parquet streaming means fewer bytes through our infrastructure, which means a lower bill at the same overage rate.

If you're running dlt at scale and haven't tried Arrow mode yet, the performance gain is significant and the migration is straightforward — set `use_arrow: True` in your source config and add the `DATA_WRITER__FILE_MAX_BYTES` env var.

---

*Datanika is an open-source data pipeline platform built on dlt + dbt-core. [Start free](https://app.datanika.io/) with 10 GB/mo, [self-host it](/docs/self-hosting/), or [read about our volume-based pricing](/features/volume-pricing/).*
