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
2. Fill in: **Connection Name**, **Host**, **Port** (default `27017`), **User**, **Password**, **Database**. Those five are the whole form for `mongodb`.
3. Authentication uses `admin` as the auth database. That is not a field you fill in — it is the built-in default, applied whenever the config does not say otherwise. It is the database your *user* is defined in, which is a different thing from the database you are *reading*, and if you followed Step 1 or used `MONGO_INITDB_ROOT_USERNAME`, your user is in `admin`. Background: [MongoDB `Authentication failed`](/blog/mongodb-authentication-failed-authsource/).
   > ⚠️ **If your user was created inside the target database rather than in `admin`, the structured form cannot express that** ([core#638](https://github.com/datanika-io/datanika-core/issues/638)). The setting exists — it is `auth_source` — but the `mongodb` form has no input for it, so the only way to set it is the **Use raw JSON** checkbox below the fields, adding `"auth_source": "<your-database>"` to the config by hand. And a connection saved that way loses the key the next time it is saved from the structured form, silently reverting authentication to `admin`. If that is your setup, keep the connection in raw-JSON mode.
4. Click **Test Connection**. It builds the URI exactly the way a run does, including `auth_source`, so its verdict now matches what a run will do ([core#625](https://github.com/datanika-io/datanika-core/issues/625), fixed).
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
**Almost always the auth database, not the password.** The database in a MongoDB URI doubles as the authentication database, so a URI that names `production` tells the driver to look for your user *inside* `production`. Users are conventionally created in `admin` — that is what Step 1 does, what `MONGO_INITDB_ROOT_USERNAME` does, and what every managed provider does. Datanika sends `authSource=admin` for you, so the common case needs no configuration at all.

**Confirm where your user actually lives**, from `mongosh`:

```javascript
use admin
db.system.users.find({}, { user: 1, db: 1 })
```

The `db` field on the record is your auth database. You can also isolate the question outside Datanika entirely — if this connects, the auth database is your answer:

```bash
mongosh "mongodb://<user>:<pass>@<host>:27017/<database>?authSource=admin"
```

**If that `db` is `admin`**, the default already matches and the fault is elsewhere — re-check the password, then the roles granted on the target database.

**If it is anything else**, you have hit [core#000](https://github.com/datanika-io/datanika-core/issues/638): the `mongodb` form has no input for `auth_source`, so tick **Use raw JSON** on the connection form and set the key by hand:

```json
{"host": "mongo.internal", "port": 27017, "user": "<user>", "password": "<pass>", "database": "<database>", "auth_source": "<your-database>"}
```

Keep it in raw-JSON mode afterwards. Saving that connection from the structured form drops the key without warning and authentication reverts to `admin`.

Full explanation of the underlying MongoDB behaviour: [MongoDB `Authentication failed`: You're Authenticating Against the Wrong Database](/blog/mongodb-authentication-failed-authsource/).

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
