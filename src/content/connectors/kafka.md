---
title: "Connect Apache Kafka to Datanika"
description: "Step-by-step guide to sync Kafka topics into your warehouse with Datanika — confirm broker reachability, add the connection, configure the pipeline, run, and schedule."
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

Apache Kafka is the backbone of most event-driven architectures — teams use Datanika to land Kafka topics in a warehouse for analytics, reporting, and ML feature stores without building custom consumers. This guide walks you end-to-end: confirm broker reachability, wire the connection into Datanika, run the first load, and put it on a schedule. Expect the first run to take minutes to hours depending on topic volume and retention.

> **Kafka is a source, not a destination.** In Datanika, Kafka is where data comes *from*. To load data *into* a warehouse, you'll set up a destination connection separately (e.g., [BigQuery](/docs/connectors/bigquery), [ClickHouse](/docs/connectors/clickhouse)). This guide covers the source side.

> **Looking for the connector spec?** For the full field-by-field reference — supported settings, consumer group behavior — see the [Kafka connector page](/connectors/kafka).

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika (PostgreSQL, BigQuery, Snowflake, Redshift, ClickHouse, or DuckDB). Kafka is **source-only**.
- An **Apache Kafka cluster** — self-hosted, Confluent Cloud, Amazon MSK, Redpanda, or any Kafka-compatible broker. Minimum version: Kafka 2.0.
- **Network reachability** from Datanika to your Kafka bootstrap servers. For managed services, this means the cluster must be reachable over the internet or via VPC peering. Self-hosted Datanika just needs the container to reach the brokers.
- **Topic-level ACLs** granting the Datanika consumer `READ` on the topics you want to sync, plus `READ` on the consumer group.

