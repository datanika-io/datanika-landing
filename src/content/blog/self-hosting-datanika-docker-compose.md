---
title: "Self-Hosting Datanika with Docker Compose"
description: "Run the whole ELT + dbt + scheduling platform on your own box with one docker compose up. The 5-minute quick start, the config that actually matters, and an honest production checklist."
date: 2026-07-20
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "self-hosting", "docker", "open-source", "elt", "devops"]
heroImage: "/logo.png"
---

Most data platforms make self-hosting a footnote — a "contact sales for the on-prem option" link that goes nowhere, or an open-source core so stripped-down it's really just a demo for the paid cloud. Datanika's open-source core is the actual product: extract (`dlt`), transform (`dbt-core`), scheduling, a visual pipeline builder, all 36 connectors, multi-org RBAC, nine languages. It runs from one Docker Compose file, and self-hosting it costs **$0 forever** — the AGPL-3.0 core has no license key, no seat count, and no GB meter.

This is the walkthrough: what you get, the five-minute quick start, the configuration that actually matters, and — because this is the part most tutorials skip — an honest checklist for running it in production, where *you* own the pager.

## Why self-host at all

The [managed version at app.datanika.io](https://app.datanika.io/) exists because plenty of teams would rather not run infrastructure. Self-hosting is the right call when:

- **Data residency / compliance.** Your customer data never leaves your VPC. No third-party processor, no data-processing addendum to negotiate.
- **Cost at volume.** The managed plan meters bytes processed; self-hosted meters nothing. If you're moving terabytes a month, a $12 VPS beats any per-GB bill. (We did that math in [The Real Cost of Your Modern Data Stack](/blog/real-cost-modern-data-stack/).)
- **No vendor lock-in.** It's `dlt` + `dbt-core` under an open UI. If Datanika vanished tomorrow, your pipelines are standard dlt sources and dbt models — they keep running.
- **You already have infra.** A spare box, a Kubernetes cluster, a managed Postgres — drop Datanika next to them.

The tradeoff is real and we'll be straight about it below: self-hosting means you own upgrades, backups, and the 3 AM page when a disk fills up. For a lot of teams that's a fair trade. For some it isn't.

## Prerequisites

- **Docker Engine 24+** and **Docker Compose v2** (`docker compose`, not the old `docker-compose`)
- **4 GB RAM** minimum, **8 GB** recommended
- That's it. Postgres 16 and Redis 7 ship inside the Compose file — you don't install them separately unless you want to [bring your own](#bring-your-own-database).

## The five-minute quick start

```bash
git clone https://github.com/datanika-io/datanika-core.git
cd datanika-core
cp .env.example .env
# edit .env — at minimum set SECRET_KEY and ENCRYPTION_KEY (see below)
docker compose up -d
```

That's the whole thing. Compose pulls the images, starts four containers, and runs the database migrations on first boot. Give it a minute, then open:

- **`http://localhost:3000`** — the app (frontend)
- **`http://localhost:8000`** — the API

Create your account on the first-run screen and you're in. Your [first pipeline](/docs/getting-started/) — a source, a destination, a run — takes about five more minutes.

## What's actually running

Four containers, and it's worth knowing what each one does before you put it in production:

| Service | Image | Port | Job |
|---------|-------|------|-----|
| `app` | datanika | 3000, 8000 | The Reflex app — frontend + API in one process |
| `celery` | datanika | — | Background worker: runs your extracts, loads, and dbt builds |
| `postgres` | postgres:16 | 5432 | Application database (your orgs, connections, run history — **not** your warehouse) |
| `redis` | redis:7 | 6379 | Task broker for Celery + cache |

One thing that trips people up: **`postgres` here is Datanika's own metadata database, not your data warehouse.** Your extracted data lands wherever you point it — BigQuery, Snowflake, a separate Postgres, DuckDB on the same box. This container just holds Datanika's bookkeeping.

## The configuration that actually matters

Most of `.env` has sane defaults. Two variables you **must** set to real random values before anything touches production:

```bash
# JWT signing key — anyone who has this can forge login tokens
SECRET_KEY=$(openssl rand -hex 32)

# Fernet key — encrypts every stored connector credential at rest
ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
```

`ENCRYPTION_KEY` is the one to guard: it's the Fernet key Datanika uses to encrypt every source and destination credential in the metadata DB. **If you lose it, every stored credential becomes unrecoverable and you'll re-enter them all.** Back it up somewhere that isn't the same box.

The rest, with their defaults:

| Variable | What it's for | Default |
|----------|---------------|---------|
| `DATABASE_URL` | Metadata Postgres connection | `postgresql+asyncpg://datanika:datanika@postgres:5432/datanika` |
| `REDIS_URL` | Celery broker | `redis://redis:6379/0` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `EMAIL_FROM` | Email for run-failure alerts and invites | — |
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | Bot protection on signup (leave empty to disable) | — |

Configure SMTP if you want failure notifications — a self-hosted pipeline that fails silently is worse than no pipeline. Everything else can wait.

## Migrations and first boot

Migrations run automatically the first time the `app` container starts. If you ever need to run them by hand — say after pulling a new version — it's:

```bash
docker compose exec app alembic upgrade head
```

## Taking it to production (the honest part)

`docker compose up -d` gets you a working instance. It does **not** get you a production-grade one. Here's the checklist we'd actually run through, in order of how much it'll hurt to skip:

1. **Put a reverse proxy in front and terminate TLS.** Nginx or [Caddy](https://caddyserver.com/) (Caddy does automatic Let's Encrypt certs in about four lines). Bind the app containers to `127.0.0.1` and let the proxy be the only thing on `:443`. Never expose `:3000`/`:8000` to the internet directly.
2. **Back up the metadata Postgres.** A nightly `pg_dump` is the difference between "restore in ten minutes" and "rebuild every connection by hand." Ship it off the box:
   ```bash
   docker compose exec -T postgres pg_dump -U datanika datanika | gzip > datanika-$(date +%F).sql.gz
   ```
   Back up `ENCRYPTION_KEY` alongside it — a database dump full of credentials you can no longer decrypt is not a backup.
3. **Lock down the network.** Change the default Postgres/Redis passwords, restrict container ports to localhost, and put a firewall (ufw / security group) in front. Redis with no password on a public interface is a classic way to get owned.
4. **Point monitoring at it.** The Compose file ships optional Grafana + Prometheus profiles; wire them up or point your existing stack at the app's metrics. You want to know a pipeline is failing before your stakeholders tell you the dashboard is stale — the [Slack-alerts setup](/blog/slack-alerts-pipeline-failures/) is the fastest win here.
5. **Right-size the box.** 8 GB RAM / 4 vCPU is a comfortable floor for real workloads. Extract jobs are memory-hungry in bursts; Celery is where that shows up.

None of this is Datanika-specific — it's the standard "I now run a stateful service" checklist. But it's real work, and it's the honest cost of the $0 license.

## Bring your own database

The bundled Postgres and Redis are convenient for getting started and fine for a small single-box deploy. For anything you care about, point Datanika at managed instances instead — set `DATABASE_URL` and `REDIS_URL` to your managed endpoints and the bundled containers become dead weight you can remove from the Compose file. Managed Postgres gets you backups, failover, and point-in-time recovery without you building any of it.

## Upgrading

```bash
cd datanika-core
git pull origin master
docker compose up -d --build
```

The `app` container runs `alembic upgrade head` on startup, so migrations apply themselves. Pin to a tagged release rather than tracking `master` if you want change control — and take a `pg_dump` before every upgrade, because "roll back the database" is a lot easier than "figure out what the half-applied migration did."

## Kubernetes, if that's your world

A minimal Helm chart ships in-tree at `deploy/helm/datanika/` — same image, one `app` Deployment, one `celery` Deployment, optional ingress. A few sharp edges to know before you `helm install`: it needs a **ReadWriteMany** storage class (the `app` and `celery` pods share a `dbt_projects` volume), migrations run on every pod start (so keep `app.replicaCount=1` until an HA migration hook lands), and you should disable the bundled single-replica Postgres/Redis in favor of managed ones. The [self-hosting docs](/docs/self-hosting/) have the full `values.yaml` walkthrough.

## Self-hosted vs. managed — the honest split

Everything in the product is in the open-source core. What you're *not* getting by self-hosting:

- **Billing / metering** (Paddle integration) — irrelevant unless you're reselling
- **Managed infrastructure and automatic updates** — you run `git pull`
- **Priority support with an SLA**
- **SSO (SAML/OIDC)** — gated to the Enterprise plan on managed cloud, though the SSO code itself lives in the open-source core

If none of those matter to you, self-hosting isn't a downgrade — it's the same platform on your terms. This blog, and the pipelines behind it, run on exactly this stack.

## Where to go next

- **[Self-hosting docs](/docs/self-hosting/)** — the canonical reference: full env-var table, Helm `values.yaml`, production notes.
- **[Getting Started](/docs/getting-started/)** — your first source → destination → run.
- **[Architecture](/docs/architecture/)** — how `dlt`, `dbt-core`, Celery, and Reflex fit together.
- **[Browse all 36 connectors](/connectors/)** — 31 sources, 11 destinations, all included, no plan gating.
- **[The $12/mo stack](/blog/saas-12-euros/)** — the bill for running real software on one small VPS.

Clone it, run `docker compose up -d`, and you own your data pipeline stack end to end. Or if you'd rather we run it — [the managed free tier](https://app.datanika.io/) is one click and includes 10 GB/month.
