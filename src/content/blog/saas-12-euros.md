---
title: "My SaaS Runs on €12 a Month. Here's the Full Stack."
description: "Hetzner CPX31, Cloudflare free tier, Paddle for billing, Resend for email. The complete monthly cost breakdown for an open-source data pipeline platform."
date: 2026-04-12
author: "Datanika Team"
category: "business"
tags: ["bootstrap", "infrastructure", "cost", "self-hosted", "indie-hacking"]
---

People assume you need hundreds of dollars in cloud bills to run a SaaS. Here's what [Datanika](https://datanika.io) actually costs to operate, line by line, with no hand-waving.

## The Bill

| Item | Monthly cost | What it does |
|------|--------------|--------------|
| Hetzner CPX31 (Nuremberg) | **€11.49** | 4 vCPU, 8 GB RAM, 160 GB NVMe — runs the entire platform |
| Hetzner snapshot retention | **€0.20** | Weekly snapshots, 30-day retention |
| Aweb VPS (landing site) | **€0** marginal | Sits on a shared server I already pay for |
| Cloudflare DNS + CDN + SSL | **€0** | Free tier covers everything |
| Resend (transactional email) | **€0** | Free tier (3,000 emails/month) |
| Paddle (billing) | **€0** | Pre-revenue. 5% + $0.50 per transaction once we're not |
| **Operational total** | **€11.69** | What hits my card every month |
| Porkbun domains (3 × ~€10/year) | **€2.50** amortized | datanika.io, datanika.cloud, datanika.pro |
| **All-in total** | **~€14.20** | Including amortized one-time costs |

The "12 euros" headline is the **operational** number — compute and bandwidth. Domains are a once-a-year purchase amortized into a monthly figure. I'm calling that out because most "cheap stack" posts conveniently leave it out, then someone notices in the comments and the post loses credibility.

## What Runs on the €11.49 Box

The Hetzner CPX31 runs **eight Docker containers** via a single `docker-compose.yml`:

| Container | Purpose |
|-----------|---------|
| `datanika-app` | Reflex frontend + Starlette backend (ports 3000 / 8000) |
| `datanika-celery` | Background task worker for pipeline runs |
| `datanika-postgres` | PostgreSQL 16 — app metadata + pipeline data |
| `datanika-redis` | Celery broker + APScheduler job store + session cache |
| `datanika-grafana` | Internal-only monitoring dashboards |
| `datanika-prometheus` | Metrics scraper |
| `datanika-cadvisor` | Per-container resource metrics |
| `datanika-node-exporter` | Host-level metrics (CPU, disk, network) |

That's roughly 2 GB resident, leaving 6 GB headroom for query workloads, build cache, and Celery task spikes. The box is dramatically over-provisioned for current usage — but the next size down is half the RAM and the savings would be ~€5/month, not worth the migration friction.

**No managed Postgres. No managed Redis. No Kubernetes. No CDN paid tier.** Just Docker Compose, nginx as reverse proxy, and Cloudflare in front.

## The Landing Site Costs Nothing Extra

The marketing site at `datanika.io` sits on a separate VPS (Aweb) that I already pay for, hosting other unrelated projects. Adding the Datanika landing site to that box was zero marginal cost — nginx serves a static Astro build from `/var/www/datanika.io/`. If I had to spin up a dedicated VPS, it'd add maybe €5/mo. Currently it doesn't.

I'm being deliberate about saying "marginal cost" instead of "free". Free implies no underlying cost exists. Marginal cost reflects the fact that adding one more static site to an already-running nginx is genuinely zero new spending — but the box itself is real.

## DNS and SSL: Cloudflare Free Tier

Three domains (datanika.io, datanika.cloud, datanika.pro) on Porkbun with Cloudflare DNS. Redirect rules handle the routing between them:

- `datanika.io` → landing site on Aweb
- `app.datanika.io` → SaaS app on Hetzner
- `datanika.cloud` → 301 redirects to `app.datanika.io` (and legal pages redirect to `datanika.io`)

SSL via Cloudflare Origin Certificates on both servers. Full strict mode. Zero cost, zero maintenance.

## Why This Works (And When It Will Stop)

The trick is **not overengineering early**. No Kubernetes orchestration, no managed database, no Redis cluster, no Datadog, no PagerDuty. One VPS, Docker Compose, and a monitoring stack that runs on the same box it's monitoring.

Yes, that's a single point of failure. Yes, if Hetzner Nuremberg goes down, so does the SaaS. The probability is low and the alternative — multi-region active-active — would 5x the cost for an app with zero paying customers.

When the bottleneck becomes infrastructure rather than users, here's what gets added (in order):

1. **Managed Postgres** (~€15/mo) — when point-in-time recovery becomes a real need
2. **Separate Celery worker** (~€11/mo) — when one box can't run pipelines and serve UI on the same cores
3. **Read replica** (~€11/mo) — when SQL Editor queries start blocking app traffic
4. **Cloudflare paid tier** (~€20/mo) — only if image optimization or edge caching becomes load-bearing

That's ~€50/mo of growth headroom, all deferred until usage justifies it. **Right now the bottleneck is users, not infrastructure.** Every euro saved on hosting is one more month of runway.

## What's Not on the Bill

A few things I get for free that would otherwise cost money:

- **GitHub** — free for public repos. The [open-source core](https://github.com/datanika-io/datanika-core) lives there
- **GitHub Actions** — free CI minutes for public repos
- **Error tracking** — none. Errors go to `docker logs` and Grafana. Will add Sentry's free tier when I outgrow tail-the-logs debugging
- **Staging server** — none. The deploy pipeline runs build + tests in CI before touching production

If I were spending €200/month with no paying users, every one of those services would feel "necessary". At €12/mo, the discipline of "buy nothing until it hurts" stays sharp.

## The Self-Hosting Story

Because the infrastructure is this simple, self-hosting is genuinely straightforward. The same `docker-compose.yml` that runs production runs your self-hosted instance:

```bash
git clone https://github.com/datanika-io/datanika-core.git
cd datanika-core
cp .env.example .env
docker compose up -d
```

That's it. App on port 3000, no Kubernetes, no cloud provider lock-in. The [self-hosting guide](/docs/self-hosting) covers configuration, backups, and upgrades.

Once the containers are up, the fastest way to verify everything works is the [CSV to DuckDB template](/templates/csv-to-duckdb) — zero credentials, zero cloud accounts, first rows loaded in two minutes. No egress fees to trip over, no service-account JSON to provision.

The [open-core architecture](/blog/open-core-plugin) means self-hosted gets all features — the billing plugin simply doesn't load. No crippled "community edition".

## If You're Launching

If you're launching a SaaS and spending more than €20/mo on infrastructure before you have paying users, ask yourself why. Most "what stack should I use" discussions get answered with whatever's trending on Hacker News. The boring answer — one VPS, one database, Docker Compose, Cloudflare — works for an enormous range of indie SaaS scale. It'll get you to your first 100 paying customers without rearchitecting anything.

Building in public. What does your SaaS infrastructure cost you each month? Open a [discussion on GitHub](https://github.com/datanika-io/datanika-core/discussions) — I'm collecting cost breakdowns.

## Related

- [How I Split Open-Source Core From Paid Cloud](/blog/open-core-plugin) — the architecture that lets self-hosted users run the full platform for free
- [Self-Hosting Guide](/docs/self-hosting) — Docker Compose setup, environment variables, and upgrade flow
- [Pricing](/pricing) — what the cloud edition adds on top (Free / Pro / Enterprise)
- [I Built an ETL Platform Solo](/blog/solo-etl-platform-18-phases) — how scope control kept the infrastructure this simple
