# Spec: Pricing V2 — Volume-Aware Subscription + Usage

> ## 📌 Moved into this repo — 2026-08-31
>
> This spec lived at `plans/growth/SPEC_PRICING_V2.md`, outside every git repo, from 2026-04-15 to
> 2026-08-31. It is here now under `plans/SPEC_PLANS_CONSOLIDATION.md`: a spec is a contract amended
> across sessions, and the local `plans/` tree has no reflog, no remote and no review. Its sibling
> `plans/growth/SEO_KEYWORDS.md` (~36 KB) was destroyed by a truncating write on 2026-08-30 and was
> unrecoverable.
>
> **This repo is also where half of it was already enforced.** `tests/pricing-copy-rules.test.ts`
> cites §4.3 by section number. The test was versioned and reviewable; the rule it enforces was not.
>
> **Four things to know before quoting anything below.**
>
> 1. **`plans/…` paths are local-only.** Cross-references that were links are now inline paths. The
>    files they name still live on the founder's machine and are not in any repo.
> 2. **§3.1's per-GB competitor table is superseded and must not be republished.** It was written
>    2026-04-15 from vendor calculators. On 2026-08-30 we measured the opposite:
>    **none of Fivetran, Airbyte or Snowflake publishes a rate card you can compute a bill from**
>    (Fivetran's docs point at an estimator; Airbyte prices Pro "on compute capacity, not data
>    moved"; Snowflake's pricing-options page carries no dollar figure). dbt Cloud's $100/user/month
>    is the one exception and is public. The table is kept as the record of what we believed; the
>    live-site policy is [landing#325] — say what each vendor publishes, what it does not, and our
>    own price. §3.2's "We have 32" connectors is likewise stale: **36** since 2026-07-19.
> 3. **§8's launch checklist and §11's "Pre-P5 Growth activity" list are DONE, not pending.**
>    V2 P5 shipped to production on **2026-04-20** (landing#216 / #218 / #219 / #221 / #222). Those
>    unticked boxes are the 2026-04 rollout preserved as its own record. Do not treat them as a
>    backlog — that confusion is the exact defect this migration exists to remove.
> 4. **§3.1's two *Datanika* effective-$/GB cells used the wrong divisor and are corrected in place
>    (2026-08-31, [landing#410]).** They read **$0.40/GB** for Enterprise at 1 TB, which is
>    `399 ÷ 1000`. **We bill in binary GB**: `datanika-cloud/datanika_cloud/billing/tasks.py`
>    converts with `1024**3`, and `why-cheaper.astro` sets `entIncludedGB: 1024`. So 1 TB is 1024 GB
>    and the figure is `399 ÷ 1024 = `**$0.39/GB** — which is exactly what the four live
>    `/compare/*` pages publish. 🔑 **The site agreed with the biller and this spec was the outlier**,
>    so the pages were deliberately *not* changed; correcting them would have made the published
>    price both disagree with the code and overstate itself. The Pro row's 1 TB cell was wrong by
>    rounding too (`$79 + 924 GB × $0.50 = $541`; `541 ÷ 1024 = `**$0.53**, printed as `$0.52`).
>    The competitor columns are untouched and remain superseded per item 2.
>
>    [landing#410]: https://github.com/datanika-io/datanika-landing/issues/410
>
> **What is genuinely open in here is §2.5 and §12 question 0: D-RL1 / D-RL2 / D-RL3, the API rate
> limit.** Those await a founder decision. Everything else in §12 is resolved and marked so.
>
> [landing#325]: https://github.com/datanika-io/datanika-landing/issues/325

> **Status**: Draft — Growth's phase-1 deliverable for the root pricing pivot at `plans/PRICING_PIVOT.md`. Not implementable until user approves the full 6-spec set.
> **Owner**: Growth (this file). Cross-dependencies on Product (UX), Engineering (cloud metering), Infra (metrics).
> **Related**:
> - `plans/PRICING_PIVOT.md` — root strategy doc (approved 2026-04-15, Option A)
> - `plans/product/price_insights.md` — source economics analysis
> - `plans/growth/PRICING_ANALYSIS.md` — competitive baseline from 2026-04-10 (current prices, to be superseded by §4 below)
> - `plans/engineering/SPEC_ELT_IR_ARCHITECTURE.md` — parallel core spec (IR + ELT streaming path)
> - `plans/engineering/SPEC_VOLUME_METERING.md` — parallel cloud spec (GB counter, enforcement, Paddle sync)
> - `plans/product/SPEC_DUAL_MODE_UX.md` — parallel product spec (mode selector, cost estimator, billing UX)
> - `plans/infra/SPEC_GB_THROUGHPUT_METRICS.md` — parallel infra spec (per-tenant Prometheus counters, dashboards)
> - `plans/qa/SPEC_VOLUME_METERING_TESTS.md` — parallel QA spec (metering correctness + enforcement tests)
> - **`/why-cheaper/` landing page** — shipped 2026-04-15 via landing#160. Major rewrite required (§7).
> - **CEO-scope DAG `growth-launch-week-plan`** — Launch Week 2026-04-28 slips until pivot ships.
> **Date**: 2026-04-15 (drafted), revised 2026-04-15 v2 per `plans/PRICING_PIVOT_DECISIONS.md`, revised 2026-04-15 v3 for 10 GB Free sizing (9 touch points: §TL;DR, §2.1, §2.4, §3.2, §4.3, §5, §7.2, §9, §12)
> **Non-goals**: this doc is not the migration plan for existing customers (we have zero paying customers today — see §8), not the billing-backend spec (that is Engineering's SPEC_VOLUME_METERING), not the cost-model-proof-of-correctness (that is Infra's SPEC_GB_THROUGHPUT_METRICS). It is the *go-to-market narrative* and the *copy/page inventory* for a pricing change that closes negative unit economics before the first real customer arrives.

---

## TL;DR

- **New pricing shape**: subscription + included-volume + per-GB overage. Free 10 GB / Pro $79 + 100 GB + $0.50/extra / Enterprise $399 + 1 TB + $0.25/extra. Model-runs quota stays as a secondary dimension (not removed — see §3.2).
- **Why now**: current pricing has no volume dimension; first real-data customer at 1 TB loses us $50–150 on a $79 bill (from price_insights.md §4 (`plans/product/price_insights.md`)). Fix before the first paying customer arrives, not after.
- **GB-normalized competitive position**: Datanika Pro at 100 GB included = **$0.79/GB all-in**. Fivetran at 10M MAR ≈ 30 GB ≈ **$73/GB** (Starter-tier calc). Airbyte at 100 GB raw ≈ **$10–15/GB**. We remain 10–100× cheaper at the volumes that actually matter, but now the narrative stops breaking at the edges.
- **Messaging pivot**: the `/why-cheaper/` page (shipped yesterday) says *"volume is free, we charge for runs"*. That becomes false the moment Pricing V2 ships. §7 specs the rewrite — GB slider + two-column output cards (Fivetran via MAR conversion / Datanika auto-picking the cheaper tier), thesis **"you pay for bytes, not tables."** Same calculator pattern as today (preset buttons + numeric input), inverted axis.
- **Mode savings are a customer-facing lever** (per `plans/PRICING_PIVOT_DECISIONS.md` Q1): single overage rate ($0.50/GB Pro, $0.25/GB Enterprise) regardless of mode, but the meter counts **post-normalization bytes on ETL** and **post-compression bytes on ELT**. Same source ⇒ ELT records 3–5× fewer billable GB ⇒ customer bill is 3–5× lower on ELT. "Pick ELT, pay less" is the lead talking point on the rewritten page.
- **Migration narrative**: zero paying customers → no migration. Pre-V2 free-tier signups silently move to V2 Free (same $0, now 10 GB cap) at cutover. V1 Plan rows deleted, V2 Plan rows seed fresh. No banner, no email, no grandfather. Launch blog post is the only announcement channel.
- **Launch blog post**: "We're adding a volume dimension to our pricing. Here's the math, here's why, and here's what it means for you." Written as a commitment to honest unit economics, not as a price rise. Draft in §9.
- **ConversionCTA audit**: 17 `ConversionCTA href="https://app.datanika.io"` instances across navbar/hero/pricing/compare/connectors/use-cases. No changes needed to the CTA itself — the destination (signup) is unchanged. The messaging *around* those CTAs is what shifts (§6).

---

## 1. Why the spec shape matters

The temptation in a pricing pivot is to treat it as "update the pricing page + send an email." That produces three failure modes, observed in industry postmortems (Heroku 2015, Basecamp 2022, Docker 2024):

1. **Landing-page desync**. The pricing page updates, but `/compare/*`, `/why-cheaper/`, `/docs/getting-started`, individual blog posts, and the homepage "plans" card all still reference the old numbers. Google indexes the stale copies. Searchers arrive at contradictions.
2. **Product-copy desync**. The in-app upgrade modal, the empty-state for "you've hit your quota," the Paddle checkout description, and the post-signup welcome email all continue to reference the old structure because they were never linked to the landing site's pricing source.
3. **Narrative desync**. The launch blog post announces the change, but the five most-linked pages still argue *against* the new model. `/why-cheaper/` is the acute case — it was shipped 2026-04-15 specifically to say "volume is free."

This spec exists to make the rollout a **single coherent switch**, not a patchwork. Everything that mentions volume, runs, price tiers, or "MAR is evil" gets enumerated (§6), audited against Pricing V2, and updated in one branch before the page goes live.

---

## 2. New pricing structure

### 2.1 The three tiers

| | **Free** | **Pro** | **Enterprise** |
|---|---|---|---|
| **Subscription** | $0/mo | **$79/mo** ($66/mo annual) | **From $399/mo** ($333/mo annual) |
| **Included volume** | **10 GB processed/mo** | **100 GB processed/mo** | **1 TB processed/mo** |
| **Overage** | Hard cap (block at 10 GB) | **$0.50 per extra GB** | **$0.25 per extra GB** |
| Model runs (secondary quota) | 500/mo | 15,000/mo | 50,000/mo |
| Team members | 1 | 5 | 10 (+$25 each) |
| Connections | 5 | 25 | 50 |
| Schedules | 2 | Unlimited | Unlimited |
| SSO | — | — | SAML/OIDC |
| Support | Community | Priority | Priority with SLA |

**Single overage rate, mode-asymmetric measurement.** Per `plans/PRICING_PIVOT_DECISIONS.md` Q1 (locked 2026-04-15). The customer-facing rate is $0.50/GB (Pro) or $0.25/GB (Enterprise) regardless of mode — but the *number* of GB the meter records differs by mode. ETL path reads post-normalization bytes via `LoadInfo.file_size` (captures JSON amplification). ELT path reads post-compression parquet bytes via `StreamStats.bytes_out` (`plans/engineering/SPEC_ELT_IR_ARCHITECTURE.md` §7 table). For the same source, ETL typically records 3–5× more bytes than ELT. Customer on ELT pays less because the meter counts less — not because the per-GB price is lower. This is the design choice; §4.2 carries the customer-facing messaging.

### 2.2 Why both GB and run limits

The obvious question: if we charge for GB, why keep a run limit at all?

- **Runs = orchestration cost**. A pipeline that runs 100×/day with 0 rows each still consumes scheduler CPU, container spin-up, log storage, and dbt-compile time. Those are real costs that don't scale with GB.
- **Runs = abuse prevention**. Without a run ceiling, a single tenant can launch a runaway schedule that DOS's the scheduler without touching their GB quota.
- **GB = variable-cost floor**. Volume is the axis that actually correlates with our infra spend (disk, network, CPU for normalization). It's the dimension that makes us profitable at scale.

Both quotas fire independently; exhausting either one triggers enforcement. In the customer-facing copy (pricing page, comparison tables), **lead with volume** — it's the one that competitors use and the one customers budget for. Treat runs as a secondary line ("fair-use orchestration limit") rather than a headline number.

### 2.3 What "GB processed" means (public definition)

This is the single most important definition in the whole pricing page. Get it wrong and every competitor rep will use it to FUD us. The committed definition, to be echoed in pricing page + docs + FAQ + blog post:

> **"GB processed" means the total volume of data, in gigabytes, that moves through Datanika's ingestion or transformation layer in a given billing period. We count output volume (post-normalization), not input — because nested JSON and un-flattened records often produce 2–5× the volume they started with, and we'd rather price honestly on the bigger number than surprise you with a bill that reflects internal data expansion we didn't warn you about.**

Why this definition:

- **Output-not-input**: matches our actual cost driver (the amplified volume is what the disk + CPU actually touch). Explained honestly rather than buried.
- **"Ingestion or transformation"**: covers both ETL mode (dlt path) and ELT mode (dbt path) so mode selection doesn't accidentally become a pricing arbitrage.
- **No MAR-style gotchas**: we do *not* count "modified rows" separately (Fivetran's MAR) — a row updated 10× is still 1 row-worth of bytes on each pass. Writes aren't multiplied; re-reads aren't double-counted.
- **Aligned with SPEC_VOLUME_METERING**: Engineering's cloud-side counter measures exactly this, so the public definition and the billing code agree by construction.

A worked example goes into the pricing FAQ (§6.3): *"A 1 GB JSON export from HubSpot that normalizes into a 3 GB flat table counts as 3 GB processed. If you then run a dbt model that aggregates those 3 GB into a 100 MB summary, the dbt step adds 0.1 GB — total 3.1 GB for the pipeline run."*

### 2.4 What the three numbers ($0/ $79 / $399) actually buy

This matters for the pricing-page "who should pick what" copy:

- **Free (10 GB)**: a real side project or a full evaluation with production-shaped data. A daily Stripe + HubSpot sync, a Postgres→BigQuery incremental feed, a mid-sized webhook firehose — pick one or combine a couple. Sized so a team can *prove the product on real volume* before pulling out a card, not so a hobbyist can live here forever. A 3-source stack at trickle volumes still upgrades to Pro once it leaves eval.
- **Pro (100 GB)**: a small team with real production data. Sized so that a 3-source stack with daily syncs (typical SaaS + transactional DB + events log) lands around 30–60 GB, leaving headroom.
- **Enterprise (1 TB)**: scales up one order of magnitude. Past 1 TB, the per-GB overage ($0.25) is the dominant line and a conversation with sales starts making sense.

### 2.5 ⚠️ API rate limit — a tier dimension this spec never had, and it is now enforced

**Added 2026-08-31 (Growth), at CEO request, ahead of `cloud#114`. This section states an open
decision. It does not answer it, and nobody should quote a number out of it as settled.**

**The gap.** `plans.rate_limit_rpm` — **Free 30 / Pro 120 / Enterprise 300** — has been a column on
the `plans` table since 2026-04-09 and is published on six live surfaces. Until this section, the
string `rate_limit` did not appear anywhere in this file. §2.1's tier table covers subscription,
volume, overage, model runs, seats, connections, schedules, SSO and support; it does not cover this.

**Why it is a pricing question now.** [cloud#107]'s fix (`cloud#114`) stops treating a missing
subscription as "no limits". So on the next core promotion the number starts binding, for the first
time in its life.

#### What the evidence says about where 30 came from

| | |
|---|---|
| **2026-04-09** | core migration `r7n4o5p6q8k9_add_rate_limit_rpm_to_plans.py` adds the column (`server_default 60`) and sets `free=30`, `pro-monthly=120`, `enterprise-monthly=300`. No rationale, no linked issue. |
| **2026-04-10** | the numbers are published on `/docs/architecture`, one day later. |
| **2026-04-15** | this spec is drafted, and omits the dimension. |
| **V2 cutover** | `z5v2w3x4y6a7` (the V2 plan-column migration) changes **no** rpm value and **no** plan slug. |
| **2026-08-31** | enforcement arrives. Nothing has ever been measured against the limit, because nothing has ever hit it. |

Two things stop this being read as a quiet decision recorded elsewhere:

- **Cloud's own V2 plan fixtures use different numbers** — `datanika-cloud/tests/fixtures/plans_v2.py`
  seeds `free-v2 = 60`, `pro-v2 = 600`, `enterprise-v2 = 3000`. Fixtures are often arbitrary, so this
  is not evidence of a competing intent. It **is** evidence that no artifact in either repo asserts
  30 / 120 / 300 as a chosen number — only one migration and five landing pages do.
- **The values are not durable.** The 2026-04-20 V2 reseed silently wiped Infra's deliberate
  `load-test` rpm override. A future reseed that does not carry `rate_limit_rpm` returns Free to the
  column default **60**, and every page saying 30 becomes wrong with nothing failing.

#### What the number actually buys, stated honestly

- **Free at 30 rpm is one request every two seconds, sustained, per API key.** Not per org — the
  limiter buckets on `api_key.id`, and nothing quotas how many keys an org may create.
- **It lands hardest on the agent surface we market.** Remote MCP forwards the caller's key to the
  same REST API, so every MCP tool call draws on the same budget. `/ai-agents/` and
  `/docs/mcp-server/` are positioning pages; 30 rpm is the number behind them.
- **`plans/engineering/SPEC_REMOTE_MCP.md` §5.4 and §143 already lean on these exact values** as a
  blast-radius control for a runaway or prompt-injected agent. So the dimension is not *only* a
  pricing lever, and lifting Free is not a free action — whatever is chosen should be chosen knowing
  Engineering treats it as a safety limit too.
- **Customer impact today is zero.** The 60→30 halving Infra flagged in [core#699] hits our own five
  prod orgs. 0 paying users, 0 subscriptions. This is a commitment question, not an incident.

#### The decision (founder / pricing owner)

**D-RL1 — is Free 30 rpm the number we want to be held to?** Growth is deliberately not proposing a
figure: there is no usage data (the limit has never been enforced), no support signal, and no
competitor comparison worth the name, so any number invented here would be the same kind of artifact
as the one this section is flagging. What is needed is either a ratified *"30 stands"* or a
replacement chosen against a named scenario — the most concrete one available being an agent session
over MCP, since that is the workload most likely to meet the ceiling first.

**D-RL2 — does it go on `/pricing/`?** *Growth recommends: yes.* Right now the number binds users on
docs pages while the page where limits become commitments is silent about it — the reverse of how
every other tier limit is presented, and the same shape as the connector counts and the SOC 2 date.
If it is enforced, it is a tier limit; if it is a tier limit, it belongs in the tier table. This is a
copy change of one row per tier and needs no code.

**D-RL3 — is the per-second burst a tier dimension at all?** Today it is not: there is no burst
column on `Plan`, and `api_middleware.py` applies one core setting to every plan. We published
Free 5 / Pro 15 / Enterprise 30 anyway for four months. [landing#366] removes the claim rather than
waiting on a schema change; [core#703] carries the alternative (make it real). If the answer is
"make it real", this table gains a second column and the pages come back.

#### Whatever is decided, three things follow

1. **It lands in §2.1's table**, so the next person to read this spec finds the dimension where the
   other quotas are.
2. **The seed carries it.** A number that lives only in a 2026-04 migration does not survive a
   reseed — that is exactly how the `load-test` override was lost.
3. **`tests/rate-limit-claims.test.ts`** (landing) holds the five published surfaces to one set of
   numbers. It cannot see the database, and says so in its own header; changing the number means
   changing the snapshot there in the same batch.

**Second instance, same shape, not yet published:** `plans.max_parallel_runs` is not on the `Plan`
ORM model, is read by nothing, and appears in no spec and on no page — every org currently gets
`DEFAULT_MAX_PARALLEL = 5`. It is not a false public claim *yet*, which is the only reason it is a
footnote here rather than a decision. Detail in [core#703].

⚠️ **Production holds Free 2 and 5 for every paid tier** (`pro-monthly`, `enterprise-monthly`,
`pro-annual`, `enterprise-annual`), measured on the box 2026-08-31. So **"Enterprise gets more
parallelism" is a distinction that does not exist in the data.** Do not quote the migration's
`enterprise-monthly = 20` as a tier value: that `UPDATE` runs before the paid rows exist, matches
zero rows on a database built from scratch (production, rebuilt 2026-07-17), and the rows are then
created by `seed_v2_plans.py` through the ORM — which cannot see the column, so they take the
`server_default` of 5. **A number in a migration is not a number in a table.** Full retrace in
`plans/growth/notes/RATE_LIMIT_PRICING_DIMENSION_2026-08-30.md` §5.

🔗 **This is direct evidence for D-RL1's durability requirement above.** The same seed script sets
`rate_limit_rpm` explicitly on every tier because that column *is* on the model — so the ORM-visible
column survived the reseed and the invisible one silently reverted on four rows. Whatever number
D-RL1 lands on, **it must be carried by the seed, not only by a migration.**

[cloud#107]: https://github.com/datanika-io/datanika-cloud/issues/107
[core#699]: https://github.com/datanika-io/datanika-core/issues/699
[core#703]: https://github.com/datanika-io/datanika-core/issues/703
[landing#366]: https://github.com/datanika-io/datanika-landing/issues/366

---

## 3. Competitive position — GB-normalized

### 3.1 The table that goes on the pricing page

All figures are illustrative, sourced from each vendor's public calculator as of 2026-04-15. Precise numbers vary by destination, sync frequency, and plan tier; the order of magnitude is stable.

> 🚨 **SUPERSEDED 2026-08-30 — do not republish these per-GB figures.** Re-checked at source: none
> of Fivetran, Airbyte or Snowflake publishes a rate card a bill can be computed from, so the
> competitor columns below are derived from ranges, not from published prices. dbt Cloud Starter at
> $100/user/month is the exception and is public. The live-site policy is [landing#325]: state what
> each vendor publishes, what it does not, and our own price. The table stays as the record of what
> we believed on 2026-04-15.

| Platform | Subscription | Volume dimension | Effective $/GB at 100 GB/mo | Effective $/GB at 1 TB/mo |
|---|---|---|---|---|
| **Datanika Pro** | **$79/mo** | 100 GB included + $0.50/GB | **$0.79/GB** | **$0.53/GB** (corrected 2026-08-31, was $0.52 — crosses to Enterprise at this volume, $0.39/GB on Enterprise) |
| **Datanika Enterprise** | $399/mo | 1 TB included + $0.25/GB | n/a (below Enterprise) | **$0.39/GB** (corrected 2026-08-31, was $0.40 — `399 ÷ 1024`, not `÷ 1000`; see header item 4) |
| Fivetran Starter | No subscription | MAR-based | **~$50–80/GB** (10M MAR ≈ 30 GB, ~$2,500/mo) | **~$40–60/GB** |
| Airbyte Cloud | No subscription | Credits | **~$10–15/GB** (100 credits ≈ 100 GB, ~$250/mo) | **~$8–12/GB** |
| Stitch Standard | $100/mo | Rows (5M rows ≈ 15 GB) | **~$6–10/GB** | Not available — would require Advanced tier ($1,500/mo) |
| Hevo Starter | $239/mo | Events (5M ≈ 15 GB) | **~$15–20/GB** | Custom pricing required |
| dbt Cloud Starter | $100/seat/mo | Model runs (no volume) | n/a (transform-only, no EL) | n/a |

Headline takeaway for the pricing page: **Datanika is 10–100× cheaper per GB at the volumes teams actually run.** That's the claim. Back it with the table and a link to `plans/growth/PRICING_ANALYSIS.md` Scenario 1–3 (to be updated in §6).

### 3.2 What the "Datanika is cheaper" comparison stops working for

Honesty dimension — includes the cases where competitors beat us, so we don't get caught by a Reddit thread. Add to the comparison-page footer:

- **True hobby-scale pipelines (< ~1 GB/mo or ≤500K events)**: Fivetran Free (500K MAR) and Hevo Free (1M events) also cost $0 in this range. Datanika Free (10 GB) covers the same case, but at this volume we tie on price — we aren't *cheaper* than free. We do offer ~5–10× more headroom before a paywall hits, which matters the moment the side project grows, but sticker-for-sticker it's a wash at true hobby volumes.
- **Pure dbt-transform users, no EL**: dbt Cloud Starter ($100/seat for 1 seat) beats us if you literally don't need ingestion. We still win at 3+ seats (Pro's 5 seats at $79 vs dbt Cloud's $300).
- **500+ connectors**: Fivetran 700+, Airbyte 600+. We have 32. This isn't a price advantage — it's a coverage trade-off that goes on the comparison pages as "we cover the 32 most-used connectors (~90% of workloads)."

---

## 4. Messaging angle

### 4.1 The single sentence

*"You pay for bytes, not tables."*

Why this line:

- **Inverts the MAR criticism** without being a MAR page. MAR is confusing because rows aren't bytes — a wide table of 1,000 rows and a narrow table of 1M rows might have identical storage. "Bytes" reframes to the thing that actually costs money.
- **Aligns with SPEC_VOLUME_METERING's definition** (GB processed = output bytes).
- **Replaces** `/why-cheaper/`'s current "we charge for runs, not rows" — same rhythm, new object. Recognition is a rollout asset.
- **Does not say "cheaper"** in the hook. The page still argues cheaper via the §3 table, but the opening sentence is about *honesty*, which is the thing the pivot is buying.

### 4.2 Supporting talking points, ranked

1. **"Pick ELT, pay less"** — lead talking point for the rewritten `/why-cheaper/` page and the pricing page's mode-selection FAQ. Per `plans/PRICING_PIVOT_DECISIONS.md` Q1, ELT mode records 3–5× fewer billable bytes than ETL mode for the same source — parquet compression beats dlt's flattened normalization on every shape we've measured (`plans/engineering/SPEC_ELT_IR_ARCHITECTURE.md` §7 table). Concrete dollar example for the page: *"Your 100 MB of HubSpot JSON normalizes into ~400 MB on ETL mode and ~100 MB on ELT mode. At $0.50/GB Pro overage, that's $0.20 vs $0.05 per run — a 4× bill reduction by switching modes."* The mode selector is a **customer-visible savings lever**, not a hidden backend optimization. Framed as: *"Same pipeline. Same data. Lower bill. The only trade-off is that ELT's typed columns live in dbt staging models instead of dlt-generated tables — one extra click when you wire a dashboard."* Pair with Product's in-app "Switch to ELT: save ~$X/mo" nudge in SPEC_DUAL_MODE_UX.
2. **"Predictable data-volume pricing"** — pricing page H1 secondary line. Opposite of MAR's "your bill triples when you turn on hourly syncs."
3. **"GB you can budget"** — finance-ops angle. Pair with an explicit "this is your maximum monthly bill at X GB" worked example on the pricing page.
4. **"See the cost before you run"** — pre-run GB estimate. `plans/engineering/SPEC_VOLUME_METERING.md` §5.4 commits to predicting `predicted_bytes` on every `run.before_execute` via EWMA of the last 5 runs (or source-table size for first runs). Core §16.4 calls this out as an innovation vs whisk's production stack — whisk doesn't predict, we do. Pricing page gets a "Preview run cost" UI reference (Product-owned surface, but Growth owns the claim). Real differentiator against MAR pricing — MAR fundamentally cannot tell you the bill until after the sync.
5. **"Runs never block mid-flight on Pro and Enterprise"** — safety angle. Per `plans/engineering/SPEC_VOLUME_METERING.md` §5.4 + §12.5, Pro and Enterprise use Path B (allow-then-block) for overage-eligible plans. Only Free hard-blocks. Pair as pricing page FAQ #6: *"Will a big unexpected run block my pipeline on Pro?"* → "No. You pay the overage; the run completes."
6. **"Include the amplification in the quota, not in the surprise"** — honest-quote angle. We meter output (post-normalization on ETL, post-compression on ELT), not input. Blog post expands this.
7. **"Still 10–100× cheaper per GB than competitors at the volumes that matter"** — cost angle. The §3 table's punchline.

### 4.3 What to explicitly NOT say

- **Do not say "unlimited."** Anywhere. Not on any tier, not for any dimension. The whole pivot is about honest metering; "unlimited" in a volume context undoes that.
- **Do not say "per-row" or "per-MAR."** Distinct from competitor wording on purpose.
- **Do not say "free tier is generous."** 10 GB is wider than most competitors' Free tiers, but one wide denormalized feed can burn through it in a day — calling it "generous" on the copy invites the support ticket we don't want ("you said generous"). Keep the copy measured: "10 GB included." Avoid "plenty", "more than enough", "all the room you need". Let the product oversell in practice; the landing page doesn't need to.

---

## 5. Migration narrative

Zero paying customers at pivot time (confirmed against Paddle). Any existing free-tier signups are silently moved to V2 Free (10 GB cap, same $0 price) on cutover day — V1 Plan rows are deleted, V2 Plan rows seed fresh, enforcement flag flips on. No banner, no email, no drip campaign, no FAQ entry about "I signed up before April 2026", no opt-in choice, no grandfather. Cloud's `bytes_included=NULL` legacy-plan code path stays as a defensive no-op in case a stray V1 row survives the cutover delete (per `plans/PRICING_PIVOT_DECISIONS.md` Q6). Launch blog post (§9) is the only announcement channel. Self-hosted users are unaffected — self-host is AGPL-3.0, pricing is cloud-only. No refunds needed (nothing was paid), no beta/alpha tier, no retroactive billing (pre-V2 runs had `bytes_processed=None` and were no-ops in the meter).

---

## 6. Page + copy inventory to update

The single-branch invariant: *everything that mentions a price, a volume, or the "runs vs rows" argument gets updated in one landing-site PR, reviewed holistically, merged atomically.*

### 6.1 Pricing-relevant surfaces

| Surface | File | Update required | Owner |
|---|---|---|---|
| Pricing page | `src/pages/pricing.astro` | Full rewrite — new tiers, GB dimension, FAQ additions | Growth |
| Pricing component | `src/components/Pricing.astro` | Update `tiers[]` array: add `volume` field, replace "model runs" as headline with "volume processed" | Growth |
| Homepage pricing card | `src/pages/index.astro` (if it references tiers) | Sync with Pricing component's new `tiers[]` | Growth |
| `/why-cheaper/` page | `src/pages/why-cheaper.astro` | **Major rewrite** — see §7 below | Growth |
| `/compare/fivetran/` | `src/pages/compare/fivetran.astro` | GB-normalized table (§3), update Datanika column to reflect new tiers | Growth |
| `/compare/airbyte/` | `src/pages/compare/airbyte.astro` | GB-normalized table, new tiers | Growth |
| `/compare/stitch/` | `src/pages/compare/stitch.astro` | GB-normalized table, new tiers | Growth |
| `/compare/hevo/` | `src/pages/compare/hevo.astro` | GB-normalized table, new tiers | Growth |
| `/blog/real-cost-modern-data-stack` | blog post | Reconcile — post argues "cheap stack." Still true. Update pricing reference if it says $79 flat. | Growth |
| `/blog/saas-12-euros` | blog post | Add a single-line footer note: "Pricing updated April 2026 — see current `/pricing/`." The $79 number in the post is unchanged; structure now has a GB dimension. | Growth |
| `/blog/datanika-rest-api-v1` | blog post | No price refs expected; audit anyway. | Growth |
| All 32 connector pages | `src/pages/connectors/[slug].astro` + data | Verify no tier numbers are hardcoded in the template. Current audit: no tier refs in connector data. Safe. | Growth (verify) |
| All 10 use-case pages | `src/pages/use-cases/[slug].astro` | Same as connectors — verify no price refs hardcoded. | Growth (verify) |
| All docs pages mentioning quotas | `src/pages/docs/pipelines.astro`, `docs/scheduling.astro`, `docs/getting-started.astro` | Update quota refs to include volume dimension. Cross-reference SPEC_DUAL_MODE_UX for the in-app flow. | Growth + Product |
| `SMOKE_URLS.md` | smoke gate surface | Add `/pricing/` substring check for `$0.50/GB` (new structure marker) — drift detector if something desyncs. | Growth |
| `SEO_KEYWORDS.md` | keyword map | Add "data pipeline pricing per GB", "data volume pricing", "ETL pricing calculator", "ELT cost per GB" — V2 rank targets. | Growth |

### 6.2 In-app copy (cross-team)

Non-blocking for Growth — flagged for Product's SPEC_DUAL_MODE_UX:

- Upgrade modals referencing "runs left this month" need a sibling "GB left this month" line.
- Paddle checkout description (set in cloud plugin's plan seed data) — the Pro/Enterprise plan descriptions in Paddle need updating to include GB.
- Welcome email template (in cloud plugin's email sender) — price-structure paragraph needs the GB addition.

### 6.3 Pricing FAQ additions

Five new FAQ entries on `/pricing`:

1. **What does "GB processed" mean?** (Committed public definition from §2.3.)
2. **What happens if I exceed my volume quota?** — Free: hard block. Pro/Enterprise: per-GB overage, billed at end of cycle.
3. **Does a dbt model re-run count as new volume?** — Yes, because the model re-scans the underlying tables. ELT mode minimizes this by pushing work to the destination warehouse (cross-ref SPEC_DUAL_MODE_UX).
4. **How do you meter "processed" — by input or output?** — Output, after normalization. Explained honestly so you're not surprised by amplification. (Cross-ref §2.3 definition.)
5. **How does this compare to Fivetran's MAR pricing?** — Direct comparison, links to `/why-cheaper/` with GB-normalized figures. (Keeps the existing `/pricing/` FAQ #9 from landing#160, but rewrites the numbers.)

---

## 7. `/why-cheaper/` page rewrite — side-by-side GB slider calculator

Per `plans/PRICING_PIVOT_DECISIONS.md` Q4. The page shipped 2026-04-15 (landing#160) with a MAR-only input and the thesis "volume is free." Pricing V2 inverts the input (GB-per-month, the thing the customer now gets billed on) and replaces the one-output comparison with **two side-by-side output columns**: Fivetran cost via MAR conversion, Datanika cost auto-picking the cheaper of Pro-with-overage vs Enterprise-flat. Mode savings (ELT vs ETL) are a separate narrative block, not part of the calculator — keeps the primary widget focused on the head-to-head vs the competitor who gets googled.

### 7.1 What stays

- **URL** — `/why-cheaper/`. Inbound links from `/compare/fivetran/` hero CTA, `/pricing/` callout card, `/pricing/` FAQ #9. URL preservation non-negotiable.
- **`marPains` array** — the "four reasons MAR pricing hurts" section. Still correct criticism of MAR as a pricing model, independent of whether our pricing is flat or volume-aware.
- **Hero secondary CTA** back to `/compare/fivetran/`.
- **Fivetran disclosure block** — "hit Fivetran's own calculator for your specific destination." Good-faith-friendly, kept verbatim.
- **MAR→GB conversion math** — the log-log interpolation across the 6 Fivetran anchors (100k / 500k / 1M / 5M / 10M / 25M rows) becomes the **reverse** lookup: given a user-entered GB value, find the equivalent MAR on Fivetran's curve, then read off the Fivetran bill at that MAR.

### 7.2 What changes — the calculator

**Input**: GB-per-month, not MAR. Two input elements, mirroring today's MAR calculator:
- **7 preset buttons**: 1 GB, 10 GB, 50 GB, 100 GB, 500 GB, 1 TB, 10 TB. Covers the full pricing-relevant range — from sub-Free volumes at 1 GB, through the Free-tier cap at 10 GB, through Pro's 100 GB included, up to Enterprise overage territory at 10 TB. Preset selection snaps the slider. The 10 GB preset is visually marked as "Free cap" in the button label so users can see where paying starts.
- **Numeric input + slider**: 1 GB → 10 TB, logarithmic scale (each slider unit represents a fixed multiplicative step). Log scale because GB consumption spans 4 orders of magnitude across our ICP, and a linear slider wastes 99% of its real estate on the sub-100-GB range.

**Output**: two cards side-by-side, identical visual weight, no "winner" badge.

*Card 1 — Fivetran*:
```
Fivetran Starter
$ X,XXX / month

Based on ~Y million MAR at your volume
(using mid-range 5 KB/row conversion)

→ Link to Fivetran's own calculator
```

*Card 2 — Datanika*:
```
Datanika Pro          ← OR "Datanika Enterprise" if that's cheaper at this volume
$ XXX / month

Pro $79/mo + Z GB overage @ $0.50/GB   ← breakdown line
= $XXX/mo

You'd save $Y,YYY/mo vs Fivetran
```

The Datanika card **auto-picks** whichever of these is cheaper:
- `pro_bill(gb) = 79 + max(0, gb - 100) * 0.50`
- `ent_bill(gb) = 399 + max(0, gb - 1024) * 0.25`

Crossover point: ~740 GB (where Pro's overage matches Enterprise's flat). Past ~740 GB, Datanika card displays Enterprise pricing. **No explicit "upgrade nudge" text** — per decisions Q3 (silent crossover). The card just shows whichever number is lower. A user past 740 GB sees Enterprise $399 + overage and can draw their own conclusion.

**Breakdown line** — both cards show the per-component math, not just a headline. Customers who asked "how did you get that number?" in the landing#160 launch get the answer inline. No drill-down modal, no tooltip — just visible math.

**Savings line** — Datanika card shows "You'd save $Y/mo vs Fivetran." Neutral framing, no exclamation, no "!!!"; the number is the message.

### 7.3 What changes — the surrounding narrative

- **Thesis** — from "volume is free, we charge for runs" → **"You pay for bytes, not tables."** Same rhythm as the original thesis, new object. Recognition is a rollout asset.
- **`datanikaWins` array** — rewrite all 4 entries:
  - "Flat monthly bill" → **"Subscription + honest per-GB overage"** (numbers visible in the calculator).
  - "We charge for runs, not rows" → **"We charge for bytes processed, not rows inserted"** (explains GB vs MAR: a 1M-row narrow table and a 1k-row wide JSON blob can have identical byte volume; MAR tips the bill against wider schemas, GB doesn't care).
  - "Self-host if you want" → **unchanged**.
  - "All 32 connectors on every tier" → **unchanged**.
- **New separate section: "Pick ELT, pay even less"** — below the calculator, not inside it. Explains mode asymmetry per §4.2 talking point #1. Same dollar math the pricing page carries. Not a calculator input — explicit design choice to keep the head-to-head widget focused on Fivetran-vs-Datanika and not split attention across three outputs.
- **"Honesty disclosure" block** near the hero: *"This page compares Datanika's per-GB pricing against Fivetran's MAR pricing. Rows and gigabytes aren't the same thing — a row can be 100 bytes or 10 KB. We use a mid-range 5 KB/row conversion to map GB into Fivetran-equivalent MAR; your actual Fivetran bill will sit somewhere in the range we show. The Datanika side is exact — $0.50/GB is $0.50/GB."*
- **New section: "When Datanika is NOT cheaper"** — short, honest list (§3.2 — true hobby-scale <~1 GB where we tie competitor Free tiers, pure-dbt no-EL, needing 500+ connectors). Converts skeptics by not hiding weaknesses.

### 7.4 The MAR↔GB conversion pinned on the page

Same conversion table as the original launch, published in the body for reproducibility:

> *Conversion used by this calculator — typical SaaS data shapes:*
> - Narrow transactional rows (e.g., Stripe `charges`): **~1 KB/row** → 1M rows ≈ 1 GB
> - Wide denormalized rows (e.g., Segment `identifies`): **~5–10 KB/row** → 1M rows ≈ 5–10 GB
> - Document-style (e.g., HubSpot contact + associations): **~15–30 KB/row** → 1M rows ≈ 15–30 GB
>
> *Mid-range 5 KB/row used for the Fivetran estimate. Your pipeline may be higher or lower. The Datanika number is exact at any GB.*

### 7.5 What the rewrite PR looks like

- Single PR on landing, targets `dev` (per WORKFLOW_RULES §2).
- Branch `pricing-v2-why-cheaper-rewrite` in `worktrees/datanika-landing-growth/`. Lives through P1–P4 as a draft.
- Merge day = cutover day (P5), rebased onto latest `dev`, admin-merged if branch protection blocks, Infra promotes `dev`→`main` same day. Ships atomic with cloud's Paddle meter flip.
- Interactive math runs client-side only — no backend dependency, no deploy-window hazard. Pure JS + Astro `client:load` directive on the calculator component.

---

## 8. Pricing-page launch checklist

> ✅ **THIS SHIPPED — 2026-04-20.** The unticked boxes below are the 2026-04 rollout list preserved
> as its own record, not open work. V2 P5 went to production on 2026-04-20 (landing#216 / #218 /
> #219 / #221 / #222); `/pricing/`, `/why-cheaper/`, `/features/volume-pricing/` and
> `/blog/pricing-v2-math-and-why/` are all live.

One checklist, used at rollout time to prevent partial launches. Not a timeline; a go/no-go list.

- [ ] Pricing component `tiers[]` updated and reviewed
- [ ] `/pricing` page copy + FAQ #1–5 (§6.3) added
- [ ] `/why-cheaper/` rewrite (§7) merged to dev
- [ ] All 4 comparison pages updated with GB-normalized table (§6.1)
- [ ] Homepage pricing card synced
- [ ] In-app upgrade modals updated (Product-owned — ping Product)
- [ ] Paddle plan descriptions updated (Engineering cloud-owned — ping Engineering)
- [ ] Welcome email template updated (Engineering cloud-owned — ping Engineering)
- [ ] Volume metering live in staging, producing correct GB counts on dbt + dlt test workloads (Engineering cloud + Infra)
- [ ] Pricing FAQ JSON-LD updated in landing (SEO drift-test will catch the count mismatch — bump expected FAQ count)
- [ ] Launch blog post drafted, scheduled for launch day (§9)
- [ ] ConversionCTA audit complete — no CTA code changes needed, but messaging around CTAs re-read for stale claims (§4.3)
- [ ] `SMOKE_URLS.md` updated with new `$0.50/GB` substring check
- [ ] `SEO_KEYWORDS.md` updated with V2 keyword targets
- [ ] GSC submission after deploy — new pricing page is a page-shape change; submit explicitly
- [ ] Google Ads audit for ad-copy landing-page desync (ads that reference "flat pricing" need rewrite — G1 blocker if campaign is unpaused)

---

## 9. Launch blog post (draft title + outline)

**Title**: *"We're Adding a Volume Dimension to Our Pricing. Here's the Math, and Here's Why."*

**Angle**: honest unit-economics retrospective. Not an apology, not a sales pitch — a founder-voice post explaining that the old pricing had a known hole (volume) and we're closing it *before* it hurts someone. Per decisions Q5/Q6 (hard sunset, zero paying customers, no migration drama), the post does not dwell on "what about existing users" — there aren't any to reassure.

**Outline**:

1. **What changed** — one table: old vs new tiers, side by side. (30 seconds of reading.)
2. **Why "volume" was missing** — seats + connections + runs was the v1 pricing that Paddle and the initial plan seed shipped. It captured most of the cost curve but not the expensive tail.
3. **The math that broke it** — 1 run × 1 TB = $79 revenue vs $50–150 cost. Reproduce price_insights.md §4 (`plans/product/price_insights.md`) in prose.
4. **Why GB and not MAR** — MAR punishes schema choices you didn't make. GB measures the cost driver directly. (Cross-link `/why-cheaper/`.)
5. **How we meter honestly** — output bytes (post-normalization on ETL, post-compression on ELT). Worked example: HubSpot JSON → flat table. Cross-ref §2.3 definition.
6. **Pick ELT, pay less** — the customer-savings story from §4.2 talking point #1. Headline dollar example, link to `/why-cheaper/` "Pick ELT, pay even less" section.
7. **What stays** — open-core still AGPL-3.0, self-host is still $0, 32 connectors still on every tier.
8. **What we'll do if we got the numbers wrong** — commit to revisiting the 10 GB / 100 GB / 1 TB numbers after 90 days of real signup data. Blog again if we adjust.

**Deliberately not in the outline**: a "what about existing users" section. Nothing to announce. Anyone on a pre-V2 Free row silently moves to V2 Free at cutover, same $0 bill.

**Author voice**: first person (founder), technical-but-accessible. Same register as `/blog/open-core-plugin` and `/blog/saas-12-euros`.

**SEO target**: "data pipeline pricing per GB" (primary), "ETL cost per GB" (secondary). Long-tail, low competition, purchase-intent shoulder.

**Category**: `business` (same as `real-cost-modern-data-stack`).

**Distribution**: Same as launch-week plan — HN Show HN (title variant: "Show HN: We're changing our pricing model, here's the math"), r/dataengineering, dlt Slack #show-and-tell, dbt Community #show-and-tell, Dev.to cross-post with canonical.

**Draft lives at**: `src/content/blog/pricing-v2-math-and-why.md`, `draft: true`, committed to Growth's worktree branch, not pushed to dev until launch day.

---

## 10. Metrics — how we know it worked

Measurable post-launch (via Plausible + Paddle):

1. **Bounce rate on `/pricing/`** — watch for >10% spike in the first 2 weeks. If it spikes, the new structure is confusing; revisit copy.
2. **CTA click-through on `/pricing/`** — Plausible goals `Pricing: Start free` and `Pricing: Contact sales`. Target: no regression from pre-V2 baseline.
3. **`/why-cheaper/` exit rate** — page was shipped for conversion; if rewrite breaks that, we'll see it in Plausible exit-page breakdown.
4. **First paying customer arrival time** — if V2 pricing actually works, the first real $79 MRR shows up *without* a support email saying "wait your bill is $200 not $79 what happened." Silence from support on day-30 billing is the success signal.
5. **Reddit/HN sentiment** — manual, not instrumented. Launch post in §9 is the public commitment; we read r/dataengineering + HN comments during the first 48h and log reactions.

---

## 11. Sequencing with the rest of the pivot

Per `plans/PRICING_PIVOT.md` and the phased rollout in `plans/engineering/SPEC_ELT_IR_ARCHITECTURE.md` §9 + `plans/engineering/SPEC_VOLUME_METERING.md` §7:

| Phase | Core+Cloud work | Growth work (this spec's execution) | Gate |
|---|---|---|---|
| **P0 — Spec set** (this week) | All 6 specs drafted | This spec drafted, user reviews with the set | User sign-off on all 6 |
| **P1 — Plumbing** | Alembic migrations, IR dataclass, `Plan` columns. Feature flag off. | Begin copy drafts on a worktree branch. Do NOT push. | Cloud + core tests green |
| **P2 — ETL bytes meter** | dlt_runner emits `bytes_processed` from `LoadInfo`. Ledger fills. No billing. | Continue drafting. Calculator math backed by real data. | 7 days ledger vs. StreamStats within 1% |
| **P3 — ELT for SQL sources** | `stream_to_raw()` for Postgres/Snowflake/BigQuery/ClickHouse/DuckDB. Mode toggle UI ships (Product). | PR the pricing page + `/why-cheaper/` rewrite as a **draft** PR targeting `dev`. Comparison pages, blog post, FAQ — all in the draft. | Dual-mode equivalence tests pass |
| **P4 — ELT for SaaS sources** | Arrow backend for Stripe/Salesforce/etc. | Continue holding the draft PR. Update numbers if cost data shifts. | Parity tests pass |
| **P5 — Cutover day** | Paddle sync flips on. V1 Plan rows deleted, V2 Plan rows seed fresh, enforcement flag flips on. No migration task (per decisions Q6). | **Convert draft → ready PR, rebase onto `dev`, merge, Infra promotes `dev`→`main`.** Blog post publishes same day. | All above + explicit user sign-off + 14-day staging dry-run |

The "Growth holds" rule is in `plans/PRICING_PIVOT.md` sequencing and restated here: **Growth cannot merge pricing copy before the metering code is green in staging for ≥14 days** (per cloud §7 P3 dry-run guardrail). If we ship the page with numbers the code can't honor, we break trust on day one.

**Pre-P5 Growth activity — checklist for the draft PR**: ✅ **all done, 2026-04-20.** Kept as the
record of the rollout, not as a backlog.
- [ ] `/why-cheaper/` rewrite per §7 (GB slider, two-column output cards, "Pick ELT, pay even less" section, rewritten `datanikaWins`, honesty disclosure, "When Datanika is NOT cheaper" section)
- [ ] `/pricing` page + 5 new FAQ entries (§6.3)
- [ ] All 4 comparison pages updated to GB-normalized tables (§3.1)
- [ ] Homepage pricing card synced
- [ ] Launch blog post `src/content/blog/pricing-v2-math-and-why.md` with `draft: true`
- [ ] `SMOKE_URLS.md` updated with `$0.50/GB` substring check
- [ ] `SEO_KEYWORDS.md` updated with V2 targets
- [ ] Pricing FAQ JSON-LD mainEntity count bumped (drift test)

This goes into a branch in `worktrees/datanika-landing-growth/`. The branch lives through P1–P4. On P5 the draft flips to ready, rebases onto latest `dev`, and merges the same day cloud flips Paddle sync.

---

## 12. Open questions for user review

All cross-spec questions were answered by the 2026-04-15 decisions doc — see `plans/PRICING_PIVOT_DECISIONS.md` Q1–Q6 plus the (a)/(b)/(c) triage. Two of the three Growth-only questions are now resolved; one remains open, and **three more were added on 2026-08-31** when a tier dimension turned out to exist in production and in no spec:

0. **D-RL1 / D-RL2 / D-RL3 — the API rate limit** (§2.5, added 2026-08-31). Is Free 30 rpm the number
   we want to be held to; does it go on `/pricing/`; is the per-second burst a tier dimension at all.
   ⚠️ **`cloud#114` starts enforcing this on the next core promotion**, so D-RL1 is live rather than
   theoretical — though customer impact is zero today (0 paying users). §2.5 carries the evidence and
   the reason Growth is not proposing a figure. Growth's only recommendation is on D-RL2: **yes,
   publish it on `/pricing/`.**

1. **Launch coordination with Launch Week 2026-04-28** — `plans/PRICING_PIVOT.md` says Launch Week slips. The V2 launch post *is* arguably a Launch-Week-caliber announcement. Rescope Launch Week around V2? Per decisions (c), this is **deferred to V2 P2/P3** — it does not block P1 plumbing, and Growth drafts Launch Week options in parallel with the implementation phases. Final rescope decision lands after P1. See `plans/growth/LAUNCH_WEEK_2026-04-28.md` for the three drafted options.

Resolved by decisions doc:
- **Free tier sizing (1 GB vs 5 GB vs …)** → resolved (a): **10 GB**. §2.1, §2.4, §3.2, §4.3, §5, §7.2, §9 all updated in v3 pass (2026-04-15). DB seed bytes change in cloud SPEC_VOLUME_METERING (`plans/engineering/SPEC_VOLUME_METERING.md`); QA fixture re-targeting in SPEC_VOLUME_METERING_TESTS (`plans/qa/SPEC_VOLUME_METERING_TESTS.md`).
- **Annual discount structure (17% vs 20%)** → resolved (b): **17% preserved**. Reason: no perf tests yet on real data transfer; safer on price. Revisit after 90 days of real signup data alongside the tier-sizing revisit (§9 blog point 8). No copy changes needed.
- **Mode-dependent overage** → resolved Q1: single rate, mode-asymmetry is in measurement, not pricing. §2.1, §4.2, §4.3 reflect this.
- **Grandfather / opt-in migration** → resolved Q5+Q6: hard sunset, no comms, no grandfather. §5 collapsed to one paragraph.
- **`/why-cheaper/` calculator shape** → resolved Q4: GB slider, two-column output, auto-tier-pick. §7 fully specced.
- **Pro→Enterprise crossover nudge** → resolved Q3: silent. §7 calculator shows the tier that wins without commentary.
- **Plan naming (Pro vs Pro-legacy)** → moot under Q6 (V1 rows deleted at cutover; no two-name problem).

---

## 13. Explicit non-responsibilities (this spec)

- **Billing implementation**: Engineering SPEC_VOLUME_METERING.
- **Metering correctness proof**: Infra SPEC_GB_THROUGHPUT_METRICS + QA SPEC_VOLUME_METERING_TESTS.
- **In-app UX (mode selector, quota UI, upgrade modal)**: Product SPEC_DUAL_MODE_UX.
- **ELT architecture**: Engineering SPEC_ELT_IR_ARCHITECTURE.
- **Paddle product/plan seeding**: Engineering cloud-owned (coordinated via SPEC_VOLUME_METERING).
- **Migration email campaign**: not applicable — zero paying customers (§5), no comms channel per decisions Q5/Q6.
- **Refund policy updates**: not applicable — nothing to refund.

This spec is go-to-market + page-level copy only. The moment the spec asks for "make the metering actually work," it's handing off to Engineering.
