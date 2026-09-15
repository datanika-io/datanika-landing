---
title: "Test Connection Has Three Answers, and \"Not Tested\" Is One of Them"
description: "Green means your source answered. Red means it did not, and the message carries the driver's own reason. Gray means Datanika did not try, and says why. What the button does for each kind of connector, and what a green result cannot tell you."
date: 2026-10-13
publishedAt: 2026-10-13
author: "Datanika Team"
category: "product"
tags: ["product", "connections", "troubleshooting", "data-pipelines"]
---

When you add a connection in Datanika, **Test Connection** is the only check that runs before any data moves. After that, the next check is the first run. For a scheduled upload that can be hours later, and it arrives as a failed run rather than as a message on the form you are still looking at.

So the button has to answer honestly, and it has three answers:

| result | what it means |
|---|---|
| **green** | Datanika reached the source with these settings, and the source answered |
| **red** | it tried, and the source refused or could not be reached. The message says why |
| **gray, "Not tested"** | it did not try, because there is no safe request to make. The message says why, and when your settings will be checked instead |

The gray answer is the newest, and it replaced something worse. Before it existed, twenty SaaS and API connector types showed a green result without making any request at all, so a revoked token looked exactly like a working one.

## What green means, connector by connector

"Can we reach it?" is a different question for a database, a folder of files and a SaaS API, so the button does something different for each.

| source | what Test Connection does | the green message |
|---|---|---|
| **Databases and warehouses**: MySQL, PostgreSQL, SQL Server and the rest | opens a session with your credentials and runs `SELECT 1`, with a five-second limit on opening the connection | *Connected successfully* |
| **MongoDB** | asks the server for its build information, which requires a real login, using the same connection address a run builds | *Connected successfully* |
| **CSV, JSON and Parquet files** | lists the location you gave it and looks for at least one file matching the type's pattern: `*.csv`, `*.json` or `*.parquet` | *Connected — found files matching \*.csv* |
| **SQLite and DuckDB files** (self-hosted) | checks that the file exists, then opens it and reads its list of tables | *Connected — read the database at '…'* |
| **14 SaaS apps**: Stripe, GitHub, HubSpot, Salesforce, Shopify, Jira, Slack, Facebook Ads, Zendesk, Airtable, Notion, Pipedrive, Freshdesk and Asana | makes one cheap authenticated request, usually to the vendor's "who am I" endpoint | *Credentials verified* |

Two of those rows hide a detail worth knowing.

**A database file is tested by reading its table list, not with `SELECT 1`.** SQLite answers `SELECT 1` for any readable file, including a text file renamed to `.sqlite`, because that query never reads a page of the database. Reading the table list forces it to. And because the button checks that the file exists before opening anything, testing a path where nothing exists cannot create an empty database there and then report having found it.

**Some SaaS APIs say no with HTTP 200.** Slack answers a bad token with `200` and `{"ok": false, "error": "invalid_auth"}` in the body, and Pipedrive carries a `success` flag. A check that read only the status code would call a dead token healthy, so for those two the body decides.

## What red means

A red result means the source refused the connection or could not be reached, and the message carries the driver's own reason, not just generic advice.

Here is what the button said during a walk of our MySQL setup guide, first with the password mistyped:

> Connection failed — check your credentials and network settings: (pymysql.err.OperationalError) (1045, "Access denied for user 'datanika_readonly'@'172.18.0.9' (using password: YES)") (Background on this error at: https://sqlalche.me/e/20/e3q8)

And with the right password but the wrong port:

> Connection failed — check your credentials and network settings: (pymysql.err.OperationalError) (2003, "Can't connect to MySQL server on 'mysql' ([Errno 111] Connection refused)") (Background on this error at: https://sqlalche.me/e/20/e3q8)

Both open with the same advice, because the button cannot know in advance which problem you have. The reason after the colon is what tells them apart: `1045 Access denied` sends you to the user and password, and `2003 Connection refused` sends you to the host, the port and the firewall. Both answers came back in under a second.

## What "Not tested" means

Six connector types get a gray result instead of a request. Each message gives the reason, and each one tells you the same thing about timing: your settings are checked on the first run.

| source | what the gray result says |
|---|---|
| **REST API** | *Without knowing which resources you want there is no endpoint we can safely call — resources are set on the upload, not the connection.* |
| **OpenAPI** | *Calling an endpoint from your spec could have side effects, so we do not choose one for you.* |
| **Google Sheets** | *Make sure you have shared the sheet with the service account — that is the step that usually fails.* |
| **Google Analytics** | *Make sure the service account has access to the property.* |
| **Google Ads** | *Google Ads credentials are checked on the first run.* |
| **Kafka** | *Kafka is not an HTTP service, so this button cannot reach your broker.* |

Gray is not a polite way of saying red. The connection may be perfectly good. Reporting a connection nobody checked as working, and reporting it as broken, are the same mistake made in opposite directions, so the button does neither.

If you are connecting Google Sheets, the step its message warns about is walked through in [the Google Sheets share step](/blog/google-sheets-share-step/). The [OpenAPI guide](/docs/connectors/openapi) quotes the sentence its form shows, and the [Kafka guide](/docs/connectors/kafka) explains why Kafka problems surface on the run instead.

## Two details that keep the answer honest

**A result disappears when you change a setting.** Edit the host, the password or any other connection field after testing, and the result is cleared, so a green earned by the old values cannot sit beside the new ones. The connection name is the one exception, because a name is a label and changes nothing about where Datanika connects.

**The connections list shows a result per row.** Each saved connection has its own **Test** action, and the row shows the answer as an icon: a check, a cross, or a dashed circle for "not tested". The sentence behind the dashed circle is in that icon's tooltip.

## What a green result does not tell you

Test Connection checks that the connection opens. It does not read your data.

- **For a database, green means the login works, not that every table is readable.** On the same MySQL walk, a user granted `SELECT` on one table out of four tested green just as fast as a user who could read all four. Which tables an upload can actually read is settled when it runs.
- **For a file source, green means at least one file matches the type's default pattern.** The pattern on your upload can be narrower, and that one is checked when the upload runs.
- **For a SaaS app, green means the credential was accepted by the one request the check makes.** A token can pass that request and still be refused by a particular resource on the run.

So after the first run, count the rows in the destination rather than trusting any green, including this one. Most of our connector setup guides end their first-run step with exactly that instruction. The [MySQL setup guide](/docs/connectors/mysql) walks the connection these messages came from, from the read-only user to the first run.
