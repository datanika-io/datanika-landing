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

> 🚫 **MongoDB Atlas does not work yet — read this before you start.** Datanika builds every MongoDB
> URI as a plain `mongodb://` string with no transport options, so the driver negotiates **no TLS at
> all**. Atlas requires TLS, so the connection fails during the handshake, before your credentials are
> ever checked. There is also no `mongodb+srv://` support, so the seedlist hostname Atlas hands you
> cannot be entered — the form takes **Host** and **Port** separately.
>
> **The rule, so you can check your own deployment: if the server requires TLS, Datanika cannot
> reach it yet.** Atlas always requires it. **Amazon DocumentDB** enables it by default — a cluster
> works here only if someone has explicitly set the `tls` cluster parameter to `disabled`. **Azure
> Cosmos DB's Mongo API** and any self-hosted `net.tls.mode: requireTLS` are out for the same reason.
> Both gaps are tracked as [core#626](https://github.com/datanika-io/datanika-core/issues/626); this
> note comes out when it closes. Nothing else on this page will help if TLS is required — the rest of
> the guide assumes a deployment reachable without it.

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected.
- **MongoDB 4.0+** with a user that has `read` role on the target database.
- A deployment that accepts **plaintext connections** — see the Atlas note above. TLS-required hosts
  are not supported yet ([core#626](https://github.com/datanika-io/datanika-core/issues/626)).
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
2. Fill in: **Connection Name**, **Host**, **Port** (default `27017`), **User**, **Password**, **Database**, **Auth Source**.
3. Leave **Auth Source** at its default of `admin` unless you know otherwise. It is the database your *user* is defined in, which is a different thing from the database you are *reading* — and if you followed Step 1, or used `MONGO_INITDB_ROOT_USERNAME`, your user is in `admin`. Set it to the database name only if the user was created inside the database itself. Background: [MongoDB `Authentication failed`](/blog/mongodb-authentication-failed-authsource/).
4. Click **Test Connection**.
   > ⚠️ **Test Connection does not read Auth Source yet** ([core#625](https://github.com/datanika-io/datanika-core/issues/625)). It builds the old-style URI, so on a standard `admin`-user deployment it can report `Connection failed` for a connection whose **runs work fine**. Until that lands, treat a failure here as inconclusive rather than as a verdict on your credentials — Step 4's first run is the real test.
5. Click **Create Connection**.

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
**Almost always `Auth Source`, not the password.** The database in a MongoDB URI doubles as the authentication database, so a connection that names `production` tells the driver to look for your user *inside* `production`. Users are conventionally created in `admin` — that is what Step 1 does, what `MONGO_INITDB_ROOT_USERNAME` does, and what every managed provider does.

**Fix.** Set **Auth Source** to the database the user was created in (`admin` for the setups above — it is the default). Confirm which one that is from `mongosh`:

```javascript
use admin
db.system.users.find({}, { user: 1, db: 1 })
```

The `db` field on the record is the value **Auth Source** needs. You can also isolate it outside Datanika entirely — if this connects, `Auth Source` is your answer:

```bash
mongosh "mongodb://<user>:<pass>@<host>:27017/<database>?authSource=admin"
```

Only after that comes back clean is it worth re-checking the password. Full explanation: [MongoDB `Authentication failed`: You're Authenticating Against the Wrong Database](/blog/mongodb-authentication-failed-authsource/).

> Note the Test Connection caveat in Step 2 above: that button does not read **Auth Source** yet ([core#625](https://github.com/datanika-io/datanika-core/issues/625)), so it can fail on a connection whose runs succeed.

### Connection hangs or times out
**Fix.** Check firewall rules on port `27017` between Datanika and the MongoDB host, and confirm `mongod` is bound to an interface Datanika can reach rather than `127.0.0.1` (`net.bindIp` in `mongod.conf`).

> **If the host requires TLS — Atlas, Cosmos DB's Mongo API, DocumentDB with its default `tls` setting, or a self-hosted `requireTLS` — stop here; an allowlist will not fix it.** Datanika does not negotiate TLS yet, so the connection cannot succeed no matter how the network is configured. See the note at the top of this guide; tracked as [core#626](https://github.com/datanika-io/datanika-core/issues/626). IP allowlisting is a step you would only reach *after* the transport worked.

### Nested documents land as JSON strings instead of columns
**Fix.** This shouldn't happen with dlt's default flattening. If it does, check that the `batch_size` config isn't set too low — very small batches can sometimes affect schema inference.

## Related

- **Use cases:** [MongoDB → Snowflake](/use-cases/mongodb-to-snowflake)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** [Transformations guide](/docs/transformations-guide)
- **Connector reference:** [MongoDB connector spec](/connectors/mongodb)
