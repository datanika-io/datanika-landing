---
title: "Datanika vs the Modern Data Stack: A Reproducible Benchmark"
description: "We replaced Fivetran + dbt Cloud + Airflow with one tool and measured the difference. 10M rows, a script you can run yourself, and an honest account of what we could not measure."
date: 2026-04-15
updatedDate: 2026-08-30
author: "Datanika Team"
category: "benchmark"
tags: ["benchmark", "modern-data-stack", "fivetran", "dbt-cloud", "airflow", "performance", "open-source"]
---

The VC question we keep getting is some variation of: *"What's the moat? You're wrapping two open-source libraries in a UI — what stops Fivetran from adding a button?"*

The honest answer isn't AI, and it isn't connectors. **The moat is that we replaced three tools with one.**

This post is the evidence. We ran a reproducible benchmark — 10.1 million rows, Postgres to DuckDB — and compared it against the "default" modern data stack: Fivetran for extract, dbt Cloud for transform, Airflow for orchestration. The script is committed to our repo. You can run it yourself.

> **Updated 2026-08-30.** This post originally ran throughput estimates for Fivetran and Airbyte, a pre-pivot pricing table, and a stale connector count. All three are corrected below, and the corrections are itemised in [What changed in this revision](#what-changed-in-this-revision). The short version: **we deleted every competitor number we could not source**, and we now say plainly which of them nobody publishes.

## The workload

A realistic e-commerce star schema:

| Table | Rows | Description |
|-------|------|-------------|
| `customers` | 100,000 | Email, name, company |
| `orders` | 2,000,000 | Status, total, timestamps |
| `line_items` | 8,000,000 | Product, quantity, unit price |
| **Total** | **10,100,000** | 3 tables, foreign keys, indexes |

This is the shape of data most teams actually work with — a fact table with millions of rows, a couple of dimension tables, timestamps for incremental loads. It's not a synthetic micro-benchmark; it's the kind of thing a series-A company has in their production Postgres.

The seed is **deterministic**: the same seed always produces the same rows, and therefore the same bytes. That matters more than it sounds — it means the *volume* numbers below reproduce on any machine, even though the *timing* numbers don't.

## What we measured, and what we didn't

Three things determine whether a data stack is viable: how long it takes to set up, how fast it syncs, and what it costs. We can measure all three for Datanika. We can measure **none** of them for Fivetran, dbt Cloud, or Airbyte, because:

- We don't run their products at this workload, so any latency figure would be a guess dressed as a measurement.
- **None of the three publishes a rate card you can compute a bill from.** We checked, on 2026-08-30, and the sources are footnoted at the bottom.

So this post does something less satisfying and more defensible than the usual vendor benchmark: **it gives you our numbers, and it tells you exactly what the other vendors publish**, so you can put your own workload through their estimator and compare like for like.

## Setup: one tool, or three

The first version of this post claimed "3 minutes vs 2–4 hours." The 2–4 hours was an estimate from community reports, and we've deleted it — we never held a stopwatch to a Fivetran setup.

What we can count instead is **how many separate tools you have to stand up and wire together before the first row moves**. Both sides also need a destination, so the warehouse is excluded from both columns — counting it on one side only is how comparison tables lie:

| Stack | Tools to configure | Plus |
|-------|-------------------|------|
| **Datanika** | **1** — the app, self-hosted or cloud | — |
| Fivetran + dbt Cloud + Airflow | **3** | a git repo linked to dbt Cloud, and a DAG that calls the other two |

That's not a performance claim, it's an architecture claim, and it's the one that actually predicts how your first afternoon goes. The difference isn't that any single step is faster. It's that there's one step instead of three plus the glue between them. You open Datanika, pick a source, pick a destination, and click Run.

For the record, here is what our own setup actually cost, from the [benchmark log](https://github.com/datanika-io/datanika-landing/tree/main/scripts/benchmark/results):

| Step | Time (dedicated 4 vCPU / 8 GB box) |
|------|------|
| `docker compose up -d` | ~5s |
| `python seed.py` — generate + load 10.1M rows into Postgres | ~120s |
| First full sync to the destination | ~570s |

**~2 minutes of setup, then ~9.5 minutes of syncing.** The original post compressed those into "under 3 minutes total," which its own log contradicts. Setup is fast; moving ten million rows still takes as long as it takes.

## Full sync: what a 4 vCPU box does with 10 million rows

| Run | Host | Full sync (p50) | Throughput |
|-----|------|----------------|------------|
| [2026-04-16](https://github.com/datanika-io/datanika-landing/blob/main/scripts/benchmark/results/cpx32-2026-04-16.md) | Dedicated VPS, 4 vCPU / 8 GB | **570.5s** | **17,704 rows/s** |
| [2026-07-20](https://github.com/datanika-io/datanika-landing/blob/main/scripts/benchmark/results/pointer-2026-07-20.md) | **Shared** VPS, 4 vCPU / 8 GB, running other workloads | **2,192.5s** | **4,607 rows/s** |

**Both of those are us, on paper-identical hardware, 3.8× apart.** We're publishing the bad one on purpose. The gap is disk contention on a shared box, not a change in the tool — but if we showed you only the good number and you ran this on a busy VPS, you'd conclude we'd lied to you. Your hardware dominates this metric. Run it on yours.

**Incremental syncs** (100k changed rows out of 2M orders) complete in **11.3s** on the dedicated box and **46.9s** on the shared one, both p50 across three runs. In both cases the *first* run is dramatically slower (186.7s and 705.9s) because the pipeline state is cold — worth knowing if you're timing a single run and wondering why it looks terrible.

**What about Fivetran and Airbyte?** The earlier version of this post had a row for each, with a throughput range like "~21k–55k rows/s." Those were arithmetic performed on estimated minute-ranges, and we've removed them. Neither vendor publishes a sync-latency figure for a defined workload, and we haven't run their products at 10M rows. If you work at either company and have a reproducible 10M-row benchmark, we'd genuinely like to compare — the script is right there.

## Cost: what each vendor actually publishes

Datanika's pricing changed after this post first ran. We now meter **volume**, not runs — so the cost table below is stated in gigabytes, which is also the unit our benchmark now reports.

### What this workload weighs

`scripts/benchmark/measure_bytes.py` measures the byte volume of exactly the pipeline above. Unlike the timings, **these numbers are hardware-independent** — deterministic seed in, deterministic bytes out:

| Quantity | Bytes | GB |
|---|---:|---:|
| Source in Postgres (tables + indexes) | 1,025,695,744 | 0.96 |
| **Post-normalization — what the meter bills** | **245,835,514** | **0.23** |

**10.1 million rows is about a quarter of a gigabyte.** The load files dlt writes are
gzip-compressed JSONL, so for this workload the billable volume comes out *smaller* than the
source sitting in Postgres — roughly 4× smaller.

That is a result, not a promise, and it's worth being blunt about the direction: a JSON-heavy
source that flattens into wide tables can go the other way, which is exactly why the meter is
defined on **output** volume. We'd rather you saw the bigger number in the definition and the
smaller one on your invoice than the reverse.

The middle number is the one that matters: it's what Datanika's meter would bill, because we count **post-normalization output volume**, not input. Nested JSON and un-flattened records routinely produce 2–5× the volume they started with, and we'd rather price on the honest bigger number than surprise you later. The full definition lives on [the volume pricing page](/features/volume-pricing/).

### Datanika, priced

| Plan | Subscription | Included volume | Over that |
|------|-------------|-----------------|-----------|
| Self-hosted | **$0** — AGPL-3.0, no volume limit | your box | your box |
| Free (cloud) | $0 | 10 GB processed/mo | hard cap |
| Pro | $79/mo | 100 GB processed/mo | $0.50/GB |
| Enterprise | from $399/mo | 1 TB processed/mo | $0.25/GB |

Self-hosting costs whatever your box costs; we won't quote you a VPS price we haven't re-checked. The benchmark ran on a 4 vCPU / 8 GB instance, which is the cheap end of every provider's catalogue.

**So what does the benchmark workload cost on Datanika?** At 0.23 GB per full sync, the **Free** tier's 10 GB covers this pipeline about **40 full syncs a month** — a nightly full re-sync of all 10.1 million rows lands around 7 GB and stays inside the free tier. Pro's 100 GB covers it roughly **400 times**. This is the honest, slightly awkward answer: at this size we don't want your money.

For contrast, using only what the vendors publish: **Fivetran's free tier is capped at 500,000 monthly active rows**, and this workload is 10.1 million rows. Ours is capped at 10 GB processed, and this workload is 0.23 GB per sync. **Those are not the same unit and we're not going to pretend they convert** — MAR counts rows touched, our meter counts bytes moved. But both numbers are published, both are checkable, and you can put your own workload against each.

### Everyone else, priced — or not

This is the part we'd have liked to fill in with numbers, and couldn't. Checked 2026-08-30:

| Vendor | What they publish | Can you compute a monthly bill from it? |
|--------|------------------|------------------------------------------|
| **Fivetran** | Free / Standard / Enterprise / Business Critical tiers. Billing unit is **MAR** (monthly active rows — inserts and updates). A **$5 base charge** applies to a standard connection using between 1 MAR and 1M MAR. Rates follow "a separate cost curve based on usage." | **No.** The docs point at a Service Consumption Table and a Pricing Estimator; no per-MAR dollar rate is published on the pricing page or in the usage-based-pricing docs. |
| **dbt Cloud** | Developer (free, 1 seat) · **Starter, $100 per user/month**, 5 seats, 15,000 successful models/month · Enterprise and Enterprise+, custom. | **Partly** — the seat price is public, so a 5-seat Starter team is $500/mo. Enterprise is a quote. |
| **Airbyte** | Data Replication: Standard "starting at $10/month," volume-based · Pro and Enterprise Flex, custom. Explicitly *"prices on compute capacity, not data moved"* on Pro. | **No.** No per-GB rate is published. |
| **Snowflake** | Consumption-based, per credit. | **Not from the pricing-options page** — it directs you to a consumption table PDF after picking a platform and region. |
| **Datanika** | The table above. | **Yes.** $79 + $0.50 × (GB − 100). |

We're not claiming the others are hiding something — usage-based pricing with negotiated tiers is a normal enterprise model, and an estimator is a reasonable way to sell it. But it does mean **the honest comparison is not "$79 vs $1,120."** It's: *one of these five vendors lets you compute your bill from a public page before you talk to anyone.*

If you want the line-by-line version of the three-tool bill using publicly quoted seat prices and community-reported invoices, we wrote that up separately in [The Real Cost of Your Modern Data Stack](/blog/real-cost-modern-data-stack/), and the calculator on [Why we're cheaper](/why-cheaper/) lets you put your own volume in.

## Why one tool beats three

The architectural argument doesn't depend on any of the numbers above, which is why it's the part we're most confident in.

The three-tool stack has three serialization boundaries:

```
Fivetran (SaaS) → cloud staging → warehouse COPY
                                          ↓
Airflow DAG fires ──────────────→ dbt Cloud API call
                                          ↓
                               dbt Cloud → warehouse SQL
```

Each arrow is a network hop, an API call, a queue, and a potential failure point. The Airflow DAG is the glue — it exists solely to orchestrate the other two tools. It's the most fragile component and the one teams spend the most time debugging.

Datanika collapses this into one process:

```
dlt (extract) → DuckDB/Postgres/BigQuery (load)
                         ↓
              dbt-core (transform, same machine)
```

No cloud staging. No cross-service API calls. No DAG file to maintain. The scheduler, the extractor, the transformer, and the UI are in the same process, talking to the same database. When something breaks, there's one log to read, not three.

This is the moat. Not "we have more connectors" — **we very much do not.** Fivetran's pricing page advertises **700+ fully managed connectors** and Airbyte's advertises **600+**; we have [36](/connectors/). Not "AI" — every tool is adding AI, [including us](/blog/ai-agent-native/). The moat is **architectural simplicity**: one tool instead of three plus glue, and one log instead of three.

## Methodology and caveats

We are a vendor publishing a benchmark that makes us look good. You should be skeptical. Here's everything we know is imperfect about this comparison:

1. **Hardware dominates the timings.** Two runs on nominally identical 4 vCPU / 8 GB machines came out 3.8× apart. Treat our seconds as an existence proof, not a spec.

2. **Local-only benchmark.** Both source and destination run on the same machine. Real-world syncs add network latency. A Postgres → BigQuery pipeline over the internet is slower than Postgres → DuckDB on localhost. The benchmark isolates ELT throughput; it doesn't simulate a production network.

3. **DuckDB destination.** We chose DuckDB to remove warehouse pricing and performance as a variable. Swap in BigQuery or Snowflake and you add COPY time and transfer cost. **This also affects the byte figure** — the post-normalization volume is what dlt writes for *this* destination and loader format. It is not a universal bytes-per-row constant.

4. **We did not run the competitors.** Not "we ran them and they were slower" — we did not run them. Every competitor cell in this post is either a quote from their own published page (with a date) or absent.

5. **No dbt transform step in the timings.** The benchmark measures extract + load only. Transform time depends on your SQL, not the tool — dbt-core and dbt Cloud compile to the same queries. The difference is orchestration overhead, not transform performance.

6. **Deterministic synthetic data.** Realistic but synthetic. Real schemas are messier — nullable columns, JSON blobs, schema drift. dlt handles these well, but your mileage will vary, and JSON-heavy sources will move the byte number a lot.

7. **Self-hosted Datanika requires ops.** The $0 software cost assumes you're comfortable running a Docker Compose stack on a VPS. If you're not, the $79 Pro tier is the fair comparison.

8. **Vendor pages change.** Every third-party figure here was read on 2026-08-30 and is footnoted. If you're reading this much later, re-check them — and [tell us](https://github.com/datanika-io/datanika-landing/issues) if we're stale.

## Run it yourself

The benchmark scripts are at [`scripts/benchmark/`](https://github.com/datanika-io/datanika-landing/tree/main/scripts/benchmark) in our landing repo. Self-contained:

```bash
cd scripts/benchmark
uv pip install -r requirements.txt
docker compose up -d
python seed.py           # generates 10.1M rows into Postgres
python benchmark.py      # full + incremental syncs, reports p50/p95
python measure_bytes.py  # byte volume — the number our pricing meters
cat results/*.md         # your numbers
```

If your numbers are dramatically different from ours, open an issue. We'll update this post — we've done it once already.

## What this means for your stack decision

If you're running Fivetran + dbt Cloud + Airflow and your workload is under 50M rows/month:

1. **You're paying for managed infrastructure you might not need.** The operational burden of self-hosting in 2026 is a fraction of what it was in 2020. Docker Compose, dlt, and dbt-core are production-ready.

2. **You're paying three vendors to coordinate with each other.** The Airflow DAG, the dbt Cloud API trigger, the Fivetran webhook — that's engineering time spent on glue, not on analytics.

3. **You can compute our bill and probably not theirs.** That's worth something before a renewal conversation.

If your workload is 500M+ rows across 50+ sources and you need Fivetran's 700-connector catalogue — keep Fivetran. That's what it's for. But if you're a team of 3–10 with 8–15 sources, [the math is worth redoing](/pricing/).

Two things worth reading next: [why our pricing is lower](/why-cheaper/) rather than just cheaper-looking, and [the 109 security tests we wrote before launch](/blog/security-tests-before-launch/) — because "one process instead of four" is only a good idea if that one process is trustworthy. The head-to-head detail lives on [Datanika vs Fivetran](/compare/fivetran/) and [Datanika vs Airbyte](/compare/airbyte/).

## What changed in this revision

Kept honest in public, since this post is itself a claim about honesty:

- **Removed** the Fivetran and Airbyte sync-throughput rows. They were ranges computed from estimates; no vendor publishes the underlying figure.
- **Removed** "2–4 hours" for competitor setup — never measured. Replaced with a count of tools, which is checkable, and with the warehouse excluded from both sides rather than only theirs.
- **Corrected** "under 3 minutes total" for setup + first sync. Our own log says ~2 min setup and ~570s for the sync.
- **Corrected** the connector count: 32 → **36**. And Fivetran's: 500+ → **700+**, Airbyte's → **600+**. Understating a competitor is the same error as overstating ourselves.
- **Fixed** a broken evidence link. The original "Benchmark log" link pointed at a path that was never served and had returned 404 since publication — on the very citation the "measured" claim rested on.
- **Replaced** the pre-pivot cost table with the current volume-based pricing, and added a measured byte figure so the workload can be priced in the unit we actually bill.
- **Added** the slower second benchmark run, and the caveat that hardware dominates.

## Sources

All third-party figures read **2026-08-30**:

- Fivetran plans, connector count, and MAR definition — [fivetran.com/pricing](https://www.fivetran.com/pricing); absence of a published per-MAR rate — [Fivetran usage-based pricing docs](https://fivetran.com/docs/usage-based-pricing).
- dbt Cloud tiers and seat price — [getdbt.com/pricing](https://www.getdbt.com/pricing).
- Airbyte plans, connector count, and "prices on compute capacity, not data moved" — [airbyte.com/pricing](https://airbyte.com/pricing).
- Snowflake consumption model — [snowflake.com/en/pricing-options](https://www.snowflake.com/en/pricing-options/).

---

*Datanika is an open-source data pipeline platform — `dlt` for extract, `dbt-core` for transform, Celery for orchestration, Reflex for the UI. [Start free](https://app.datanika.io/), [self-host it](/docs/self-hosting/), or [run the benchmark yourself](https://github.com/datanika-io/datanika-landing/tree/main/scripts/benchmark).*
