# Apache Kafka setup-guide screenshots

Referenced from `src/content/connectors/kafka.md` (source-only streaming connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `kafka` selected, showing all **seven** connection fields — Bootstrap Servers, Topics, Consumer Group ID (placeholder `datanika-consumer`), Security Protocol, SASL Mechanism, SASL Username, SASL Password — filled for a local PLAINTEXT broker, with the grey *Not tested* verdict Test Connection returns. **Recaptured 2026-09-16** from a local stack (see below), 968x828 CSS px, 37,942 B, no PNG text chunks. It replaces the 2026-07-19 capture, which showed the three-field form that predates broker authentication — the very form the guide's self-check tells a reader they are *not* on. `PRODUCT_RULES` §4 credential gate before the shot: 8 inputs, 1 credential-shaped (SASL Password), 0 non-empty. |
| `04-first-run.png` | Step 4 | The **Data preview** on the model detail page for the landed `events` table (schema `eventsstreamload`) after run 11: the `Rows: 100` label (the preview's cap; the table holds 500) and the first 25 rows, with the provenance columns `_kafka_topic`, `_kafka_partition`, `_kafka_offset`, `_kafka_timestamp`, `_kafka_key` beside the message fields. The table is wider than the preview, so the last column is cut at the right edge. Captured 2026-09-16 from a local stack, 992x977 CSS px, 87,356 B, no PNG text chunks. Credential gate: 4 inputs, 0 credential-shaped, 0 non-empty. |

The PNG scans planted a `tEXt` chunk in a copy of each file and read it back as 1, so a clean result is a reading.

## Verification

`verified_by: growth-ui` / `verified_date: 2026-09-16`.

The 2026-07-19 record that stood here before was **field parity against the shipped UI source** plus the
add-connection capture. It is kept verbatim in *Prior record* at the bottom. Its last sentence — that the form is
PLAINTEXT-only and SASL goes through raw JSON — stopped being true when core#1054 shipped the credential fields,
and #486 is why.

### Where and on what this was walked (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

| field | value |
|---|---|
| **Environment** | `local stack`: its own compose project (`growthwalk`), core's `docker-compose.yml` + `docker-compose.local.yml` and an overlay renaming every container and moving every published port into one band on `127.0.0.1`. Browser: a separate headless Chromium, not the shared MCP one; every websocket recorded went to this stack's own backend (`other=0` on every step). |
| **Core revision** | `01de8b0cfbf6d8e41af8e2b590f561b944ef50d0`, `origin/master` when built. Core was promoted during the walk to `ba7289b9`, whose only change in the walked paths is `connection_state.py`; `dlt_runner.py`, `connection_service.py`, `connection_schemas.py` and `upload_service.py` are unchanged. Ancestor check against `origin/master` after a fresh fetch: **yes** (rc=0). Control: the unmerged branch tip `6642ef62` answered **no** (rc=1). |
| **Cloud revision** | `68a2ee5631db3f5099fca769d52a84187fb4f354`, `origin/master` when built and when recorded. Ancestor check: **yes**. Control: the unmerged branch tip `933ceeff` answered **no**. |
| **Edition** | `cloud`, read from each container's own interpreter. |
| **Configuration** | `self-hosted defaults`: the step walked is the guide's *self-hosted on a private network, leave all four blank* case. The one setting production grades, `DATANIKA_ALLOW_LOCAL_FILE_PATHS`, resolved `True`, but it is read only for local-file connection types (`connection_service.py:336`, `_LOCAL_PATH_TYPES`) and never reaches a Kafka connection. **Deviation:** `DATANIKA_EDITION=cloud` was set, as on every §2.4 walk on this stack. |
| **Guide revision** | landing `e6ae717` (blob `1d4d5744`) when the walk began. Product's `4bbd713` changed two passages of `kafka.md` during the walk — the `enable_auto_commit` bullet and *Runs get slower over time* — and this walk then measured both. |
| **Broker** | `apache/kafka:3.9.1`, a single node in KRaft mode, one PLAINTEXT listener advertised as `kafka:9092`, reachable only on the stack's network (no host port). `datanika-examples` ships no Kafka and `SECRETS_INVENTORY` records the Redpanda credentials as unusable, so the broker was stood up for the walk. The worker's client: `kafka-python` 3.0.9. |
| **Messages** | Topic `events`: 1 partition, 500 JSON messages keyed `user-N`. Topic `orders`: 3 partitions, the 2,000 Online Store orders from `datanika-examples` as JSON keyed by id. More were produced later, in batches of 10 and 5, each counted from the broker's own offsets. |
| **Destination** | `walkwarehouse`, PostgreSQL, database `walk_warehouse` on the stack's own Postgres. |
| **Not exercised** | Every authenticated path: SASL_PLAINTEXT, SASL_SSL, SSL, the mechanisms, and the *Unknown security_protocol* / *needs sasl_plain_username* / *SASL authentication failed* / *SSL handshake failed* entries · Confluent Cloud, Redpanda, Aiven, Upstash · ACLs, `TOPIC_AUTHORIZATION_FAILED` and `GROUP_AUTHORIZATION_FAILED` (the broker ran no authorizer, so every principal was admitted) · `Unable to bootstrap from [...]` · the raw JSON options `idle_timeout_ms` and `start_from` · a non-JSON message payload · Step 5 (the org is at the Free plan's 2 schedules, and the schedule form was walked for SQLite in the same session) · egress-IP allowlisting |

### 2026-09-16 — walked end to end

Walked by Growth through the UI, signed in to the throwaway org `Growth Walk's Org` on that stack.

**Step 2.** The guide's self-check read **seven** config fields: **Bootstrap Servers \***, **Topics (comma-separated) \***,
**Consumer Group ID** (no asterisk, placeholder `datanika-consumer`), **Security Protocol** (placeholder `SASL_SSL`),
**SASL Mechanism** (placeholder `PLAIN`), **SASL Username** and **SASL Password**, plus **Use raw JSON config**. The
guide's example name `kafka-events` typed as `kafkaevents`. Filled with Bootstrap `kafka:9092`, Topics `events, orders`,
and Consumer Group ID and the four security fields **left blank**. Test Connection answered in 0.24 s, **grey**:
*Not tested. Kafka is not an HTTP service, so this button cannot reach your broker. Your settings are checked on the
first run.* Connection **10** `kafkaevents` created. The blank Consumer Group ID resolved to `datanika-consumer`, the
only group the broker listed afterwards.

**Step 3.** Name rule as documented (`events-stream-load` → `eventsstreamload`). With the Kafka source picked, the form
showed **only** Upload name, Description, Batch size and the Schema Contract dropdowns — no Load Mode, Write Disposition,
Source schema or Table names — as the guide says. Stored config `{"mode": "full_database"}`.

**Step 4 — the runs, in order.** Rows are counted in the destination; the lag column is the group's lag on each topic
immediately before the run, read on the broker.

| run | upload (raw JSON) | lag before: events / orders | status | Rows | what landed |
|---|---|---|---|---|---|
| 11 | 11 `eventsstreamload` | 500 / 2000 (no group yet) | `SUCCESS`, 51.6 s | **500** | `events`, 500 rows, 500 distinct `(_kafka_partition, _kafka_offset)`, `SUM(event_id)` 125250 and `SUM(amount)` 375750, both equal to what was produced. 🚨 **No `orders` table, and no committed offset on `orders`.** |
| 12 | 11 `eventsstreamload` | 0 / 2000 | `SUCCESS`, 27.9 s | 2000 | `orders`, 2000 rows, 2000 distinct keys, `SUM(id)` 2001000 equal to the source |
| 13 | 11 `eventsstreamload` | 10 / 10 | `SUCCESS`, 50.7 s | **10** | the 10 events only; `orders` still had lag 10 afterwards |
| 14 | 12 `kafkarawsecurity` (`security_protocol` set) | — | **`FAILED`**, 0.14 s | — | *Kafka security settings belong on the connection, not in the pipeline config: security_protocol. Set them on the Kafka connection — it stores credentials encrypted and keeps them out of error messages and backups, and the pipeline config does neither.* The upload had saved without complaint. |
| 15 | 13 `ordersonly` (`topics: orders`) | 0 / 10 | `SUCCESS`, 9.9 s | 10 | the 10 orders run 13 skipped, ids 2001–2010 |
| 16 + 17 | 14 `eventsonly` + 13 `ordersonly`, started 0.8 s apart | 10 / 10 | both `SUCCESS` | 10 + 10 | both topics, and every lag was 0 afterwards |
| 18, 19 | 15 `noautocommitappend` (`enable_auto_commit: false`) | 10 / 0, and still 10 after 18 | both `SUCCESS` | 10, 10 | **20 rows, 10 distinct keys** — the re-read was appended |
| 20, 21 | 16 `noautocommitmergekey` (+ `write_disposition: merge`, `merge_config` keyed on the two columns) | 10 / 0, and still 10 after 20 | both `SUCCESS` | 10, 10 | **10 rows, 10 distinct keys** — the re-read was merged |

**Run 11 is the finding, filed as [core#1408](https://github.com/datanika-io/datanika-core/issues/1408).** Its worker
log shows the `events` consumer being assigned partition 0, the `orders` consumer subscribing to the same group
0.2 s later, the group rebalancing every 3 s, and the `orders` consumer leaving after its 10-second idle timeout without
ever being assigned — and the run still finished `success`. Run 13 reproduced it with both topics non-empty. Run 12 is
why it can look intermittent, and runs 15–17 are the control: one topic per upload loaded everything, even with two
uploads running at once.

`/models` listed `events` in schema `eventsstreamload` with 11 columns and no `_dlt_*` table. The model page's
**Load first 100 rows** gave the preview captured above.

**One thing measured about saving:** `{"write_disposition": "merge"}` in the raw JSON, without `merge_config`, was
refused at **Create Upload** with the red callout *full_database merge requires 'merge_config'*, and no upload was saved.
Product's `4bbd713` had just told readers to add exactly that; the guide now gives the config that saves and dedupes.

#### What the walk measured otherwise (corrected in the same change)

- **Step 2's Topics example** `events, orders` is the shape core#1408 breaks. The example is now one topic, with the
  one-upload-per-topic workaround beside it.
- **Step 2's example names** `kafka-prod` / `kafka-events` cannot be typed as shown.
- **Consumer Group ID** said *leave blank to use the default* without naming it; it is `datanika-consumer`, and every
  upload on the connection shares it (run 16's upload read only the ten events that run 13's upload had not consumed).
- **Test Connection's** verdict is now quoted.
- **`enable_auto_commit`** and **Runs get slower over time** told the reader to add `"write_disposition": "merge"`, which
  is refused at save. Both now give the config that runs 20 and 21 measured.
- **Security keys in raw JSON:** the upload saves and the run fails, which the guide did not say.
- **Step 4** now says each topic lands as its own table with the provenance columns, and how to read a topic's lag
  to check a count.
- **Troubleshooting:** a new entry for the green run that skipped a topic, and two more causes for *zero messages*.

**Housekeeping.** The org was at the Free plan's 5 connections, so I soft-deleted **my own** connection **7**
`mongostorereadonly` (the MongoDB walk, recorded in that guide's README) with a targeted update aimed by id **and** name,
and read the other live connections back unchanged. Upload 3 consequently reads `blocked`. The probe uploads 12–16
remain in the org. The group was left with lag 10 on `events`, because runs 18–21 deliberately committed nothing.

## Prior record (2026-07-19), kept verbatim

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`kafka_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Bootstrap Servers** (required), **Topics (comma-separated)** (required), **Consumer Group ID** (**optional** — no asterisk). The type dropdown shows the lowercase key **`kafka`**. **Drift fixed:** the draft marked **Consumer Group ID as required** — it's optional in the shipped form. Also fixed: dropdown key, "Name" → "Connection Name", "Save" → "Create Connection", and softened the Test-Connection claim. The guide **correctly** documents that the structured form is PLAINTEXT-only and that SASL/SSL/mTLS goes through the **Use raw JSON config** escape hatch.
