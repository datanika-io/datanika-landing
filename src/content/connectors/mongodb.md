---
title: "Connect MongoDB to Datanika"
description: "Step-by-step guide to sync MongoDB into your warehouse with Datanika — create credentials, add the connection, pick collections, run, and schedule."
source: "mongodb"
source_name: "MongoDB"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
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

![Creating the MongoDB user](/docs/connectors/mongodb/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. Open **Connections → New connection** and select **MongoDB**.
2. Fill in: **Name**, **Host**, **Port** (default `27017`), **Database**, **User**, **Password**.
3. Click **Save**.

> **MongoDB connections don't expose a "Test connection" button.** MongoDB is in Datanika's non-SQL connector category. Credentials are validated on the first pipeline run.

![Adding MongoDB in Datanika](/docs/connectors/mongodb/02-add-connection.png)

## Step 3 — Configure collections

1. Open the connection and click **Configure pipeline**.
2. Pick the destination warehouse and target schema (e.g. `raw_mongodb`).
3. Select the collections to sync. Datanika flattens nested documents into columns — nested objects become `parent__child` column names.
4. Set write disposition: `replace` for small collections, `merge` for large ones with an `_id`-based primary key.
5. Save.

## Step 4 — First run

1. Click **Run now** and watch the **Runs** tab.
2. Browse **Catalog → `raw_mongodb`** to verify flattened tables.
3. Check that nested fields appear as `parent__child` columns.

![First run](/docs/connectors/mongodb/04-first-run.png)

## Step 5 — Schedule it

Pick a cadence and save. MongoDB collections that grow via inserts work well with `merge` + `_id` as the primary key.

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
