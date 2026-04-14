# Datanika vs Modern Data Stack — Reproducible Benchmark

This benchmark measures the end-to-end performance of a Postgres → DuckDB
pipeline at 10M rows using Datanika (dlt + dbt-core), and compares setup
time, sync latency, and monthly cost against the "default" three-tool
stack (Fivetran + dbt Cloud + Airflow).

## What it measures

| Metric | How |
|--------|-----|
| **Setup wall-clock** | Time from "I have credentials" to "first row lands in the destination" |
| **Sync latency (p50/p95)** | Wall-clock time for a full 10M-row sync, measured over 5 runs |
| **Incremental sync latency** | Time to sync 100k changed rows after the initial load |
| **Monthly infra cost** | Actual infrastructure bill for running this workload continuously |

## Prerequisites

- Docker + Docker Compose (for the Postgres source)
- Python 3.12+
- `uv` (recommended) or `pip`

## Quick start

```bash
# 1. Install dependencies
uv pip install -r requirements.txt

# 2. Start the source Postgres with 10M rows of test data
docker compose up -d
python seed.py          # ~2 min to generate and load 10M rows

# 3. Run the benchmark
python benchmark.py     # Runs 5 full syncs + 5 incremental syncs

# 4. View results
cat results.md
```

## Methodology caveats

See the [blog post](/blog/datanika-vs-modern-data-stack/) for the full
methodology section. Key caveats:

1. **Single-machine benchmark.** Both source and destination run on the
   same host. Network latency is ~0. Real-world syncs add network time.
2. **DuckDB destination.** We use DuckDB (local file) as the destination
   to isolate ELT performance from warehouse pricing. BigQuery/Snowflake
   numbers would add cloud egress + warehouse compute time.
3. **Fivetran/Airflow numbers are from published sources**, not from
   running those tools in this benchmark. We cite our sources.
4. **No dbt transform step** in the sync timing. The benchmark measures
   EL (extract + load) only. Transform timing depends entirely on the
   SQL you write, not the tool.
5. **Deterministic data.** The seed script generates realistic but
   synthetic data. Real-world schema complexity varies.
