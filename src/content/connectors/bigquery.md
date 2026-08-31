---
title: "Load Data into BigQuery with Datanika"
description: "Step-by-step guide to set up BigQuery as a destination in Datanika — create a service account, add the connection, configure a pipeline, run, and schedule."
source: "bigquery"
source_name: "BigQuery"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-19"
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

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `bigquery`.
3. Fill in the form:
   - **Connection Name** — e.g. `bigquery-prod` or `bigquery-analytics`.
   - **GCP Project ID** — the project ID (not the display name). Find it in the GCP Console → Dashboard → Project info, e.g. `my-company-prod-12345`.
   - **Dataset** — the BigQuery dataset where tables will be created (e.g. `raw_data`). Datanika creates it if it doesn't exist yet.
   - **Service Account JSON** (optional) — paste the entire contents of the JSON key file from Step 1. If you leave this empty, Datanika falls back to Application Default Credentials (ADC) — useful when running self-hosted Datanika on a GCE instance with the service account attached directly.
4. Click **Test Connection**. Datanika verifies it can reach BigQuery with the provided credentials. You should see a green ✅.
5. Click **Create Connection**.

![Adding BigQuery as a destination in Datanika](/docs/connectors/bigquery/02-add-connection.png)

> **Test connection works for BigQuery.** Unlike HTTP-API sources (Stripe, GitHub), BigQuery exposes a SQL interface that Datanika can validate immediately. If Test fails, jump to [Troubleshooting](#troubleshooting).

## Step 3 — Use BigQuery as a destination

A destination is chosen per **upload**, at **`/uploads`** — not on the connection, and not on a pipeline page. There is no "Configure pipeline" button; `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type) and an optional **Description**.
3. Pick the **Source connection** you want to read from, and set the **Destination connection** to the BigQuery connection from Step 2. Each picker opens a dialog listing entries as `17 — mywarehouse (bigquery)`, i.e. id, name, type.
4. **What else the form shows depends on the *source*, not on BigQuery.** **Load Mode**, **Write Disposition**, **Source schema** and **Table names** appear only when the source is a SQL database; for a file, SaaS, MongoDB, Google Sheets, REST or Kafka source they are hidden and the load takes whatever shape the source produces. BigQuery honours what it is handed either way.
5. Click **Create Upload**. It appears in the table below with status `draft`.

![The New Upload form with BigQuery as the destination](/docs/connectors/bigquery/03-configure-upload.png)

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `warehousedailyload` creates schema `warehousedailyload` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `warehousedailyload`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

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
