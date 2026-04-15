---
title: "dlt and dbt Silently Filled My Disk. Here's the Cleanup System I Had to Build."
description: "dlt leaves orphaned pipeline dirs, dbt leaves stale target/ dirs. With per-tenant projects, multiply by N tenants. Here's the three-layer cleanup system that keeps disk usage predictable."
date: 2026-04-21
publishedAt: 2026-04-21
author: "Datanika Team"
category: "engineering"
tags: ["dlt", "dbt", "maintenance", "ops", "engineering"]
---

After running pipelines for a few days in production, disk usage was climbing steadily. Turns out both [dlt](https://dlthub.com) and [dbt](https://www.getdbt.com) leave temporary files everywhere, and neither cleans up after itself.

## The Problem

**dlt** creates a pipeline directory per run with state files, staging data, and load packages. If you use the same pipeline name, old state accumulates. If you use unique names — which [Datanika](https://datanika.io) does for concurrency safety — orphaned directories pile up.

**dbt** leaves compiled SQL, manifest files, and run results in `target/`. Every `dbt run` adds to it. With [per-tenant dbt projects](/blog/dbt-per-tenant) at `dbt_projects/tenant_{org_id}/`, multiply that by the number of active tenants.

On a single-tenant setup this is manageable. On a multi-tenant SaaS, it's a disk bomb.

## The Fix: Three Layers

### Layer 1: Cleanup in the task itself

Every pipeline and transformation Celery task has a `finally` block that calls the appropriate cleanup function:

- `cleanup_pipeline()` — removes dlt's working directory after the run completes
- `clean_target()` — wipes dbt's `target/` directory before each run starts

This catches the normal case: a run starts, finishes (or fails), and its temporary files are cleaned up in the same execution context.

### Layer 2: Hourly maintenance sweep

A dedicated Celery Beat task runs every hour and catches what the task-level cleanup misses — orphaned files from crashed runs, zombie directories from aborted tasks, accumulated state from edge cases:

| Sweep | Default threshold | What it cleans |
|-------|-------------------|---------------|
| `cleanup_orphaned_dlt_dirs` | 24 hours | dlt pipeline working directories older than threshold |
| `cleanup_dbt_targets` | 48 hours | dbt `target/` directories under `tenant_*/` older than threshold |
| `purge_old_runs` | 90 days | Soft-deletes `Run` records older than threshold |
| `cleanup_orphaned_archives` | — | Upload archive files with no matching DB record |

All thresholds are configurable via settings: `maintenance_dlt_max_age_hours`, `maintenance_dbt_max_age_hours`, `maintenance_run_retention_days`.

### Layer 3: Protecting active runs

The hourly sweep had a race condition in the first version — it could delete files from a pipeline that was still running. If a dlt run takes 2 hours and the sweep fires at hour 1.5, it would see a "stale" directory and nuke it.

Fix: the sweep checks for active runs before cleaning any tenant's directories. If `Run.status == 'running'` for any run associated with that tenant, its directories are skipped entirely. Simple, conservative, correct.

## The Config

Four settings, all tunable per deployment:

```python
# In .env or settings
MAINTENANCE_DLT_MAX_AGE_HOURS=24      # dlt orphaned dirs
MAINTENANCE_DBT_MAX_AGE_HOURS=48      # dbt target/ dirs
MAINTENANCE_RUN_RETENTION_DAYS=90     # old run records
```

Self-hosted users can adjust these based on disk size and run frequency. The defaults are conservative — 24 hours for dlt, 48 hours for dbt, 90 days for run history. On a busy system with hundreds of daily runs, you might want to tighten the dlt threshold to 12 hours.

## Why This Matters

This isn't exciting work. Nobody writes blog posts about temp file cleanup.

But if you're running dlt or dbt in production with any kind of frequency — especially in a [multi-tenant context](/blog/dbt-per-tenant) — you need something like this or you'll wake up to a full disk at 3 AM. The disk-full failure mode is particularly nasty because:

- PostgreSQL stops accepting writes
- dlt can't stage extracted data
- dbt can't write compiled SQL
- Celery tasks fail silently (no disk to write logs to)
- Even `docker logs` might not capture the error (log rotation relies on disk space)

The three-layer cleanup — in-task, hourly sweep, race-condition protection — keeps disk usage **predictable** regardless of tenant count or run frequency. On the [€12/mo Hetzner box](/blog/saas-12-euros), disk usage has been flat at ~20 GB for weeks, even with daily runs.

## Related

- [dbt Per-Tenant Architecture](/blog/dbt-per-tenant) — the `tenant_{org_id}/` pattern that makes this cleanup necessary
- [My SaaS Runs on €12 a Month](/blog/saas-12-euros) — the infrastructure that this cleanup protects
- [Architecture Overview](/docs/architecture) — where the maintenance Celery Beat task fits in the system
- [Self-Hosting Guide](/docs/self-hosting) — tuning these thresholds for your deployment
