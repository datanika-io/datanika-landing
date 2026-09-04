---
title: "Connect Apache Kafka to Datanika"
description: "Step-by-step guide to sync Kafka topics into your warehouse with Datanika — authenticate to the broker with SASL over TLS, add the connection, configure the pipeline, run, and schedule."
source: "kafka"
source_name: "Apache Kafka"
category: "api"
verified_by: "product-ui"
verified_date: "2026-07-19"
related_use_cases:
  - "kafka-to-clickhouse"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Apache Kafka is the backbone of most event-driven architectures — teams use Datanika to land Kafka topics in a warehouse for analytics, reporting, and ML feature stores without building custom consumers. This guide walks you end-to-end: authenticate to the broker, wire the connection into Datanika, run the first load, and put it on a schedule. Expect the first run to take minutes to hours depending on topic volume and retention.

> **Kafka is a source, not a destination.** In Datanika, Kafka is where data comes *from*. To load data *into* a warehouse, you'll set up a destination connection separately (e.g., [BigQuery](/docs/connectors/bigquery), [ClickHouse](/docs/connectors/clickhouse)). This guide covers the source side.

> **Looking for the connector spec?** For the full field-by-field reference — supported settings, consumer group behavior — see the [Kafka connector page](/connectors/kafka).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika (PostgreSQL, BigQuery, Snowflake, Redshift, ClickHouse, or DuckDB). Kafka is **source-only**.
- An **Apache Kafka cluster** — self-hosted, Confluent Cloud, Amazon MSK, Redpanda, or any Kafka-compatible broker. Minimum version: Kafka 2.0.
- **Network reachability** from Datanika to your Kafka bootstrap servers. For managed services, this means the cluster must be reachable over the internet or via VPC peering. Self-hosted Datanika just needs the container to reach the brokers.
- **Topic-level ACLs** granting the Datanika consumer `READ` on the topics you want to sync, plus `READ` on the consumer group.
- For an authenticated broker: a **SASL username and password** (on Confluent Cloud, an API key and secret).

> ⚠️ **Check your connection form before you follow the authentication steps.** Broker authentication is new. Open **`/connections`**, pick `kafka` in the type dropdown, and count the fields. **Three** — *Bootstrap Servers*, *Topics*, *Consumer Group ID* — means your deployment predates it, and only a PLAINTEXT broker will connect; **there is no raw-JSON workaround**, and the section below explains why the escape hatch refuses these keys rather than accepting them. **Seven** means you have it. Everything else on this page applies either way.

## Broker authentication

Datanika connects to SASL and TLS brokers using four optional fields **on the connection**:

| Field | Config key | Accepted values |
|---|---|---|
| Security Protocol | `security_protocol` | `PLAINTEXT`, `SSL`, `SASL_PLAINTEXT`, `SASL_SSL` (default `PLAINTEXT`) |
| SASL Mechanism | `sasl_mechanism` | `PLAIN`, `SCRAM-SHA-256`, `SCRAM-SHA-512` (default `PLAIN`) |
| SASL Username | `sasl_plain_username` | your SASL principal / API key |
| SASL Password | `sasl_plain_password` | the matching secret — stored encrypted |

For the managed tiers this unblocks:

- **Confluent Cloud** — `SASL_SSL` + `PLAIN`, with the API key as username and the API secret as password.
- **Redpanda Serverless** — `SASL_SSL` + `SCRAM-SHA-256`.
- **Aiven** and **Upstash** — `SASL_SSL`; check the console for the mechanism, both offer `SCRAM-SHA-256`.
- **Self-hosted on a private network** — leave all four blank. With no security fields set the consumer behaves exactly as it always did, so nothing changes for an existing PLAINTEXT connection.

> 🚨 **Credentials go on the connection, never in the pipeline config.** `security_protocol` and the three `sasl_*` keys are refused inside **Use raw JSON config** — the run stops with *"Kafka security settings belong on the connection, not in the pipeline config"* rather than silently ignoring them.
>
> This is a security boundary, not a preference. A connection's config is encrypted at rest, and its password field is stripped out of error messages and out of database backups. The pipeline config is a plain JSON column with none of that — so the convenient path is the one that would write a broker password in clear text into the database and into every backup, where nothing redacts it. The connector raises instead, and names the field it found.

