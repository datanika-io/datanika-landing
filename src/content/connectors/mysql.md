---
title: "Connect MySQL to Datanika"
description: "Step-by-step guide to sync MySQL with Datanika — create a read-only user, add the connection, pick tables, run, and schedule."
source: "mysql"
source_name: "MySQL"
category: "database"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases:
  - "mysql-to-bigquery"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

MySQL is one of the most common operational databases our users sync into their warehouse. It works as both a source (extract data from MySQL) and a destination (load data into MySQL). This guide covers the most common use case: extracting data from MySQL into a cloud warehouse.

> **MySQL works as source AND destination.** Datanika auto-detects the direction. This guide focuses on MySQL as a *source*. If you're loading data *into* MySQL, the same connection works — just select MySQL as the destination when configuring a pipeline.

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika (BigQuery, Snowflake, PostgreSQL, etc.).
- **MySQL 5.7+** with network reachability from Datanika.
- Access to MySQL with permission to `CREATE USER` and `GRANT`.

## Step 1 — Create credentials in MySQL

1. Connect to MySQL as a superuser: `mysql -h <host> -u root -p`.
2. Create a dedicated read-only user:
   ```sql
   CREATE USER 'datanika_readonly'@'%' IDENTIFIED BY '<strong-password>';
   GRANT SELECT ON <database>.* TO 'datanika_readonly'@'%';
   FLUSH PRIVILEGES;
   ```
3. For future tables: `GRANT SELECT` applies only to existing tables. To cover tables created later, re-run the grant periodically or use a stored procedure.
4. Copy the host, port, username, password, and database name.

> **Least privilege.** Only grant `SELECT`. Datanika never needs write access to the source.

![Creating the MySQL user](/docs/connectors/mysql/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`** and pick **MySQL** from the type dropdown at the top of the inline New Connection form.
2. Fill in:
   - **Name** — e.g. `mysql-prod-readonly`
   - **Host / Port** — your MySQL server, default port `3306`
   - **Database** — the database to sync
   - **User / Password** — the `datanika_readonly` user from Step 1
3. Click **Test connection** — you should see green ✅.
4. Click **Save**.

![Adding MySQL in Datanika](/docs/connectors/mysql/02-add-connection.png)

## Step 3 — Configure tables and schemas

1. Open the connection and click **Configure pipeline**.
2. Pick the destination warehouse and target schema (e.g. `raw_mysql`).
3. Select tables and set write disposition (`replace` or `merge`) per table.
4. For `merge`: set the primary key and incremental cursor.
5. Save.

## Step 4 — First run

1. Click **Run now** and watch the **Runs** tab.
2. When done, browse **Catalog → `raw_mysql`** and spot-check row counts.

![First run](/docs/connectors/mysql/04-first-run.png)

## Step 5 — Schedule it

1. Click **Schedule**, pick a cadence (hourly, 6-hourly, or daily).
2. Wire up failure alerts in **Settings → Notifications**.

## Troubleshooting

### `Access denied for user 'datanika_readonly'`
**Fix.** Re-run the `GRANT SELECT` statement and `FLUSH PRIVILEGES`.

### Connection test times out
**Fix.** Check firewall rules and MySQL's `bind-address` config. Ensure Datanika's IP can reach the MySQL host on port 3306.

### `SSL connection error`
**Fix.** If MySQL requires SSL, ensure Datanika's connection uses `ssl_mode=REQUIRED`. For self-signed certs, you may need `ssl_mode=PREFERRED`.

## Related

- **Use cases:** [MySQL → BigQuery](/use-cases/mysql-to-bigquery)
- **Comparisons:** [Datanika vs Fivetran](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** [Transformations guide](/docs/transformations-guide)
- **Connector reference:** [MySQL connector spec](/connectors/mysql)
