---
title: "Connect MongoDB to Datanika"
description: "Step-by-step guide to sync MongoDB into your warehouse with Datanika — create credentials, add the connection, pick collections, run, and schedule."
source: "mongodb"
source_name: "MongoDB"
category: "database"
verified_by: "product-ui"
verified_date: "2026-07-18"
related_use_cases:
  - "mongodb-to-snowflake"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

MongoDB is the most common NoSQL source our users sync into a relational warehouse. Datanika flattens nested BSON documents into tabular rows automatically, so your analytics team gets queryable tables without writing custom denormalization logic.

> **MongoDB is source-only.** You can extract data from MongoDB but can't use it as a destination in Datanika.

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected.
- **MongoDB 4.0+** with a user that has `read` role on the target database.
- Network reachability from Datanika to the MongoDB host (typically port `27017`).

## Step 1 — Create credentials in MongoDB

1. Connect to your MongoDB instance:
   ```bash
   mongosh "mongodb://<host>:27017"
   ```
2. Create a read-only user:
   ```javascript
   use admin
   db.createUser({
     user: "datanika_readonly",
     pwd: "<strong-password>",
     roles: [{ role: "read", db: "<your-database>" }]
   })
   ```
3. Copy the host, port, database, username, and password.

> **Least privilege.** The `read` role is sufficient. Datanika never writes to MongoDB.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`** and pick `mongodb` from the type dropdown at the top of the inline New Connection form.
2. Fill in: **Connection Name**, **Host**, **Port** (default `27017`), **User**, **Password**, **Database**.
3. Click **Test Connection** — for a reachable database you'll see a success message.
4. Click **Create Connection**.

![Adding MongoDB in Datanika](/docs/connectors/mongodb/02-add-connection.png)

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `mongo-daily-sync` becomes `mongodailysync`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the MongoDB connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. **Collection Names (optional, comma-separated)** — an input placeholdered `users, orders (leave empty for all collections)`. Name the collections you want, comma-separated. Leave it empty to load **every** collection in the database.
5. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a MongoDB source, and that is deliberate.** Those controls are rendered only when the source is a SQL database.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Catalog** and browse the landed tables. The upload lands them in a schema **named after the upload** — `mongodailysync` creates schema `mongodailysync` in the destination, next to dlt's `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `mongodailysync`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

### `Authentication failed`
**Fix.** Verify the user was created in the `admin` database (or the auth database your cluster uses) and that the password is correct.

### Connection hangs or times out
**Fix.** MongoDB Atlas requires allowlisting IPs. Add Datanika's egress IPs. For self-hosted MongoDB, check firewall rules on port `27017`.

### Nested documents land as JSON strings instead of columns
**Fix.** This shouldn't happen with dlt's default flattening. If it does, check that the `batch_size` config isn't set too low — very small batches can sometimes affect schema inference.

## Related

- **Use cases:** [MongoDB → Snowflake](/use-cases/mongodb-to-snowflake)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** [Transformations guide](/docs/transformations-guide)
- **Connector reference:** [MongoDB connector spec](/connectors/mongodb)
