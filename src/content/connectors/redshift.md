---
title: "Load Data into Amazon Redshift with Datanika"
description: "Step-by-step guide to set up Redshift as a destination in Datanika — create an IAM user or database user, add the connection, configure a pipeline, run, and schedule."
source: "redshift"
source_name: "Amazon Redshift"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases:
  - "postgresql-to-redshift"
  - "stripe-to-redshift"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Amazon Redshift is the default warehouse for teams already running on AWS. This guide walks you end-to-end: create a dedicated database user in Redshift, wire it into Datanika as a destination, configure a pipeline from any source (Postgres, Stripe, S3, etc.) to Redshift, run the first load, and put it on a schedule.

> **Redshift is a destination, not a source.** In Datanika, Redshift receives data — it's where your raw tables land. To extract data *from* a source, you'll set up a source connection separately (e.g., [PostgreSQL](/docs/connectors/postgresql), [Stripe](/docs/connectors/stripe)). This guide covers the destination side.

> **Looking for the connector spec?** For the full field-by-field reference — supported node types, sort keys, distribution styles, load modes — see the [Redshift connector page](/connectors/redshift).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- An **Amazon Redshift cluster** (provisioned or Serverless) that is running and accessible. If you're starting from scratch: [console.aws.amazon.com/redshiftv2](https://console.aws.amazon.com/redshiftv2/) → create cluster.
- A **source connection** already set up in Datanika (e.g., PostgreSQL, Stripe, CSV). Redshift is destination-only — you need something to pipe data *from*.
- **Credentials**: either an IAM user with Redshift permissions, or a Redshift database user with `CREATE` + `INSERT` on the target schema. The database-user path is simpler and what this guide covers.
- **Network reachability** from Datanika to your Redshift cluster. For Datanika Cloud, your cluster must be publicly accessible or you must allowlist our egress IPs in the VPC security group. Self-hosted Datanika just needs the container to reach the cluster endpoint.

## Step 1 — Create a database user in Redshift

Create a **dedicated loader user** rather than reusing an admin account. This keeps permissions scoped, audit trails clean, and lets you revoke access without affecting other workloads.

1. Connect to your Redshift cluster using the query editor in the AWS Console, or via `psql`:
   ```bash
   psql -h <cluster-endpoint> -U admin -d <database> -p 5439
   ```
2. Create a dedicated user:
   ```sql
   CREATE USER datanika_loader PASSWORD '<generate-a-strong-one>';
   ```
