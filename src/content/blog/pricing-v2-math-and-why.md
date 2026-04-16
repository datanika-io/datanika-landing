---
title: "We're Adding a Volume Dimension to Our Pricing. Here's the Math, and Here's Why."
description: "Our v1 pricing had a hole big enough to lose money on the first real customer. We're closing it before that customer arrives. Here's the volume math, the mode trade-off, and what you actually pay per GB."
date: 2026-05-15
draft: true
author: "Datanika Team"
category: "business"
tags: ["pricing", "unit-economics", "volume-pricing", "elt", "open-core"]
---

<!--
§ Cutover day swap checklist (GA2)
=======================================
On V2 P5 cutover day, run these substitutions before flipping draft: false.
Each placeholder is a single sed-replaceable token.

  1. {{cutover_date}}        → real YYYY-MM-DD cutover date (also update frontmatter `date:`)
  2. {{crossover_point}}     → Pro-vs-Enterprise crossover GB from final cost model (expected ~740 GB)
  3. {{free_tier_examples}}  → "a 3-source trickle-volume stack" or whatever real usage shows 10 GB buys
  4. {{competitor_at_100GB}} → Fivetran Starter cost at 100 GB from /why-cheaper/ calculator (expected ~$3,800)
  5. {{competitor_at_1TB}}   → Fivetran Starter cost at 1 TB from /why-cheaper/ calculator (expected ~$22,000)

Social proof slots (fill when available):
  - {{design_partner_quote}}  → first quote from G2 design-partner program (blank until signed)
  - {{benchmark_throughput}}  → measured rows/s from GA1 CPX31 benchmark run (blank until log committed)
  - {{calculator_screenshot}} → /why-cheaper/ GB slider screenshot path (blank until cutover-day asset)

After substitution: flip `draft: true` → `draft: false`, set `date:` to cutover day,
add `publishedAt: <cutover_date>` if using the cron auto-publish mechanism.
Verify: `grep -c '{{' src/content/blog/pricing-v2-math-and-why.md` returns 0.
-->

Our v1 pricing had a known hole. We're closing it on {{cutover_date}}.

Specifically: we charged $79/mo for "Pro" with a 15,000-runs-per-month quota and no cap on the *volume* of data those runs moved. On paper, fine. In practice, a single customer running one pipeline that shovels 1 TB of Postgres into BigQuery per month would cost us $50–$150 in infrastructure to serve — on a $79 bill. Repeat that across ten customers and the business is upside-down.

We don't have ten of those customers yet. We don't have *one* of them yet. Which is exactly why we're fixing this now, before the first one arrives — not after, when it turns into an apology post.

## What changed

| | Old | New |
|---|---|---|
| **Free** | 500 runs, no volume cap | **10 GB processed/mo** + 500 runs |
| **Pro** ($79/mo) | 15,000 runs, no volume cap | **100 GB processed/mo**, **$0.50/extra GB**, 15,000 runs |
| **Enterprise** (from $399/mo) | 50,000 runs, $0.01/run overage, no volume cap | **1 TB processed/mo**, **$0.25/extra GB**, 50,000 runs |

Seats, connections, and schedules stay the same. SSO stays on Enterprise. SOC 2 Type I is still in progress, Type II right behind it. The tiers haven't moved; the meter has.

## Why "volume" was missing

Because we shipped v1 with Paddle's default-shape subscription plans — a flat monthly fee plus a secondary usage meter (model runs). That captured the obvious cost driver (orchestration, scheduler CPU, log storage) but ignored the expensive one (the actual bytes that hit disk, get normalized, get re-read by dbt, and get written to the destination).

Run counts correlate with *some* costs. They don't correlate with the cost that scales with your success as a customer. A pipeline running 30×/day with 500 rows per run is cheap for us. A pipeline running once a day with a full-history dump of your production database is not. v1 charged both the same.

That's the hole.

## The math that broke it

Take one customer running one pipeline: a nightly export of a Postgres table with a million wide rows. Each row is ~1 KB, so the raw export is ~1 GB. Nested JSON columns flatten to ~3 GB after normalization. A dbt model aggregates that to a 100 MB summary. Total bytes touched per run: roughly 3.1 GB. Repeat nightly for 30 days: ~93 GB/mo.

At v1, we billed $79 for this. At cloud-provider rates for storage + CPU + egress, we spent $12–$25 on infrastructure. That's fine. We're profitable on this shape.

Now scale it to the same customer adding three more pipelines: a Stripe export, a HubSpot sync, a Segment event feed. Each one amplifies 2–5× after normalization. Total bytes/mo: ~400–600 GB. Infrastructure cost: $50–$100. Still $79 on the bill.

Scale once more to a customer with a real data footprint — 1 TB/mo across 8 pipelines — and we're spending $120+ on a $79 subscription. That's the bill that convinced us the pricing was wrong.

If you're processing more than {{crossover_point}} GB/mo, Enterprise's $0.25/GB rate saves you more than the subscription difference. The [pricing calculator](/why-cheaper/) auto-picks the cheaper tier for you — no mental math required.

## Why GB and not MAR

Fivetran's "monthly active rows" pricing is the obvious alternative. We looked at it; we're not doing it.

MAR punishes schema choices you didn't make. A table with 10M narrow rows and a table with 100K wide rows can hit an identical disk-and-CPU bill but a 100× MAR bill. MAR also re-counts edits — update one row ten times this month and Fivetran charges you for ten rows. The customer has no way to predict the bill until the sync runs.

GB measures the cost driver directly. A wide JSON blob and a narrow normalized row land on the same gram of disk for the same price. Updates don't inflate the count. You can predict your bill by looking at `du -sh` on your source and multiplying by a constant.

