---
title: "Your Kafka Password Does Not Go in the Pipeline Config"
description: "Datanika reaches SASL and TLS brokers through four fields on the Kafka connection. The same keys are refused inside the pipeline's raw JSON config, by name, before any broker is contacted — because one of those two places is encrypted and redacted and the other is a plain JSON column."
date: 2026-11-04
publishedAt: 2026-11-04
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "kafka", "streaming", "security", "connections"]
---

Every managed Kafka you are likely to be running — Confluent Cloud, Redpanda Serverless, Aiven, Upstash — requires SASL over TLS. None of them will talk to an anonymous consumer. So the first real question when you point Datanika at a broker is not *which topics*, it is **where the credential goes**.

There are two boxes in the product that will accept text, and only one of them should ever hold a broker password. This post is about which, and why the other one now refuses it out loud instead of taking it.

## The short version

Broker authentication lives on the **connection**, as four fields:

| Field | Config key | Accepted values |
|---|---|---|
| Security Protocol | `security_protocol` | `PLAINTEXT`, `SSL`, `SASL_PLAINTEXT`, `SASL_SSL` (default `PLAINTEXT`) |
| SASL Mechanism | `sasl_mechanism` | `PLAIN`, `SCRAM-SHA-256`, `SCRAM-SHA-512` (default `PLAIN`) |
| SASL Username | `sasl_plain_username` | your SASL principal, or the API key |
| SASL Password | `sasl_plain_password` | the matching secret — stored encrypted |

For the managed tiers that maps to:

- **Confluent Cloud** — `SASL_SSL` with `PLAIN`, API key as the username, API secret as the password.
- **Redpanda Serverless** — `SASL_SSL` with `SCRAM-SHA-256`.
- **Aiven** and **Upstash** — `SASL_SSL`; check the console for the mechanism, both offer `SCRAM-SHA-256`.
- **A self-hosted broker on a private network** — leave all four blank. With none of them set the consumer behaves exactly as it did before these fields existed, so nothing changes for a connection you already have.

The step-by-step version, with the ACLs and the cluster-side setup, is the [Kafka setup guide](/docs/connectors/kafka). The field-by-field reference is the [Kafka connector page](/connectors/kafka).

## The other box, and why it says no

An upload has a **Use raw JSON config** checkbox. It is a genuinely useful escape hatch — it is how you narrow the topic list for one upload, or change where a fresh consumer group starts reading. It is not where credentials go, and if you put them there the run stops before it contacts anything:

> `Kafka security settings belong on the connection, not in the pipeline config`

The message names which of the four keys it found. The upload itself saves without complaint; the refusal happens on the run, in well under a second.

That is a deliberate refusal, not an oversight, and the reason is worth stating because it is the whole argument:

- A **connection's** config is encrypted at rest. Its password field is stripped out of error messages and out of database backups.
- An upload's `dlt_config` is a **plain JSON column**. No encryption, no redaction.

So the convenient path is the one that would write a broker password in clear text into the database and into every backup, where nothing removes it again. Between silently ignoring the keys and refusing them by name, refusing is the only option that leaves the operator knowing what happened.

This is also the single most important thing to know about this connector's history. For four and a half months the setup guide recommended exactly that raw-JSON route, back when the connection had no credential fields at all. The advice did not merely fail to help — the keys were not in the runner's accepted set, so they were splatted into the pipeline call and raised a `TypeError`. It was printed directly under the troubleshooting symptom that sends a reader looking for it.

## Which build are you on?

Broker authentication is recent, and self-hosted Datanika moves on your schedule rather than ours. Rather than quoting a version number that would need maintaining and would be wrong for half the people reading:

**Open `/connections`, pick `kafka` in the type dropdown, and count the fields.** Three means a build that predates broker authentication, and only a `PLAINTEXT` broker will connect. Seven means you have it.

There is no raw-JSON workaround on the older build either — that is what the preceding section is about. If you are on three fields and you need a managed cluster, the answer is to update, not to find a way round the form.

## Test Connection will not tell you it worked

Kafka is not HTTP, so the Test Connection button cannot share the guarded HTTP session the other probes use. It returns a neutral grey verdict saying so, and it is deliberately **neither green nor red**: reporting an unverified connection as working and reporting it as failed are the same lie told in opposite directions. We [wrote about the three answers that button can give](/blog/test-connection-three-answers) separately.

**Your first pipeline run is the verification step.** Do it before you put a schedule on it, and check the destination rather than the run's status badge — a green run means the load finished, not that it moved what you expected. For Kafka the source-side number to compare against is each topic's lag before the run.

## What the raw JSON config is actually for

Removing the false remedy should not cost you the real ones. Four Kafka options are read off the upload's raw config:

- `idle_timeout_ms` — how long a topic must stay quiet before the run stops draining it and finishes.
- `start_from` — `earliest` (the default) or `latest`, for a consumer group with no committed offset.
- `enable_auto_commit` — `true` by default. Turn it off for at-least-once delivery and the run commits no offset, so the next run reads the same messages again.
- `topics` — narrows the connection's topic list for this upload only.

Those last two interact, and the interaction surprises people. A Kafka upload adds rows rather than replacing them, so messages read a second time land a second time unless the upload merges on the Kafka coordinates:

```json
{
  "topics": "events",
  "enable_auto_commit": false,
  "write_disposition": "merge",
  "merge_config": {"events": {"primary_key": ["_kafka_partition", "_kafka_offset"]}}
}
```

Measured over the same ten messages, two runs leave **10** rows with that config and **20** with `enable_auto_commit` turned off on its own. A `merge` disposition without a `merge_config` is refused when you save the upload, rather than at run time.

## What is still not there

Saying "we do SASL now" should not be read as "we do everything". Four things are genuinely not supported, and it is cheaper to know now than mid-migration:

- **mutual TLS** (client certificates)
- **a private or self-signed broker CA** — TLS verification uses the system trust store, which is right for every managed tier and wrong for a broker you signed yourself
- **GSSAPI** / Kerberos
- **OAUTHBEARER**

## Where to go next

- The full walkthrough, including cluster-side ACLs and the `TOPIC_AUTHORIZATION_FAILED` / `GROUP_AUTHORIZATION_FAILED` cases: [Connect Apache Kafka to Datanika](/docs/connectors/kafka).
- A worked destination pairing: [Kafka to ClickHouse](/use-cases/kafka-to-clickhouse), and the [ClickHouse setup guide](/docs/connectors/clickhouse).

If you take one thing from this: **a credential belongs in the field that was built to store it safely, not in the field that happens to accept it.** The convenient path is almost always the one without the encryption.
