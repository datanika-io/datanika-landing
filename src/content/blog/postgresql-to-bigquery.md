---
title: "PostgreSQL to BigQuery in 5 Minutes with Datanika"
description: "Step-by-step guide to replicating your PostgreSQL database to Google BigQuery for analytics — no code, no Kubernetes, no YAML."
date: 2026-04-10
updatedDate: 2026-04-10
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "postgresql", "bigquery", "getting-started"]
heroImage: "/logo.png"
---

## The Problem

Your PostgreSQL database is great for running your app, but running heavy analytical queries against it slows down production. You need to replicate your data to a warehouse — but setting up Airbyte (Kubernetes required), writing custom scripts, or configuring Fivetran ($250+/mo) feels like overkill for what should be simple.

## The Solution

Datanika loads your PostgreSQL data into BigQuery using [dlt](https://dlthub.com) under the hood — with automatic schema mapping, incremental loading, and zero YAML configuration. Here's how to set it up.

## Step 1: Sign Up

Go to [app.datanika.io](https://app.datanika.io) and create a free account. You can sign up with email or use Google/GitHub social login.

## Step 2: Add PostgreSQL as a Source

1. Click **Connections** in the sidebar
2. Click **New Connection**
3. Select **PostgreSQL** as the type
4. Enter your credentials:
   - **Host**: your database hostname (e.g., `db.example.com`)
   - **Port**: `5432`
   - **Database**: your database name
   - **Username**: a read-only user (recommended)
   - **Password**: the password

All credentials are encrypted at rest with Fernet encryption before being stored.

**Tip**: Create a read-only PostgreSQL user for Datanika to avoid any risk to your production data:
```sql
CREATE USER datanika_reader WITH PASSWORD 'your_secure_password';
GRANT CONNECT ON DATABASE your_db TO datanika_reader;
GRANT USAGE ON SCHEMA public TO datanika_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO datanika_reader;
```

## Step 3: Add BigQuery as a Destination

1. Click **New Connection** again
2. Select **BigQuery**
3. Upload your Google Cloud service account JSON key
4. Enter your **Project ID** and **Dataset** name (e.g., `analytics`)
5. Choose a **Location** (e.g., `US` or `EU`)

**Tip**: Create a dedicated service account with only BigQuery Data Editor and BigQuery Job User roles.

## Step 4: Create an Upload

1. Click **Uploads** in the sidebar
2. Click **New Upload**
3. Select your PostgreSQL connection as the **Source**
4. Select your BigQuery connection as the **Destination**
5. Choose a load mode:
   - **Full database**: replicate all tables
   - **Single table**: pick specific tables to load
6. Set a **schema name** for the destination (e.g., `raw_postgres`)

## Step 5: Run It

Click **Run**. Datanika uses dlt to:
1. Connect to PostgreSQL and read your table schemas
2. Extract data in batches
3. Map PostgreSQL types to BigQuery types automatically
4. Load data into your BigQuery dataset

You can watch the progress in real time with streaming logs. A typical small database (< 1GB) loads in under 2 minutes.

## Step 6: Transform with dbt (Optional)

Now that your raw data is in BigQuery, you can write SQL transformations:

1. Click **Transformations** > **New Transformation**
2. Write a SQL model:

```sql
-- stg_orders: clean and type-cast raw order data
SELECT
    id AS order_id,
    customer_id,
    CAST(total_amount AS NUMERIC) AS amount,
    DATE(created_at) AS order_date,
    status
FROM {{ source('raw_postgres', 'orders') }}
WHERE status != 'cancelled'
```

3. Set materialization to `table` or `incremental`
4. Click **Run** to create the table in BigQuery

## Step 7: Schedule Daily Syncs

1. Click **Scheduling** > **New Schedule**
2. Select your upload
3. Set a cron expression: `0 6 * * *` (daily at 6 AM UTC)
4. Enable it

Your PostgreSQL data will automatically sync to BigQuery every morning. If you added transformations, create a second schedule for your pipeline that depends on the upload — Datanika's DAG ensures transforms run only after the data is loaded.

## What You Get

- **Fresh analytics data** in BigQuery every day (or every hour — your choice)
- **No impact on production** — reads from a read-only user
- **Automatic schema mapping** — dlt handles type conversion
- **Incremental loading** — only sync new/changed rows (configurable)
- **dbt transforms** — build staging, intermediate, and mart layers right in Datanika
- **Monitoring** — see every run's status, duration, and row counts

## Cost

Datanika's Free plan includes 500 model runs per month — enough for daily syncs of a small database. Pro ($79/mo) bumps that to 15,000 runs for larger workloads.

Compare that to Fivetran ($250+/mo for a few connectors) or Airbyte Cloud ($10/mo minimum per connection + credit costs).

## Next Steps

- [View all 32 connectors](/connectors) — MySQL, MongoDB, Stripe, HubSpot, and more
- [Write dbt transformations](/docs/transformations-guide) — models, tests, snapshots
- [Set up Slack alerts](/blog/slack-alerts-pipeline-failures) — get notified when runs fail
- [Self-host with Docker](/docs/self-hosting) — run Datanika on your own infrastructure

[Start free at app.datanika.io](https://app.datanika.io)