At 100 GB on Fivetran Starter, you'd pay approximately {{competitor_at_100GB}}. At 1 TB, roughly {{competitor_at_1TB}}. On Datanika Pro at 100 GB, you pay $79. On Enterprise at 1 TB, $399 + nothing (it's included). The [calculator on /why-cheaper/](/why-cheaper/) shows this side-by-side with a slider.

That's what we mean by "you pay for bytes, not tables."

## How we meter honestly

We count **output bytes after normalization** — the amplified number, not the raw input. We do this because the amplified number is what our infrastructure actually touches, and pretending otherwise creates a gap between the sticker and the bill.

Worked example: you have a 1 GB HubSpot JSON export. Our ingestion flattens nested objects into a wide table — that's ~3 GB of post-normalization data. A dbt model aggregates the 3 GB to a 100 MB summary. Total: **3.1 GB counted against your quota**, not 1 GB.

We tell you this number before the run, not after. Pro and Enterprise pipelines get a pre-run estimate (`predicted_bytes`) based on a moving average of the last 5 runs, or an inspection of source-table size for first runs. If the predicted volume would put you past your included quota, the UI shows the expected overage cost before you click "Run." No MAR-style surprise.

## Pick ELT, pay less

Here's the lever we care about most.

The meter reads *what hit our disk*. If you're in **ETL mode** (the dlt path), your data gets normalized on our side — a 1 GB JSON export becomes ~3 GB of flat tables. The meter counts 3 GB.

If you're in **ELT mode** (the dbt path with our new IR layer), your data gets streamed as compressed parquet directly to your warehouse's raw schema and normalized *there* with SQL. A 1 GB JSON export becomes ~0.8 GB of parquet on the wire. The meter counts 0.8 GB.

**Same source. Same data. 3.75× lower bill.**

At $0.50/GB overage (Pro), the ETL pipeline costs $1.50 in overage per run past your included 100 GB. The ELT pipeline costs $0.40. Over a month of nightly runs, that's the difference between $45 and $12 in overage.

The mode selector is on every pipeline. We're not hiding this — it's the first switch in the UI when you create a new pipeline. Existing pipelines can flip modes with a migrate button. We've written a [dedicated post about when to pick which mode](/blog/real-cost-modern-data-stack/) — the short version: ELT is the streaming-first default, ETL is for destinations that don't support parquet writes well (almost nobody in 2026).

## What stays

- **Self-host is still $0 forever.** The AGPL-3.0 open-source core has zero pricing dimensions. Run it on your own hardware, ingest 10 TB/mo, pay us nothing.
- **10 GB Free is real headroom.** That's enough for {{free_tier_examples}} — a genuine evaluation with production-shaped data, not a crippled sandbox. Fivetran Free tops out at 500K MAR (~1–2 GB equivalent); Hevo Free at 1M events. We offer 5–10× more.
- **All 32 connectors on every tier.** Free users don't get a crippled connector list. Fivetran charges $5/connection on top of MAR; we don't, and we're not going to.
- **Pro's 5 seats, Enterprise's 10 seats, schedules unlimited on paid tiers.** Seat economics are unchanged.
- **Annual discount at 17%** (Pro $79 → $66/mo billed annually; Enterprise from $399 → $333). We'll revisit after 90 days of real signup data — if the math says 20% works, we'll adjust and blog about it.

## What we'll do if we got the numbers wrong

We picked 10 GB / 100 GB / 1 TB based on the cost model in [price_insights.md §7](/blog/real-cost-modern-data-stack/) and a napkin-margin target of 80–95% on variable cost. We don't yet have real signup data to validate those numbers against customer reality.

Commitment: 90 days from now we look at actual usage distributions against actual infrastructure cost. If 100 GB on Pro is the wrong number — too tight for the real median customer, or too generous for our margin — we adjust the Pro tier's included volume. We blog about it when we do. The *overage rate* won't move in year one; we picked $0.50/GB and $0.25/GB to sit comfortably above our variable cost at every volume we've modeled.

If you're already on Datanika when we adjust: your current tier honors its current numbers until your next renewal, and we email you the change at least 30 days before it hits. Not that there's anyone on paid Datanika yet — this is the policy for when there is.

## What this doesn't mean

We are not becoming a per-row-pricing company. We are not adding event fees. We are not going to count deletes. "Processed GB" is the only new meter. Everything else on your bill — seats, connections, schedules, support — stays on the subscription.

If you've been evaluating Datanika on the v1 pricing page and waiting to decide: the economics on your bill are now predictable against your data volume, which is probably the thing you actually wanted.

## Don't take our word for it

<!-- Social proof slot 1: design-partner quote (GA2) -->
{{design_partner_quote}}

<!-- Social proof slot 2: MDS benchmark throughput (GA1 → GA2) -->
On a standard Hetzner CPX31 (4 vCPU, 8 GB RAM, €13/mo), Datanika processes {{benchmark_throughput}} rows/second on a 10M-row star schema. Full benchmark log and methodology in [Datanika vs. the Modern Data Stack](/blog/datanika-vs-modern-data-stack/).

<!-- Social proof slot 3: /why-cheaper/ calculator screenshot (GA2) -->
![Pricing calculator showing Datanika vs Fivetran at various GB volumes]({{calculator_screenshot}})
*The [/why-cheaper/](/why-cheaper/) calculator lets you drag a slider from 1 GB to 10 TB and see the cost side-by-side.*

---

**Try it free at [app.datanika.io](https://app.datanika.io)** — 10 GB/mo on Free, no credit card, and you can see your predicted cost before every run.