3. Create a schema for raw data (if it doesn't exist) and grant the minimum permissions:
   ```sql
   CREATE SCHEMA IF NOT EXISTS raw_data;
   GRANT USAGE ON SCHEMA raw_data TO datanika_loader;
   GRANT CREATE ON SCHEMA raw_data TO datanika_loader;
   ALTER DEFAULT PRIVILEGES IN SCHEMA raw_data
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO datanika_loader;
   ```
4. If you plan to use multiple landing schemas (e.g., `raw_postgres`, `raw_stripe`), repeat the `CREATE SCHEMA` and `GRANT` statements for each.

> **Least privilege.** Datanika needs `CREATE` (to create tables on first run) and DML permissions on the target schema. It does not need superuser, `CREATE DATABASE`, or access to other schemas. If you're asked for an admin password, something is wrong.

![Creating the loader user in Redshift](/docs/connectors/redshift/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **Connections → New connection**.
2. Pick **Amazon Redshift** from the connector list.
3. Fill in the form:
   - **Name** — e.g. `redshift-prod` or `redshift-analytics`.
   - **Host** — the cluster endpoint, e.g. `my-cluster.abc123.us-east-1.redshift.amazonaws.com`.
   - **Port** — `5439` (Redshift default).
   - **Database** — the database name, e.g. `dev` or `analytics`.
   - **User** — `datanika_loader`.
   - **Password** — the password from Step 1. Stored encrypted at rest with Fernet.
   - **Schema** — the default landing schema, e.g. `raw_data`. You can override this per pipeline.
4. Click **Test connection**. Datanika verifies it can connect and run a query against the cluster. You should see a green checkmark.
5. Click **Save**.

![Adding Redshift as a destination in Datanika](/docs/connectors/redshift/02-add-connection.png)

> **Test connection fails?** Jump to [Troubleshooting](#troubleshooting) — most first-time failures are security group rules or the cluster not being publicly accessible.

## Step 3 — Configure a pipeline to Redshift

1. Open the **source connection** you want to pipe data from (e.g., your Postgres or Stripe source) and click **Configure pipeline**.
2. Pick **Amazon Redshift** as the destination warehouse.
3. Choose a **target schema**. We recommend a schema name that reflects the source — e.g. `raw_postgres`, `raw_stripe` — so it's obvious where the data came from. Keep raw landing data separated from modeled data.
4. Select the tables/endpoints to sync from the source. For each:
   - **Write disposition** — `replace` (full refresh) or `merge` (incremental upsert).
   - **Primary key** — required for `merge`.
   - **Incremental cursor** — a monotonically increasing column (e.g. `updated_at`).
5. Save the pipeline configuration.

> **Tip.** Redshift performs best with bulk loads. Use `merge` with an incremental cursor for large tables to avoid rewriting the full table on every run. dlt uses Redshift's `COPY` command under the hood for fast parallel loads.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. dlt stages data in S3 (or local temp files for self-hosted) and uses Redshift `COPY` for fast bulk loading.
3. When the run finishes, open **Catalog → Redshift → `raw_<source>`** to browse the landed tables.
4. Spot-check in the Redshift query editor: `SELECT count(*) FROM raw_postgres.orders;` should match the row count Datanika reports.
5. Check **SVL_QUERY_SUMMARY** or the Redshift Console → Query monitoring to confirm the load queries ran under the `datanika_loader` user.

![First run landing data in Redshift](/docs/connectors/redshift/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence:
   - **Hourly** — operational dashboards, reverse-ETL downstream.
   - **Every 6 hours** — standard analytics reporting.
   - **Daily at 03:00** — full warehouse refresh, cost-optimized (Redshift Serverless auto-scales down during idle).
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications** so broken runs surface before dashboards go stale.

> **Cost tip.** Redshift Serverless charges per RPU-second of compute. Schedule bulk loads during predictable windows so the cluster can scale down between runs. For provisioned clusters, align schedules with your WLM queue configuration to avoid contention with analyst queries.

![Configuring the schedule](/docs/connectors/redshift/05-schedule.png)

## Troubleshooting

### `Test connection failed: Connection timed out`
**Cause.** Datanika can't reach the Redshift cluster endpoint. Almost always a networking issue — the cluster isn't publicly accessible, or the VPC security group doesn't allow inbound on port 5439.
**Fix.** Check, in order: (1) in the Redshift Console, verify the cluster's "Publicly accessible" setting matches your setup, (2) in the VPC security group, add an inbound rule allowing TCP 5439 from Datanika's egress IPs (see [Self-hosting & network](/docs/self-hosting#egress-ips)), (3) if using VPC peering or PrivateLink, confirm the route tables and DNS resolution are correct.

### `FATAL: password authentication failed for user "datanika_loader"`
**Cause.** Wrong password, or the user was created in a different database.
**Fix.** Connect as admin and reset the password: `ALTER USER datanika_loader PASSWORD '<new>';`. Remember that Redshift users are cluster-wide but schema grants are per-database.

### `permission denied for schema raw_data`
**Cause.** The `datanika_loader` user is missing `USAGE` or `CREATE` on the target schema.
**Fix.** Run the `GRANT USAGE ON SCHEMA` and `GRANT CREATE ON SCHEMA` statements from Step 1. If the schema was created by a different user, also run `ALTER SCHEMA raw_data OWNER TO datanika_loader;` or grant explicit DML privileges.

### Run succeeds but Redshift shows 0 rows
**Cause.** The source query returned no data, or the load was committed to a different schema than you're querying.
**Fix.** Check the schema name in both the pipeline configuration and your query. Redshift's `search_path` defaults to `$user, public` — if you're querying unqualified table names, you may be looking in the wrong schema.

### Loads are slower than expected
**Cause.** dlt defaults to staging data locally before `COPY`. For large datasets, the staging + upload step can be a bottleneck.
**Fix.** For Datanika Cloud, data is staged in our managed S3 bucket and `COPY`d directly — no action needed. For self-hosted, ensure Datanika has access to an S3 bucket in the same region as your Redshift cluster, and configure it in the pipeline's advanced settings. Cross-region `COPY` is significantly slower.

### `Disk full` or `out of storage` errors
**Cause.** Provisioned Redshift clusters have fixed disk. Using `replace` on large tables or running many pipelines can exhaust storage.
**Fix.** Switch to `merge` (incremental) to avoid full table rewrites. Run `VACUUM DELETE ONLY` to reclaim space from deleted rows. For persistent storage pressure, resize the cluster or migrate to Redshift Serverless (managed storage, auto-scales).

## Related

- **Use cases:** [PostgreSQL → Redshift](/use-cases/postgresql-to-redshift), [Stripe → Redshift](/use-cases/stripe-to-redshift)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** starter staging models and Redshift-specific materializations (sort keys, dist keys) in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Redshift connector spec](/connectors/redshift)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
