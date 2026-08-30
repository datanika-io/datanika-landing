---
title: "MongoDB `Authentication failed`: You're Authenticating Against the Wrong Database"
description: "Correct password, correct user, and MongoDB still rejects you. The database in your connection URI doubles as the auth database — here is what that means and how to fix it."
date: 2026-08-30
publishedAt: 2026-08-30
author: "Datanika Team"
category: "engineering"
tags: ["mongodb", "connectors", "troubleshooting", "dlt", "open-source"]
---

You have a MongoDB user. You created it yourself. You can paste the password into `mongosh` and get a shell. Then you put the same credentials into an application, a BI tool, or an ELT connector, and get:

```
pymongo.errors.OperationFailure: Authentication failed.
```

The credentials are fine. The problem is that you and MongoDB disagree about **which database the user lives in**.

## The database in the URI is also the auth database

Here is the connection string almost everyone writes:

```
mongodb://analytics_ro:s3cret@mongo.internal:27017/production
```

Read that as a human and it says: *connect to the `production` database as `analytics_ro`*. Read it as MongoDB does and it says something extra — *and look for `analytics_ro` **inside** `production`*.

The database component of a MongoDB URI serves double duty. It names the default database for operations **and** the authentication database, unless you override the second with `authSource`. The rule in the connection-string spec is:

- `authSource` given → use it.
- Not given, but a database is in the path → **use the path database**.
- Not given and no database in the path → use `admin`.

Almost every real connection string has a database in the path. So almost every real connection string silently opts into the middle rule.

## Why this hits nearly everyone

Because the place your user actually lives is `admin`, and you probably didn't choose that.

- The official MongoDB Docker image creates its user in `admin`. That is what `MONGO_INITDB_ROOT_USERNAME` does.
- MongoDB Atlas stores database users in `admin`.
- Every managed provider and essentially every "create a read-only user" tutorial starts with `use admin`.

So the default is a mismatch: your user is in `admin`, your data is in `production`, and your URI told the driver to look for the user in `production`. There is no user there. Authentication fails, correctly, and the error message tells you nothing about which database it searched.

## Confirming it in thirty seconds

`mongosh` takes the same flag, so you can isolate the variable without touching your application:

```bash
# Fails — looks for the user inside `production`
mongosh "mongodb://analytics_ro:s3cret@mongo.internal:27017/production"

# Works — looks for the user in `admin`
mongosh "mongodb://analytics_ro:s3cret@mongo.internal:27017/production?authSource=admin"
```

If the second one connects, you have your answer, and it was never a password problem.

You can also just ask where the user is:

```javascript
use admin
db.system.users.find({}, { user: 1, db: 1 })
```

The `db` field on each record is the authentication database. That is the value `authSource` needs.

## The fix

Append it to the URI:

```
mongodb://analytics_ro:s3cret@mongo.internal:27017/production?authSource=admin
```

Or pass it as a parameter, if your driver prefers that shape:

```python
MongoClient(
    host="mongo.internal",
    port=27017,
    username="analytics_ro",
    password="s3cret",
    authSource="admin",     # where the user lives
)["production"]             # what you want to read
```

Note what the two lines mean. `authSource` is *where the user is defined*; the database you select afterwards is *what you want to read*. Keeping them straight in your head is most of the battle.

If you use Atlas, the string it hands you already contains `authSource=admin` — which is why Atlas users often never learn this rule until the first time they hand-assemble a URI.

## Why this bug is so good at hiding

Here is the part that makes it survive code review, CI, and a local test run: **an unauthenticated `mongod` is completely unaffected.**

Start MongoDB with no `--auth`, connect with no credentials, and there is no authentication step to get wrong. Every query works. That is exactly what a developer laptop looks like, and exactly what a throwaway container in a test suite looks like.

The mismatch only appears against a server that actually enforces authentication — which is to say, only in staging and production, and only after everything has been signed off.

We know this shape well, because we shipped it. Our own MongoDB connector built `mongodb://user:pass@host:port/<target-db>` with no `authSource` and therefore could not authenticate against any standard deployment. It went unnoticed for the reason above: the instance it was developed against had no auth enabled. It was one of several connector defects we found and wrote up in [2,300 Passing Tests and a CSV That Loaded One Row](/blog/green-tests-broken-connectors/), and the rule that came out of that audit — *a connector is not done until a row has been observed in the destination* — is the one that catches this class.

## How Datanika handles it now

The MongoDB connection form has an **Auth Source** field. It defaults to `admin`.

That default is deliberate, and it is the opposite of the previous behaviour rather than a compatible extension of it. Defaulting to the target database would have been the backwards-compatible choice, and it would have meant the connector stayed broken for everyone who didn't already know about a field nobody had told them about. Defaulting to `admin` fixes the configuration almost everyone actually has. If you are the exception — your user really is defined inside the database you're reading — set **Auth Source** to that database name and you get the old behaviour back, explicitly.

The field is exposed rather than merely defaulted for the same reason: a setting with no surface is not a setting, it's a guess that happens to be right most of the time.

Full walkthrough in the [MongoDB setup guide](/docs/connectors/mongodb/), and the connector's capabilities and limits are on the [MongoDB connector page](/connectors/mongodb/).

> **One caveat we owe you, because it is live right now.** The **Test Connection** button does not yet read **Auth Source** — it still builds the URI the old way. So on a standard `admin`-user deployment you can see Test Connection fail on a connection whose runs succeed. Tracked as [core#625](https://github.com/datanika-io/datanika-core/issues/625); until it closes, trust the run, not the button. We would rather tell you that than let you conclude your credentials are wrong for a second time in one afternoon.

## The general version

The lesson generalises past MongoDB: **when a connection string has one slot doing two jobs, someone is going to configure one of them by accident.**

The database in a Mongo URI is a default database *and* an auth realm. A Postgres `search_path` is a resolution order *and* a write target. A `role` is often both an identity and a permission set. In every case the failure looks like a credentials problem, because the error is raised by the auth layer — and in every case checking the credentials is the one thing that will not help.

When authentication fails against credentials you are sure of, stop re-checking the password and start asking **what scope the server resolved them in**.

---

*Datanika is an open-source ELT platform — extraction, loading, transformation and scheduling in one UI. [Browse the connectors](/connectors/) or [self-host it](/docs/self-hosting/).*
