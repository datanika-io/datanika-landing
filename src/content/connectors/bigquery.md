---
title: "Load Data into BigQuery with Datanika"
description: "Step-by-step guide to set up BigQuery as a destination in Datanika — create a service account, add the connection, configure a pipeline, run, and schedule."
source: "bigquery"
source_name: "BigQuery"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases:
  - "postgresql-to-bigquery"
  - "stripe-to-bigquery"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

BigQuery is the most requested warehouse destination on Datanika — and the highest-volume connector keyword in search. This guide walks you end-to-end: create a dedicated service account in GCP, wire it into Datanika as a destination, configure a pipeline from any source (Postgres, Stripe, CSV, etc.) to BigQuery, run the first load, and put it on a schedule.

> **BigQuery is a destination, not a source.** In Datanika, BigQuery receives data — it's where your raw tables land. To extract data *from* a source, you'll set up a source connection separately (e.g., [PostgreSQL](/docs/connectors/postgresql), [Stripe](/docs/connectors/stripe)). This guide covers the destination side.

> **Looking for the connector spec?** For the full field-by-field reference — supported regions, partitioning, clustering, load modes — see the [BigQuery connector page](/connectors/bigquery).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **GCP project** with the BigQuery API enabled. If you're starting from scratch: [console.cloud.google.com](https://console.cloud.google.com/) → create project → enable BigQuery API.
- A **source connection** already set up in Datanika (e.g., PostgreSQL, Stripe, CSV). BigQuery is destination-only — you need something to pipe data *from*.
- **IAM permissions** to create service accounts and grant BigQuery roles in the target GCP project (typically `roles/iam.serviceAccountAdmin` + `roles/bigquery.admin`, or project Owner).

## Step 1 — Create a service account in GCP

Create a **dedicated service account** rather than reusing a personal account or the default Compute Engine SA. This keeps permissions scoped, auditable, and revocable.

1. Open the GCP Console and go to **IAM & Admin → Service Accounts**.
2. Click **+ Create Service Account**.
3. Name it something recognizable, e.g. `datanika-loader`.
4. Grant it the following roles on the target project:
   - **BigQuery Data Editor** (`roles/bigquery.dataEditor`) — lets Datanika create datasets, create/update tables, and load data.
   - **BigQuery Job User** (`roles/bigquery.jobUser`) — lets Datanika run load jobs.
5. Click **Done**, then open the service account you just created.
6. Go to **Keys → Add Key → Create new key → JSON**.
7. Download the JSON key file. **This is the credential Datanika will use.** Store it securely — anyone with this file can write to your BigQuery project.

> **Least privilege.** `BigQuery Data Editor` + `BigQuery Job User` is the minimum set. Do not grant `BigQuery Admin` — Datanika doesn't need to delete datasets or manage access policies.

