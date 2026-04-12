---
title: "Connect Apache Kafka to Datanika"
description: "Step-by-step guide to sync Kafka topics into your warehouse with Datanika — configure access, add the connection, pick topics, run, and schedule."
source: "kafka"
source_name: "Apache Kafka"
category: "api"
verified_by: "draft-pending-verification"
verified_date: null
related_use_cases:
  - "kafka-to-bigquery"
  - "kafka-to-clickhouse"
related_comparisons:
  - "fivetran"
  - "airbyte"
draft: false
---

Apache Kafka is the backbone of most event-driven architectures — teams use Datanika to land Kafka topics in a warehouse for analytics, reporting, and ML feature stores without building custom consumers. This guide walks you end-to-end: configure Kafka credentials (SASL or mTLS), wire the connection into Datanika, pick which topics to sync, run the first load, and put it on a schedule. Expect the first run to take minutes to hours depending on topic volume and retention.

> **Kafka is a source, not a destination.** In Datanika, Kafka is where data comes *from*. To load data *into* a warehouse, you'll set up a destination connection separately (e.g., [BigQuery](/docs/connectors/bigquery), [ClickHouse](/docs/connectors/clickhouse)). This guide covers the source side.

> **Looking for the connector spec?** For the full field-by-field reference — supported auth methods, serialization formats, consumer group behavior — see the [Kafka connector page](/connectors/kafka).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika (PostgreSQL, BigQuery, Snowflake, Redshift, ClickHouse, or DuckDB). Kafka is **source-only**.
- An **Apache Kafka cluster** — self-hosted, Confluent Cloud, Amazon MSK, Redpanda, or any Kafka-compatible broker. Minimum version: Kafka 2.0.
- **Credentials**: SASL/PLAIN or SASL/SCRAM username+password (Confluent Cloud, MSK Serverless), or mTLS certificates (MSK Provisioned, self-hosted). This guide covers both.
- **Network reachability** from Datanika to your Kafka bootstrap servers. For managed services (Confluent Cloud, MSK Serverless), this means the cluster must be reachable over the internet or via VPC peering. Self-hosted Datanika just needs the container to reach the brokers.
- **Topic-level ACLs** granting the Datanika consumer `READ` on the topics you want to sync, plus `READ` on the consumer group.

## Step 1 — Create credentials for Kafka

### Option A — SASL/PLAIN (Confluent Cloud, most managed services)

1. In Confluent Cloud, go to **Cluster → API Keys → + Add Key**.
2. Choose **Granular access** → select the service account (or create one, e.g. `datanika-consumer`).
3. Grant **Consumer** permissions on each topic you want to sync, and `READ` on the consumer group prefix `datanika-*`.
4. Copy the **API Key** and **API Secret**. These map to SASL username and password.

### Option B — SASL/SCRAM (Amazon MSK Serverless, self-hosted)

1. For MSK: create a SCRAM secret in AWS Secrets Manager and associate it with the MSK cluster.
2. For self-hosted: configure SCRAM credentials in your broker's JAAS config.
3. The username and password from the secret are what you'll paste into Datanika.

### Option C — mTLS (Amazon MSK Provisioned, self-hosted)

1. Generate a client certificate signed by the CA your Kafka cluster trusts.
2. You'll need three files: **client certificate** (PEM), **client private key** (PEM), and **CA certificate** (PEM).

> **Least privilege.** Datanika only needs `READ` on topics and the consumer group. It never needs `WRITE`, `CREATE`, `DELETE`, or `ALTER` on topics. Do not grant cluster-level admin permissions.