> **Broker authentication note.** The structured Kafka connection form currently supports **PLAINTEXT** brokers only — there are no UI fields for SASL, SSL, or mTLS credentials (see [datanika-core#198 KF-1](https://github.com/datanika-io/datanika-landing/issues/198) for the full scope). For SASL/SSL/mTLS brokers, use the **Use raw JSON config** escape hatch on the connection form to pass the underlying `dlt` kafka options directly. If you're on Confluent Cloud or Amazon MSK Serverless today and need SASL auth surfaced in the UI, please +1 the tracking issue.

## Step 1 — Prepare the Kafka cluster

You don't need to generate API keys or certificates for the structured flow — the current Datanika Kafka form connects anonymously (PLAINTEXT). What you do need:

1. **Bootstrap server addresses** — the host:port pairs for your broker(s), e.g. `broker1.internal:9092, broker2.internal:9092`. Confluent Cloud bootstrap servers look like `pkc-abc12.us-east-1.aws.confluent.cloud:9092`.
2. **Topic names** — the exact names of the topics you want to sync (e.g. `events`, `orders`). The Datanika form does **not** discover topics from the broker — you enter them manually.
3. **ACLs** — ensure your broker allows the anonymous principal (or whichever principal Datanika connects as) to `READ` the target topics and the consumer group prefix you'll use.

> **Least privilege.** Datanika only needs `READ` on topics and the consumer group — it never needs `WRITE`, `CREATE`, `DELETE`, or `ALTER`.

![Noting bootstrap servers and topic names from your Kafka cluster](/docs/connectors/kafka/01-credentials.png)

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there's no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick **Apache Kafka**.
3. Fill in the form:
   - **Name** — e.g. `kafka-prod` or `kafka-events`.
   - **Bootstrap Servers** *(required)* — comma-separated list of broker addresses. Example: `broker1:9092, broker2:9092`.
   - **Topics (comma-separated)** *(required)* — the topics you want to sync. Example: `events, orders`.
   - **Consumer Group ID** *(required)* — a group identifier Datanika uses to track consumption offsets. Example: `datanika-consumer`.
4. Click **Test connection**. Datanika attempts to reach the bootstrap servers and enumerate the topics. You should see a green checkmark.
5. Click **Save**.

![Adding the Kafka connection in Datanika — three fields only](/docs/connectors/kafka/02-add-connection.png)

> **Test connection fails?** Jump to [Troubleshooting](#troubleshooting) — most first-time failures are DNS resolution (advertised listeners mismatch), a PLAINTEXT-vs-SSL broker mismatch, or missing topics ACLs.

> **Need SASL/SSL/mTLS?** Toggle **Use raw JSON config** at the top of the form and provide a JSON payload with the dlt kafka options you need (e.g. `{"bootstrap_servers": "...", "topics": [...], "group_id": "...", "security_protocol": "SASL_SSL", "sasl_mechanism": "PLAIN", "sasl_username": "...", "sasl_password": "..."}`). These extra keys pass through to the dlt `kafka_consumer` resource. The Test Connection button may fail on the raw-JSON path — the first pipeline run will attempt the real connection.

## Step 3 — Configure the pipeline

1. Open the connection you just created and click **Configure pipeline**.
2. Pick the **destination warehouse** and a **target schema** — we recommend `raw_kafka` or a schema per domain (e.g., `raw_events`, `raw_clickstream`). Datanika syncs the topics you listed on the connection into one landing table per topic.
3. Save the pipeline configuration.

> **Tip.** Start with one low-volume topic (a few thousand messages/hour) on the connection — edit the Topics field to point at just that one topic — so the first run validates the full flow (auth, deserialization, warehouse load) before you widen the scope. Once the pipeline is green, edit the connection and add the rest of the topics.

## Step 4 — First run

1. From the pipeline page, click **Run now**.
2. Open the **Runs** tab to watch progress. dlt creates a Kafka consumer in your configured consumer group and reads messages in batches.
3. A first run against a topic with millions of messages can take 10–60 minutes depending on message size and network throughput. Subsequent runs only read new messages from the last committed offset.
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
**Cause.** The bootstrap server hostname can't be resolved from Datanika's network. Common with self-hosted Kafka where `advertised.listeners` is set to an internal hostname the Datanika container can't see.
**Fix.** Ensure `advertised.listeners` in your Kafka broker config resolves to an IP reachable from Datanika. For Datanika Cloud, this means a public DNS name. For self-hosted Datanika, the container must be able to resolve the broker hostnames.

### `Test connection failed: Connection refused` or `SSL handshake failed`
**Cause.** The broker requires SASL/SSL/mTLS but the structured form connects as PLAINTEXT. Or vice versa — the broker is PLAINTEXT-only and something upstream is terminating TLS.
**Fix.** For SASL/SSL/mTLS brokers, switch the connection to the **Use raw JSON config** escape hatch and supply `security_protocol`, `sasl_mechanism`, `sasl_username`, and `sasl_password` (or the mTLS equivalents) directly. For PLAINTEXT brokers, verify no proxy is upgrading the connection.

### `TOPIC_AUTHORIZATION_FAILED`
**Cause.** The principal Datanika connects as doesn't have `READ` ACL on the topic.
**Fix.** Add the ACL. For Confluent Cloud (raw-JSON path): grant Consumer access to the service account for the specific topic. For self-hosted: `kafka-acls.sh --add --allow-principal User:datanika-consumer --operation Read --topic <topic-name>`.

### `GROUP_AUTHORIZATION_FAILED`
**Cause.** The consumer doesn't have `READ` ACL on the consumer group ID you entered in the form.
**Fix.** Grant `READ` on the consumer group. For Confluent Cloud: grant Consumer access with the matching consumer-group name. For self-hosted: `kafka-acls.sh --add --allow-principal User:datanika-consumer --operation Read --group '<your-group-id>'`.

### First run finds zero messages
**Cause.** One of three things: (a) the topic is genuinely empty, (b) your consumer group has a committed offset past the end of the partition (the default `auto.offset.reset` is `latest`, so a fresh group reads only future messages), or (c) the topic name you entered has a typo.
**Fix.** Produce a test message and re-run. If messages still don't land, create a new connection with a different **Consumer Group ID** — a fresh group with no committed offsets will read from the configured default. For (c), re-check the topic list against `kafka-topics.sh --bootstrap-server <broker> --list`.

### Runs get slower over time
**Cause.** A previous run failed mid-batch and didn't commit its offset. The next run re-reads messages from the last committed offset, including messages that were already loaded.
**Fix.** Check the **Runs** tab for failed runs. If a run failed, the next successful run will re-process the overlapping window. dlt uses `append` write disposition by default, so this can create duplicates — run a dedup query in your warehouse or switch to `merge` with a message-ID primary key for exactly-once semantics.

## Related

- **Use cases:** [Kafka → BigQuery](/use-cases/kafka-to-bigquery), [Kafka → ClickHouse](/use-cases/kafka-to-clickhouse)
- **Comparisons:** [Datanika vs Fivetran for Kafka](/compare/fivetran), [Datanika vs Airbyte](/compare/airbyte)
- **dbt tips:** deduplication patterns and event sessionization in the [Transformations guide](/docs/transformations-guide)
- **Connector reference:** full field-by-field [Kafka connector spec](/connectors/kafka)
- **Scheduling deep-dive:** cron syntax, timezones, and run-queue behavior in the [Scheduling guide](/docs/scheduling-guide)
