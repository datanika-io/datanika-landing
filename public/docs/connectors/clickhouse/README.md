# ClickHouse setup-guide screenshots

Referenced from `src/content/connectors/clickhouse.md` (destination-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `clickhouse` selected — shows the two checkboxes **Use HTTPS (TLS)** and **Enable cluster replication** below the db fields. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form with ClickHouse selected as the **Destination connection** (`23 — clickhousewarehouse (clickhouse)`), reading from a real PostgreSQL source (`16 — docssamplesdb (postgres)`). Captured 2026-07-22 by filling the live form on prod — **nothing was submitted**. Shows the point the step makes: Load Mode / Write Disposition / Source schema / Table names are there **because the source is a SQL database**, not because of ClickHouse. |

## Verification

`verified_by: growth-ui` / `verified_date: 2026-09-16`.

The 2026-07-19 record that stood here before was **field parity against the shipped UI source** plus the
add-connection capture. It was real and it is still true of the form, but it was not a connection and a run,
which is what `SPEC_CONNECTOR_GUIDE_VERIFICATION` §2 means by verified. The walk below is. The earlier
record is kept verbatim in *Prior record* at the bottom, per §4's forward-facing rule.

🚨 **There is no `04-first-run.png`, and it is not an omission — the documented path cannot produce one.**
`/models` lists nothing for a ClickHouse destination, and the **Data preview** that every other first-run
capture is a picture of hangs off `/models`. Measured below, filed as
[landing#604](https://github.com/datanika-io/datanika-landing/issues/604). So this connector stays **outside**
landing#395's `evidenced` count even though it has now been walked end to end; the metric counts the
artifact, not the effort, and inflating it here would be the exact dishonesty §5 warns about.

### Where and on what this was walked (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

| field | value |
|---|---|
| **Environment** | `local stack`: its own compose project (`growthwalk`), core's `docker-compose.yml` + `docker-compose.local.yml` and an overlay renaming every container and moving every published port into one band on `127.0.0.1`. Browser: a separate headless Chromium, not the shared MCP one. Every websocket recorded during the walk went to this stack's own backend (`mine=2/4, other=0` on each chain). |
| **Core revision** | `01de8b0cfbf6d8e41af8e2b590f561b944ef50d0`, `origin/master` when built — the 2026-09-16 promotion. Ancestor check against `origin/master` after a fresh fetch: **yes** (rc=0). Control: core `dev` `be59e5b` answered **no** (rc=1). |
| **Cloud revision** | `68a2ee5631db3f5099fca769d52a84187fb4f354`, `origin/master` when built. Ancestor check: **yes** (rc=0). |
| **Edition** | `cloud`, read from each container's own interpreter (app, worker). |
| **Configuration** | `production-graded`. `datanika_allow_local_file_paths` is `False` in the app and the worker — the one setting core's `deploy/server/export-prod-settings.sh` grades — read from each container's own interpreter. |
| **Guide revision** | landing `f77fed5a` on `dev`, the last commit to change `clickhouse.md` before this walk (the merge of PR #601). |
| **Destination** | ClickHouse **24.8.14.39**, `clickhouse/clickhouse-server:24.8`, reachable from the stack as host `clickhouse`. Pinned to 24.8 because that is the line core's own test for [core#1364] ran against. ⚠️ `datanika-examples` ships **no** ClickHouse, so this server was stood up for the walk — Tier 1's "a `docker compose up` away" premise does not cover this connector. |
| **Source** | MySQL 8 `online_store` from `datanika-examples`, connection `mysqlprodreadonly`. |
| **Not exercised** | TLS and ClickHouse Cloud entirely — the **Use HTTPS (TLS)** checkbox, the `9440` native-port derivation, Cloud's IP access list and its auto-suspend cold start · allowlisting Datanika's egress IPs · **Enable cluster replication** / `ON CLUSTER` · ClickHouse as a **source** (it appears in the source picker; nothing was loaded *from* it) · Step 5, the schedule — the walk org is at the Free plan's ceiling of 2 schedules and I would not delete another walk's evidence to make room · Load Mode `single_table`, Write Disposition `replace` and `merge`, Table names, Batch size, the Schema Contract dropdowns · the `ReplacingMergeTree` / `FINAL` troubleshooting entry · `Table doesn't exist` on subsequent runs (there was one run) · dbt transformations against ClickHouse |

### 2026-09-16 — walked end to end, and Step 1 was wrong

Walked by Growth through the UI, signed in to the same throwaway org the earlier walks created on this stack.

**Step 1, run as written against the real server.** `CREATE DATABASE IF NOT EXISTS raw_data`,
`CREATE USER datanika_loader`, and the guide's `GRANT` — all rc=0. The grant the server then reported is
exactly what the page promises:

```
GRANT SELECT, INSERT, ALTER TABLE, CREATE TABLE, DROP TABLE ON raw_data.* TO datanika_loader
```

🚨 **Following Step 1 exactly produced a green Test Connection and a failed load** — [landing#603].
Test Connection answered *"Connected successfully"* in 0.16 s, and the first run failed at `step=load` in
under two seconds with `rows_loaded` NULL:

```
Code: 497. DB::Exception: datanika_loader: Not enough privileges. To execute this query, it's necessary to
have the grant SELECT(table_name, column_name, data_type, is_nullable, numeric_precision, numeric_scale,
table_schema, ordinal_position) ON INFORMATION_SCHEMA.COLUMNS.
```

The destination was left holding one table, `mysqlintoclickhouse___dlt_sentinel_table`, with **0 rows**.
Baseline before that run: `raw_data` held **0** tables, so it is attributable.

**The minimal sufficient grant, measured rather than guessed.** ClickHouse exposes `INFORMATION_SCHEMA` and
`information_schema` as two *different* databases:

| grants held | `INFORMATION_SCHEMA.COLUMNS` | `information_schema.columns` |
|---|---|---|
| the guide's Step 1 grant only | DENIED | DENIED |
| `+ SELECT ON INFORMATION_SCHEMA.*` | ALLOWED (368) | DENIED |
| `+ SELECT ON information_schema.*` | ALLOWED | ALLOWED (737) |

The **uppercase** grant alone is sufficient: the lowercase one was revoked and confirmed `DENIED` again
before the successful run below. **Least privilege survives the fix** — with those grants the loader is
still refused `system.users`, `CREATE DATABASE` elsewhere, and writing into the `default` database, each
asserted by the presence of `ACCESS_DENIED` rather than by an absence of output.

**Step 2, both port arms** (the subject of [core#1341] / [core#1364]). One Test Connection at a time, each
waiting for its own verdict:

| port typed into the form's single port field | verdict |
|---|---|
| `9000`, the **native** TCP port | **red** — *"HTTP driver received HTTP status 400, server response: Port 9000 is for clickhouse-client program You must use port 8123 for HTTP. (for url http://clickhouse:9000)"* |
| `8123`, the **HTTP** port, as the guide says | **green** — *"Connected successfully"* |

So a native port in that field **is** caught by Test Connection, and the server names the right port itself —
the guide's old *"Connection refused"* wording never appears. Connection **8** `clickhouserawdata` created;
the saved row's Test action showed `circle-check` in 0.19 s. The form rendered **Connection Name, Host,
Port, User, Password, Database** plus the checkboxes **Use HTTPS (TLS)**, **Enable cluster replication**
and **Use raw JSON config** — the guide's Step 2 list is accurate. ⚠️ The Port field's **placeholder is
`5432`**, PostgreSQL's default, on the ClickHouse form; the prefilled *value* is correctly `8123`.

**Step 3.** Name rule as documented: `clickhouse-raw-load` → `clickhouserawload`. The destination picker
offered only the three types that can receive data and carried the label *"Only connection types Datanika
can load into are listed. MySQL and SQLite are supported as extract sources, but there is no loader driver
for them as destinations."* The four SQL-only controls appeared **because the source is MySQL**, which is
the point Step 3 makes. Stored config: `{"mode": "full_database", "write_disposition": "append"}`.

**Step 4, run 7: `success`, `Rows 7182`, 195,193 bytes, 1.02 s.** Counted in ClickHouse itself, as the admin
so the loader's own grants could hide nothing:

| table | destination | source | `SUM(id)` destination / source | control (source+1) |
|---|---|---|---|---|
| `goods` | 500 | 500 | 125250 / 125250 | not equal (good) |
| `orders` | 2000 | 2000 | 2001000 / 2001000 | not equal (good) |
| `order_items` | 4632 | 4632 | 10730028 / 10730028 | not equal (good) |
| `sellers` | 50 | 50 | 1275 / 1275 | not equal (good) |

The four sum to 7182, which is the run's own `Rows` figure. One run only; **no count here comes from a
second run.**

**Where the data actually went, which the guide had wrong.** ClickHouse has no schemas, so the upload could
not land in one named after itself. Everything went into the connection's database as
`raw_data.clickhouserawload___goods`, `___orders`, `___order_items`, `___sellers`, beside dlt's
`____dlt_loads`, `____dlt_pipeline_state`, `____dlt_version` and an empty `___dlt_sentinel_table`.

🚨 **`/models` listed none of it** — 7 entries, all from the three PostgreSQL-destination uploads; read in
the database, `catalog_entries` held nothing for this upload. [landing#604]. ⚠️ Narrow claim on purpose: the
only **successful** non-PostgreSQL load on this stack is this one, so whether the catalogue is
PostgreSQL-only by design or this is ClickHouse-specific is **not established**.

**Housekeeping, stated so the next reader is not puzzled by it.** To create this connection the walk org
needed a slot under the Free plan's ceiling of 5, and I soft-deleted **my own** connection 6
`mssqlwarehousewriter` — the SQL Server destination that provably cannot load ([core#1379]) — aimed by id
**and** name, with the other four live connections read back unchanged. Nothing outside this local stack was
touched. Upload 4 consequently now reads `blocked` with *"Its connection was deleted — restore it to run
again"*.

## Prior record (2026-07-19 / 2026-07-22), kept verbatim

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`clickhouse_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Host**, **Port**, **User**, **Password**, **Database**, plus the checkboxes **Use HTTPS (TLS)** and **Enable cluster replication**. The type dropdown shows the lowercase key **`clickhouse`**. Both **Test Connection** and **Create Connection** buttons render. **Major drift fixed:** the draft **omitted both checkboxes** and carried a callout claiming TLS "is not yet supported via the structured form" — contradicted by the shipped **Use HTTPS (TLS)** checkbox (confirmed in the screenshot). Both checkboxes documented; the TLS callout rewritten. Also fixed: dropdown key, "Name" → "Connection Name", "Save" → "Create Connection".

### About the 2026-07-22 screenshot

The ClickHouse connection in that shot was created **with placeholder credentials**, purely so the upload form had a connection of that type to select, and was **deleted immediately afterwards**. That is sound for this particular image and not for others: the form renders from the connection's *type* and *name*, no request is made, and nothing was submitted.

The visible fields are driven by the **source** (PostgreSQL), which is the whole point of Step 3: pick a different source and the SQL block disappears. See `/docs/connectors/csv` for the file-source shape and `/docs/connectors/freshdesk` for the SaaS-endpoint shape.

[landing#603]: https://github.com/datanika-io/datanika-landing/issues/603
[landing#604]: https://github.com/datanika-io/datanika-landing/issues/604
[core#1341]: https://github.com/datanika-io/datanika-core/issues/1341
[core#1364]: https://github.com/datanika-io/datanika-core/pull/1364
[core#1379]: https://github.com/datanika-io/datanika-core/issues/1379
