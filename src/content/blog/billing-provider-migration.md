---
title: "I Integrated a Payment Provider, Then Ripped It Out and Switched to Another"
description: "Built the entire billing system on LemonSqueezy, then discovered it couldn't pay out to my country. Migrated to Paddle — here's why the plugin architecture made it survivable."
date: 2026-04-18
publishedAt: 2026-04-18
author: "Datanika Team"
category: "engineering"
tags: ["billing", "paddle", "migration", "open-core", "engineering"]
---

I built the entire billing system on LemonSqueezy. Models, API client, webhook handler, 51 tests. Then I learned LemonSqueezy doesn't support payouts to my bank's country.

Switched to Paddle. The migration was surprisingly manageable — but only because of one architectural decision I made early.

## Why It Didn't Break Everything

The billing layer was a [separate plugin](/blog/open-core-plugin), not woven into the core. All I had to replace was:

1. **API client** — `LemonSqueezyClient` became `PaddleClient`. Six async methods wrapping httpx. Same interface shape, different endpoint URLs and auth headers.
2. **Webhook handler** — HMAC verification logic changed (different header names, different signing scheme), but the handler still processes five subscription events: created, updated, canceled, past_due, paused.
3. **Column names** — `lemon_squeezy_subscription_id` became `paddle_subscription_id`. One Alembic migration.
4. **Config keys** — environment variables renamed from `LEMON_SQUEEZY_*` to `PADDLE_*`.

The core app didn't change at all. Not one line. The [hooks system](/blog/open-core-plugin) kept firing `connection.before_create` and `run.models_completed` — it didn't care which billing provider was listening.

## LemonSqueezy vs Paddle

Both are Merchant of Record — they handle taxes, compliance, and invoicing. The concepts map 1:1:

| Concept | LemonSqueezy | Paddle |
|---------|-------------|--------|
| Payment processing | ✅ | ✅ |
| Tax compliance (global) | ✅ | ✅ |
| Subscription management | ✅ | ✅ |
| Webhook events | 5 events | 5 events |
| Usage-based billing | ❌ (limited) | ✅ (native) |
| Payout countries | Limited | Broader |
| Fee structure | 5% + $0.50/txn | 5% + $0.50/txn |

The decisive factor was payout coverage. Everything else was near-identical. Paddle's native usage-based billing support was a bonus — it made overage billing for the Enterprise plan much cleaner than what I'd have built on LemonSqueezy.

## The Pricing Model Survived Unchanged

The pricing tiers didn't change at all during the migration:

| Plan | Price | Members | Connections | Schedules | Runs/month |
|------|-------|---------|-------------|-----------|------------|
| Free | $0 | 1 | 5 | 2 | 500 (hard cap) |
| Pro | $79/mo | 5 | 25 | Unlimited | 15,000 (hard cap) |
| Enterprise | From $399/mo | 10 | 50 | Unlimited | 50,000 (+$0.01/run overage) |

Annual plans save ~17%: Pro $66/mo ($790/yr), Enterprise from $333/mo ($3,990/yr). See [/pricing](/pricing) for current details.

## The Metering System

Metering was the most interesting part of the billing implementation, and it survived the migration completely untouched because it sits above the provider layer:

- **Upload run** = T model runs (T = tables loaded by dlt)
- **Transformation run** = 1 model run
- **Pipeline run** = M + T model runs (M = successful dbt models, T = tests executed)

An hourly Celery task syncs overages to Paddle for Enterprise customers. Free and Pro plans are hard-capped — runs stop once you hit the limit, no billing surprises.

The metering hooks (`run.models_completed`, `run.upload_completed`, `run.transformation_completed`) record every unit into a `UsageLedger` table. The Celery task reads the ledger and reports to Paddle. Swapping Paddle for any other provider would only touch the reporting step, not the recording step.

## The Lesson

**Always treat your billing provider as replaceable.** Abstract the interface, keep it in its own package, and don't let payment logic leak into your core product.

I was tempted to take shortcuts — calling the LemonSqueezy API directly from service methods, storing LemonSqueezy-specific IDs in core tables, importing billing models from core code. Every one of those shortcuts would have made the migration 10x harder.

The plugin boundary I describe in the [open-core post](/blog/open-core-plugin) wasn't just about separating open-source from paid. It was about keeping billing replaceable. If Paddle doesn't work out in two years, the next migration will be the same scope: one API client, one webhook handler, a few column renames, a few config keys. Not a rewrite.

## Building in Public

The billing system has 51 tests and hasn't processed a single real dollar yet. That's fine — the first real transaction will prove the webhooks work in production. Everything before that is architecture insurance.

Would love to hear how others handle payment provider risk — especially if you've been through a migration yourself.

## Related

- [How I Split Open-Source Core From Paid Cloud](/blog/open-core-plugin) — the plugin architecture that made this migration survivable
- [My SaaS Runs on €12 a Month](/blog/saas-12-euros) — the full infrastructure cost (Paddle is $0 while pre-revenue)
- [Pricing](/pricing) — current plans on Paddle