![Creating the service account in GCP](/docs/connectors/bigquery/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **Connections → New connection**.
2. Pick **BigQuery** from the connector list.
3. Fill in the form:
   - **Name** — e.g. `bigquery-prod` or `bigquery-analytics`.
   - **GCP Project** — the project ID (not the display name). Find it in the GCP Console → Dashboard → Project info, e.g. `my-company-prod-12345`.
   - **Dataset** — the BigQuery dataset where tables will be created (e.g. `raw_data`). Datanika creates it if it doesn't exist yet.
   - **Service Account JSON** (optional) — paste the entire contents of the JSON key file from Step 1. If you leave this empty, Datanika falls back to Application Default Credentials (ADC) — useful when running self-hosted Datanika on a GCE instance with the service account attached directly.
4. Click **Test connection**. Datanika verifies it can reach BigQuery with the provided credentials. You should see a green ✅.
5. Click **Save**.

![Adding BigQuery as a destination in Datanika](/docs/connectors/bigquery/02-add-connection.png)

> **Test connection works for BigQuery.** Unlike HTTP-API sources (Stripe, GitHub), BigQuery exposes a SQL interface that Datanika can validate immediately. If Test fails, jump to [Troubleshooting](#troubleshooting).

## Step 3 — Configure a pipeline to BigQuery

1. Open the **source connection** you want to pipe data from (e.g., your Postgres or Stripe source) and click **Configure pipeline**.
2. Pick **BigQuery** as the destination warehouse.
3. Choose a **target schema (dataset)**. We recommend a dataset name that reflects the source — e.g. `raw_postgres`, `raw_stripe` — so it's obvious where the data came from. Keep raw landing data separated from modeled data.
4. Select the tables/endpoints to sync from the source. For each:
   - **Write disposition** — `replace` (full refresh) or `merge` (incremental upsert).
   - **Primary key** — required for `merge`.
   - **Incremental cursor** — a monotonically increasing column (e.g. `updated_at`).
5. Save the pipeline configuration.

> **Tip.** BigQuery charges by bytes scanned for queries and by bytes stored. Use `merge` with an incremental cursor for large tables — it avoids rewriting the full table on every run, keeping both storage and query costs predictable.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. dlt uses BigQuery load jobs under the hood — these are fast and parallelized by default.
3. When the run finishes, open **Catalog → BigQuery → `raw_<source>`** to browse the landed tables.
4. Spot-check in the BigQuery Console: `SELECT count(*) FROM \`<project>.<dataset>.<table>\`;` should match the row count Datanika reports.
5. Check the BigQuery Console → **Job history** to confirm the load jobs ran under the `datanika-loader` service account.

![First run landing data in BigQuery](/docs/connectors/bigquery/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence:
   - **Hourly** — operational dashboards, reverse-ETL downstream.
   - **Every 6 hours** — standard analytics reporting.
   - **Daily at 03:00** — full warehouse refresh, cost-optimized (BigQuery flat-rate slots are cheaper off-peak).
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications** so broken runs surface before dashboards go stale.

> **Cost tip.** If you're on BigQuery on-demand pricing, schedule bulk loads during off-peak hours and use `merge` for incremental tables. This minimizes the bytes processed by downstream queries that scan the latest partition.

![Configuring the schedule](/docs/connectors/bigquery/05-schedule.png)

## Troubleshooting

### `Test connection failed: 403 Access Denied`
**Cause.** The service account is missing `BigQuery Data Editor` or `BigQuery Job User` on the target project, or the project ID in the form doesn't match the project where the roles were granted.
**Fix.** Open IAM & Admin → IAM in the GCP Console. Find the `datanika-loader` service account and verify both roles are present on the correct project. If you have multiple GCP projects, double-check the project ID in the Datanika connection form.

### `Test connection failed: Could not parse service account JSON`
**Cause.** The JSON pasted into the Service Account JSON field is malformed — typically a missing closing brace, or the key was pasted as a file path instead of the file contents.
**Fix.** Open the downloaded `.json` key file in a text editor, select all, copy, and paste the entire contents. The JSON should start with `{"type": "service_account", ...}`.

### `Dataset not found`
**Cause.** The dataset name in the form doesn't exist and Datanika couldn't create it — usually because the service account lacks `bigquery.datasets.create` permission (included in `BigQuery Data Editor` at the project level, but not if the role was granted at the dataset level only).
**Fix.** Either create the dataset manually in the BigQuery Console, or grant `BigQuery Data Editor` at the project level (not just on an existing dataset).

### Run succeeds but BigQuery shows 0 rows
**Cause.** The source query returned no data — common when using an incremental cursor with a `start_date` that's in the future, or when the source table is genuinely empty.
**Fix.** Check the source connection: run a manual query or spot-check in the source system. If using incremental with `start_date`, try clearing it for one full-refresh run.

### Costs are higher than expected
**Cause.** Using `replace` (full refresh) on large tables means every run rewrites the entire table and downstream queries re-scan everything.
**Fix.** Switch to `merge` with an incremental cursor. For partitioned tables, dlt automatically writes to the latest partition — downstream queries that filter by partition column scan far fewer bytes.

### `Quota exceeded: Too many table update operations`
**Cause.** BigQuery limits table DML operations to ~1,500/day per table. Very frequent schedules (every few minutes) on many tables can hit this.
**Fix.** Reduce schedule frequency to hourly or coarser for bulk pipelines. For near-real-time, use BigQuery streaming inserts via a separate mechanism — Datanika's batch load pipeline is designed for bulk/periodic loads, not sub-minute streaming.

## Related

- **Use cases:** [PostgreSQL → BigQuery](/use-cases/postgresql-to-bigquery), [Stripe → BigQuery](/use-cases/stripe-to-bigquery), [MySQL → BigQuery](/use-cases/mysql-to-bigquery)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** starter staging models and BigQuery-specific materializations in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [BigQuery connector spec](/connectors/bigquery)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