> **Still not supported, so you don't discover it mid-migration:** mutual TLS (client certificates), a private or self-signed broker CA, `GSSAPI`/Kerberos, and `OAUTHBEARER`. TLS verification uses the system trust store, which is correct for every managed tier — all of them present publicly-trusted certificates — and wrong for a broker you signed yourself.
>
> This page previously documented a raw-JSON auth workaround. It was never functional and produced a crash rather than a connection ([#486](https://github.com/datanika-io/datanika-landing/issues/486)).

## Step 1 — Prepare the Kafka cluster

1. **Bootstrap server addresses** — the host:port pairs for your broker(s), e.g. `pkc-abc12.eu-central-1.aws.confluent.cloud:9092`. These must be the **advertised** listeners, and the port must match the protocol you chose: managed clusters publish their SASL_SSL listener on `:9092`, while a self-hosted broker often runs PLAINTEXT and SASL_SSL on different ports.
2. **Topic names** — the exact names of the topics you want to sync (e.g. `events`, `orders`). The Datanika form does **not** discover topics from the broker — you enter them manually.
3. **A SASL credential**, if the broker requires one. On Confluent Cloud: *Cluster → API keys → Add key*, scoped to this cluster. On Redpanda Serverless: *Security → Create user*, then grant it ACLs. Copy the secret when it is shown — most consoles never show it again.
4. **ACLs** — grant the principal Datanika connects as `READ` on the target topics and on the consumer group prefix you'll use. On a PLAINTEXT broker with no credential that principal is the anonymous one; with SASL it is the username you created.

> **Least privilege.** Datanika only needs `READ` on topics and the consumer group — it never needs `WRITE`, `CREATE`, `DELETE`, or `ALTER`.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `kafka`.
3. Fill in the form:
   - **Connection Name** — e.g. `kafka-prod` or `kafka-events`.
   - **Bootstrap Servers** *(required)* — comma-separated list of broker addresses. Example: `broker1:9092, broker2:9092`.
   - **Topics (comma-separated)** *(required)* — the topics you want to sync. Example: `events, orders`.
   - **Consumer Group ID** *(optional)* — a group identifier Datanika uses to track consumption offsets. Example: `datanika-consumer`. Leave blank to use the default.
   - **Security Protocol** *(optional)* — `SASL_SSL` for every managed cluster. Leave blank for a PLAINTEXT broker.
   - **SASL Mechanism** *(optional)* — `PLAIN` on Confluent Cloud, `SCRAM-SHA-256` on Redpanda. Defaults to `PLAIN` when you set a `SASL_*` protocol and leave this blank.
   - **SASL Username** and **SASL Password** *(optional)* — required together whenever the protocol starts with `SASL_`. The password field is masked, stored encrypted, and never quoted back in an error message.
4. Click **Create Connection**.

![Adding the Kafka connection in Datanika](/docs/connectors/kafka/02-add-connection.png)

> ⚠️ **Test Connection does not test a Kafka broker, and it will tell you so.** Kafka is not HTTP, so it cannot share the guarded HTTP session the other probes use. The button returns a neutral **not tested** verdict with that reason — deliberately neither green nor red, because reporting an unverified connection as working and reporting it as failed are the same lie told in opposite directions. **The first real verification is the first pipeline run** (Step 4), so run it before you schedule anything.

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection. There is no "Configure pipeline" button — connection rows offer only Test / Edit / Copy / Delete, and `/pipelines` is the **dbt** builder, which is a different thing.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `events-stream-load` becomes `eventsstreamload`) and an optional **Description**.
3. Pick the **Source connection** and the **Destination connection** — the Kafka connection from Step 2 is the source. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. Click **Create Upload**. It appears in the table below with status `draft`.

> **There is no write disposition, load mode, source schema or table-name field for a Kafka source, and that is deliberate.** Those controls are rendered only when the source is a SQL database. Topics are set on the **connection**, not here — there is no topic selector on the upload form.

> **Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. The contract decides whether a changed incoming shape evolves the destination or fails the run.

### Optional: raw JSON config

**Use raw JSON config** on the upload accepts four Kafka options, all of which the source builder actually reads:

- `idle_timeout_ms` — how long a topic must stay quiet before the run stops draining it and finishes.
- `start_from` — `earliest` (default) or `latest`, i.e. `auto.offset.reset` for a group with no committed offset.
- `enable_auto_commit` — `true` by default. Set it to `false` for at-least-once: every message carries `_kafka_partition` and `_kafka_offset` as its primary key, so re-reads deduplicate on merge.
- `topics` — overrides the connection's topic list for this upload only.

The four authentication keys are **not** in that list and are rejected by name. See [Broker authentication](#broker-authentication) for why.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**. There is no "Run now" on a pipeline page — the trigger lives on the upload's own row.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `eventsstreamload` creates schema `eventsstreamload` in the destination. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables in that schema, but **Models does not list them** — seeing only your own tables there is correct, not a partial load. There is no target-schema field to choose.
4. Spot-check the row count against the source. **Verify in the destination rather than trusting the status badge** — a green run means the load finished, not that it moved what you expected.

## Step 5 — Schedule it

Schedules live on their own page and reference the upload **by name**.

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload` (the dropdown also offers pipelines and transformations).
   - **Target name** — the upload's name exactly as it was saved, e.g. `eventsstreamload`.
   - **Cron expression** — a real five-field cron string. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00.
   - **Timezone** — defaults to `UTC`. The cron is evaluated in this zone, which matters for daily and weekly cadences.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications** so you hear about broken runs before your stakeholders do.

## Troubleshooting

Kafka failures surface on the **run**, not on Test Connection — see the note in Step 2.

### `Kafka security settings belong on the connection, not in the pipeline config`
**Cause.** One or more of `security_protocol`, `sasl_mechanism`, `sasl_plain_username`, `sasl_plain_password` was supplied through **Use raw JSON config**. The message names which ones it found.
**Fix.** Move them to the Kafka connection (Step 2) and remove them from the JSON. The connector refuses them here on purpose: the connection stores credentials encrypted and keeps them out of errors and backups, and the pipeline config does neither.

### `Unknown Kafka security_protocol '...'`
**Cause.** A typo, or a value from another client library. The field is free text and is checked against the four protocols kafka-python accepts.
**Fix.** Use exactly `PLAINTEXT`, `SSL`, `SASL_PLAINTEXT` or `SASL_SSL`. Case and surrounding whitespace are normalised, so `sasl_ssl ` is fine; `SASL-SSL` is not.

### `security_protocol SASL_SSL needs sasl_plain_username and sasl_plain_password on the Kafka connection`
**Cause.** A SASL protocol with one or both credential fields blank.
**Fix.** Fill both. This check exists because the alternative is worse: an anonymous handshake against a SASL broker is simply dropped, and surfaces as a bootstrap timeout — a message about the network for a problem in the credentials.

### `Unable to bootstrap from [...]`
**Cause.** The consumer never reached a broker. Four things produce an identical message: an unresolvable or wrong advertised listener, a firewall blocking the broker port outbound, a protocol mismatch (PLAINTEXT client against a TLS listener, or the reverse), and a cluster that no longer exists.
**Fix.** Work down that list rather than guessing — the error does not distinguish them. Check DNS resolves from Datanika's network; confirm the port is open outbound; confirm the listener you addressed speaks the protocol you selected; confirm the cluster is still live in the provider console. For self-hosted Kafka, `advertised.listeners` must resolve to an address the Datanika container can reach, not to an internal hostname.

### `SSL handshake failed` or a certificate verification error
**Cause.** The broker presents a certificate the system trust store does not accept — almost always a private or self-signed CA.
**Fix.** Not configurable today: there is no field for a custom CA bundle, and no raw-JSON key for one. Use a certificate from a publicly-trusted CA, or reach the broker over PLAINTEXT on a private network.

### `TOPIC_AUTHORIZATION_FAILED`
**Cause.** The principal Datanika connects as doesn't have `READ` ACL on the topic.
**Fix.** Add the ACL for the principal Datanika actually connects as. With SASL that is the **SASL Username** from the connection; with PLAINTEXT and no credential it is the anonymous principal, `User:ANONYMOUS` on most brokers. For self-hosted: `kafka-acls.sh --add --allow-principal User:<principal> --operation Read --topic <topic-name>`, plus `--operation Read --group <group-id>`.

### `GROUP_AUTHORIZATION_FAILED`
**Cause.** The consumer doesn't have `READ` ACL on the consumer group ID you entered in the form.
**Fix.** Grant `READ` on the consumer group. For Confluent Cloud: grant Consumer access with the matching consumer-group name. For self-hosted: `kafka-acls.sh --add --allow-principal User:datanika-consumer --operation Read --group '<your-group-id>'`.

### `SASL authentication failed` / `Authentication failed`
**Cause.** The credential is wrong, the mechanism does not match what the broker offers, or the API key is scoped to a different cluster.
**Fix.** Confirm the mechanism first — a correct password under the wrong mechanism fails identically to a wrong password. Confluent Cloud is `PLAIN`; Redpanda Serverless is `SCRAM-SHA-256`. Then re-issue the credential rather than retyping it: most consoles show the secret exactly once, so a transcription error is more likely than a revocation.

### First run finds zero messages
**Cause.** One of three things: (a) the topic is genuinely empty, (b) your consumer group has a committed offset past the end of the partition, or (c) the topic name you entered has a typo.
**Fix.** Produce a test message and re-run. If messages still don't land, create a new connection with a different **Consumer Group ID** — a fresh group with no committed offsets reads from `start_from`, which defaults to `earliest`. For (c), re-check the topic list against `kafka-topics.sh --bootstrap-server <broker> --list`.

### Runs get slower over time
**Cause.** A previous run failed mid-batch and didn't commit its offset. The next run re-reads messages from the last committed offset, including messages that were already loaded.
**Fix.** Check the **Runs** tab for failed runs. Re-reads are deduplicated on `_kafka_partition` + `_kafka_offset`, so they cost time rather than correctness. If the overlap is large, set `enable_auto_commit` back to `true` so a successful run advances the offset.

## Related

- **Use cases:** [Kafka → ClickHouse](/use-cases/kafka-to-clickhouse)
- **Comparisons:** [Datanika vs Fivetran for Kafka](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** deduplication patterns and event sessionization in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Kafka connector spec](/connectors/kafka)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
