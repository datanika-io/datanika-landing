---
title: "ClickHouse Speaks Two Protocols. Your Connection Test Speaks One."
description: "A green Test Connection to ClickHouse proves the HTTP interface works. A load also dials the native TCP port and reads INFORMATION_SCHEMA — two things the test never touches. Here is what each failure looks like and how to tell them apart."
date: 2026-09-26
publishedAt: 2026-09-26
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "clickhouse", "destinations", "troubleshooting", "elt"]
---

ClickHouse listens on two interfaces. The HTTP one answers on `8123`, or `8443` with TLS. The native TCP one answers on `9000`, or `9440` with TLS. They are different protocols on different ports, and a client that can reach one has proved nothing about the other.

That matters in Datanika because **Test Connection speaks HTTP and a destination load speaks both**. So the most confusing ClickHouse failure is also the most common one: a green connection test, then a run that creates its tables and dies partway through.

This post is the map of that failure. The click-by-click setup is in the [ClickHouse setup guide](/docs/connectors/clickhouse); the field-by-field reference is on the [ClickHouse connector page](/connectors/clickhouse).

## One port field, two ports

The Datanika connection form has a single **Port** field, and it is the **HTTP** port. There is no second field for the native port — Datanika derives that one from the **Use HTTPS (TLS)** checkbox: `9000` when it is unticked, `9440` when it is ticked.

A destination load then uses both:

| step | protocol | port |
| --- | --- | --- |
| Test Connection (`SELECT 1`) | HTTP | the one you typed |
| the load's file step | HTTP | the one you typed |
| the load's `sync` step | native TCP | derived from the TLS checkbox |

Open only the HTTP port between Datanika and the server and you get a green test, a set of created tables, and a run that fails at `step=sync`. Nothing about the test was wrong. It measured the interface it speaks.

As a **source**, ClickHouse speaks HTTP only, so the port you type is the only one that matters in that direction. All of the above is about the destination side.

### If you once typed the native port to make loads work

Earlier builds passed the stored port straight through as the native one, so putting `9000` or `9440` in **Port** was the only way past the `sync` step. Datanika now reads that field as the HTTP port and derives the native one, which means a connection still holding `9000`/`9440` there points the HTTP client at the native interface and stops loading.

Editing the port on the connection is the entire fix. Nothing needs recreating.

## What each failure actually says

The useful thing about this class of bug is that ClickHouse is unusually talkative about it.

**Wrong port in the form.** ClickHouse answers over HTTP and names the right port itself. Measured against a stock 24.8 server with `9000` in the field:

```
Connection failed — check your credentials and network settings:
HTTP driver received HTTP status 400, server response:
Port 9000 is for clickhouse-client program You must use port 8123 for HTTP.
```

That is a server talking, not a timeout. Set the port to `8123`, or `8443` with **Use HTTPS (TLS)** ticked.

**Native port blocked or remapped.** Test Connection is green; the run fails at `step=sync`. Open `9000`/`9440` between Datanika and the server. If your server's native port has been remapped to something else entirely, that cannot be expressed on the form — move the server back to a default native port, or use the connection as a source only.

**Host unreachable at all.** `Test connection failed: Connection timed out`. For ClickHouse Cloud this is usually the service's IP access list; for self-hosted it is a firewall rule on the HTTP port.

## The other green test that hides a red run

There is a second way to pass the test and fail the load, and it has nothing to do with ports.

The loader reads column types out of `INFORMATION_SCHEMA` before it writes. Grant the obvious permissions and nothing else, and Test Connection is still green while the first run fails at `step=load`:

```
Code: 497 … datanika_loader: Not enough privileges … ON INFORMATION_SCHEMA.COLUMNS
```

What the destination is left holding is one empty bookkeeping table and none of your data. The grant that prevents it:

```sql
GRANT SELECT, INSERT, CREATE TABLE, ALTER TABLE, DROP TABLE
  ON raw_data.* TO datanika_loader;
GRANT SELECT ON INFORMATION_SCHEMA.* TO datanika_loader;
```

**Case matters, and it is the part people lose an afternoon to.** ClickHouse exposes `INFORMATION_SCHEMA` and `information_schema` as two *different* databases, and a grant on one does not cover the other. The uppercase form above is the one the loader needs; granting only the lowercase spelling leaves the run failing exactly as before. Measured on ClickHouse 24.8.

## Reading the result instead of the badge

All three failures above share a shape: something green certified a narrower thing than the reader assumed it did. We have [written before about connector tests that pass while the connector is broken](/blog/green-tests-broken-connectors/), and ClickHouse is the clearest instance of it we ship.

So the habit worth building is to check the destination rather than the status badge. After a run, in ClickHouse itself:

```sql
SELECT name FROM system.tables WHERE database = 'raw_data' ORDER BY name;
SELECT count() FROM raw_data.`<upload>___<table>`;
```

Two things about what you will see there. ClickHouse has no schemas, so an upload cannot land in one named after itself — everything goes into the database on the connection, with the upload name folded into each table name as `<upload>___<table>`. And dlt writes its own `____dlt_loads`, `____dlt_pipeline_state` and `____dlt_version` bookkeeping tables alongside yours. Seeing only your own tables listed in Datanika is correct, not a partial load.

A green run means the load finished. Whether it moved what you meant is a question you ask the destination.

## Related

- [ClickHouse setup guide](/docs/connectors/clickhouse) — the full walk-through, including the loader user
- [ClickHouse connector reference](/connectors/clickhouse) — supported engines, ordering keys, load modes
- [Scheduling guide](/docs/scheduling-guide) — cron syntax, timezones and run-queue behaviour