![Creating API credentials for Kafka](/docs/connectors/kafka/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **Connections → New connection**.
2. Pick **Apache Kafka** from the connector list.
3. Fill in the form:
   - **Name** — e.g. `kafka-prod` or `kafka-events`.
   - **Bootstrap servers** — comma-separated list of broker addresses, e.g. `broker1:9092,broker2:9092` or `pkc-abc12.us-east-1.aws.confluent.cloud:9092`.
   - **Security protocol** — `SASL_SSL` (Confluent Cloud, MSK Serverless), `SSL` (mTLS), or `PLAINTEXT` (local dev only).
   - **SASL mechanism** — `PLAIN` (Confluent) or `SCRAM-SHA-256`/`SCRAM-SHA-512` (MSK, self-hosted). Only shown when security protocol is SASL-based.
   - **Username / Password** — the SASL credentials from Step 1. Stored encrypted at rest with Fernet.
   - For mTLS: upload the **client cert**, **client key**, and **CA cert** PEM files.
4. Click **Test connection**. Datanika attempts to connect to the bootstrap servers, authenticate, and list available topics. You should see a green checkmark.
5. Click **Save**.

![Adding the Kafka connection in Datanika](/docs/connectors/kafka/02-add-connection.png)

> **Test connection fails?** Jump to [Troubleshooting](#troubleshooting) — most first-time failures are DNS resolution (advertised listeners mismatch) or security protocol mismatches.

## Step 3 — Configure topics and schemas

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_kafka` or a schema per domain (e.g., `raw_events`, `raw_clickstream`).
3. Datanika lists all topics the consumer has `READ` access to. For each topic you want to sync:
   - **Serialization format** — `JSON` (most common), `Avro` (with Schema Registry), or `string` (raw message value as text).
   - **Schema Registry URL** (Avro only) — e.g. `https://psrc-abc12.us-east-1.aws.confluent.cloud`. Datanika uses it to deserialize messages and infer the warehouse table schema.
   - **Write disposition** — `append` is the standard choice for event streams. Each run adds new messages to the target table without touching existing rows.
   - **Start offset** — `earliest` (backfill from the beginning of retention) or `latest` (only new messages from now). Default is `earliest` for the first run.
4. Save the pipeline configuration.

> **Tip.** Start with one low-volume topic (e.g., a few thousand messages/hour) for the first run. This validates the full flow — auth, deserialization, schema mapping, warehouse load — before you point it at high-volume streams.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. dlt creates a Kafka consumer in the `datanika-<pipeline-id>` consumer group and reads messages in batches. Per-topic row counts stream in as each batch is loaded.
3. A first run with `earliest` offset against a topic with millions of messages can take 10–60 minutes depending on message size and network throughput. Subsequent runs only read new messages from the last committed offset.
4. When the run finishes, open **Catalog → `<your warehouse>` → `raw_kafka`** to browse the landed tables. You should see one table per topic.
5. Spot-check: compare the table's row count against the topic's message count in your Kafka admin tool or Confluent Cloud metrics.

![First run in the Runs tab](/docs/connectors/kafka/04-first-run.png)

## Step 5 — Schedule it

1. On the pipeline page, click **Schedule**.
2. Pick a cadence. Kafka topics accumulate messages continuously, so the cadence controls how fresh your warehouse data is:
   - **Every 15 minutes** — near-real-time analytics, event-driven dashboards.
   - **Hourly** — standard event analytics, session aggregation.
   - **Every 6 hours** — batch reporting where sub-hour freshness isn't critical.
3. Choose a **timezone** and save.
4. Wire up failure alerts in **Settings → Notifications** so broken runs surface before downstream consumers notice stale data.

> **Note on latency vs. cost.** Datanika reads Kafka in batch, not as a continuous consumer. Each scheduled run consumes from the last committed offset, loads into the warehouse, and stops. This is by design — it's cost-efficient and warehouse-friendly. For true sub-second streaming, use Kafka Streams or Flink and point Datanika at the resulting tables.

![Configuring the schedule](/docs/connectors/kafka/05-schedule.png)

## Troubleshooting

### `Test connection failed: DNS resolution failed for broker`
**Cause.** The bootstrap server hostname can't be resolved from Datanika's network. Common with self-hosted Kafka where `advertised.listeners` is set to an internal hostname.
**Fix.** Ensure `advertised.listeners` in your Kafka broker config resolves to an IP reachable from Datanika. For Datanika Cloud, this means a public DNS name or IP. For self-hosted Datanika, the container must be able to resolve the broker hostnames.

### `Test connection failed: SSL handshake failed`
**Cause.** Security protocol mismatch. You selected `SASL_SSL` but the broker expects `PLAINTEXT`, or vice versa. Also happens with mTLS when the CA cert doesn't match.
**Fix.** Verify the security protocol matches your broker's listener configuration. For Confluent Cloud, it's always `SASL_SSL`. For self-hosted, check the broker's `listener.security.protocol.map`.

### `TOPIC_AUTHORIZATION_FAILED`
**Cause.** The SASL user or client certificate doesn't have `READ` ACL on the topic.
**Fix.** Add the ACL. For Confluent Cloud: grant Consumer access to the service account for the specific topic. For self-hosted: `kafka-acls.sh --add --allow-principal User:datanika-consumer --operation Read --topic <topic-name>`.

### `GROUP_AUTHORIZATION_FAILED`
**Cause.** The consumer doesn't have `READ` ACL on the consumer group. Datanika uses consumer groups prefixed with `datanika-`.
**Fix.** Grant `READ` on the consumer group. For Confluent Cloud: grant Consumer access with the consumer group prefix `datanika-*`. For self-hosted: `kafka-acls.sh --add --allow-principal User:datanika-consumer --operation Read --group 'datanika-*'`.

### Messages land as raw strings instead of structured columns
**Cause.** The topic contains Avro or Protobuf messages but the serialization format is set to `JSON` or `string`. Without the correct deserializer, dlt treats the message value as an opaque blob.
**Fix.** Change the serialization format to `Avro` and provide the Schema Registry URL. dlt will use the schema to deserialize messages into structured columns.

### Runs get slower over time
**Cause.** A previous run failed mid-batch and didn't commit its offset. The next run re-reads messages from the last committed offset, including messages that were already loaded.
**Fix.** Check the **Runs** tab for failed runs. If a run failed, the next successful run will re-process the overlapping window. With `append` write disposition, this can create duplicates. Run a dedup query in your warehouse or switch to `merge` with a message-ID primary key for exactly-once semantics.

## Related

- **Use cases:** [Kafka → BigQuery](/use-cases/kafka-to-bigquery), [Kafka → ClickHouse](/use-cases/kafka-to-clickhouse)
- **Comparisons:** [Datanika vs Fivetran for Kafka](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** deduplication patterns and event sessionization in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Kafka connector spec](/connectors/kafka)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
