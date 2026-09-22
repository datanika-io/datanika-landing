# ClickHouse setup-guide screenshots

Referenced from `src/content/connectors/clickhouse.md` (destination-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `clickhouse` selected — shows the two checkboxes **Use HTTPS (TLS)** and **Enable cluster replication** below the db fields. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form with ClickHouse selected as the **Destination connection** (`23 — clickhousewarehouse (clickhouse)`), reading from a real PostgreSQL source (`16 — docssamplesdb (postgres)`). Captured 2026-07-22 by filling the live form on prod — **nothing was submitted**. Shows the point the step makes: Load Mode / Write Disposition / Source schema / Table names are there **because the source is a SQL database**, not because of ClickHouse. |
| `04-first-run.png` | Step 4 | The **Model Detail** page for the landed `clickhouserawload___sellers` table, captured whole. Its heading reads `Schema: raw_data \| Origin: clickhouserawload`. That schema is the **connection's database**, which is Step 4's ClickHouse-specific claim: no schema is named after the upload. Below it are six columns in ClickHouse's own types (`id` `Int64`, `registered_at` `DateTime64(6, 'UTC')`, the rest `String`) and the **Data preview**, with `Rows: 50` and all 50 rows, read live from ClickHouse after run 3. Before the shot, the preview's 50 ids were checked against the set ClickHouse returns for that table: equal, while a shifted set did not match. Captured 2026-09-22 from a **local stack** (see the 2026-09-22 walk below), light theme, 992x2780 CSS px, 222,322 B, sha256 `fb2f3cd7…edd567`, no PNG text chunks (a planted `tEXt` chunk read 1, so the scan can see one). `PRODUCT_RULES` §4 credential gate before the shot: 4 inputs, 0 credential-shaped, 0 non-empty. The same gate **refused** on the connection form while the password field held a value, so it can fail. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-09-22`.

**This connector is evidenced now.** The 2026-09-16 walk proved the data landed and could not show it: the
first-run capture is the `/models` **Data preview**, and `/models` listed nothing for a ClickHouse destination
until [core#1397] reached `master`. The 2026-09-22 walk ([landing#618]) repeated the guide end to end on a stack
carrying that fix, took `04-first-run.png` (above), and walked Step 5, which the earlier walk could not.

The earlier records are kept below exactly as written: the 2026-09-16 walk with its own §2.4 table, and the
2026-09-17 note. Only the opening of this section changed. Its previous text is kept verbatim, marked superseded.

### 2026-09-22 — walked end to end on the promoted revision, and the first-run capture taken

Walked by Product through the UI ([landing#618]), as a new account signed up on the stack for this walk. Each step
refused to create anything if this walk's object already existed, so every count below is a first-run count.

#### Where and on what this was walked (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

| field | value |
|---|---|
| **Environment** | `local stack`: core's `scripts/worktree-stack.sh`, compose project `wt-product`. That is core's `docker-compose.yml` + `docker-compose.local.yml` with the script's streamed isolation overlay: containers `wt-product-*`, every published port in Product's band on `127.0.0.1`, and the script's isolation check passing before anything started. The walk went through the stack's one-origin proxy. The frontend's usual port was relocated inside the band because Windows reserves it on this host today (the [core#1481] mechanism). Browser: a separate headless Chromium (Playwright 1.62, Chromium 151), not the shared MCP profile; every websocket recorded on every step went to this stack's own backend (`other=0`). ⚠️ The stack's Postgres volume persists between sessions and holds the 2026-09-17 openapi walk's rows, which that guide's README cites. They were left untouched. This walk ran in its own new org, and every refusal guard was scoped to this walk's names, each beside a control that counted an existing row. |
| **Core revision** | `525dc5bc4acaa23afe42a59e78ed844a844a0e9b`, `origin/master` when built. It carries `139112a6` ([core#1439]) and `0ece16b` ([core#1397]). Core was promoted during the walk, to `bdae4713`: four commits, whose only change in the walked paths is the `Dockerfile` (`72b662a`, which installs bun before `reflex init` — build time, not runtime), and no changed line mentions ClickHouse. Ancestor check against `origin/master` after a fresh fetch: **yes** (rc=0). Control: core `dev` `757e50b` answered **no** (rc=1). |
| **Cloud revision** | `d5089633ec35ae2aea88215349c25c22684add39`, `origin/master` when built. Cloud was promoted during the walk, to `950544bd`: five commits (CI secret handling, and the billing decision for `cancelling`), none in the connector flow. Ancestor check: **yes** (rc=0). Control: the unmerged branch tip `933ceef` answered **no** (rc=1). Cloud `dev` could not serve as the control, because the post-promotion resync had made it equal to `master`. |
| **Image** | Built from those two trees with the same tar stream and `docker build` command as core's `scripts/build-from-worktree.sh`, plus **one** build argument: `http_proxy`, pointing apt at a local buffering proxy. Without it the cold apt layer could not complete on this host: a 21 MB package failed on apt's own connection twice, while the same file downloads fine on its own ([core#1511]). `http_proxy` is Docker's predefined build arg: no `ARG` in the Dockerfile reads it, and the built image carries no proxy variable (read from the image). The Dockerfile, the build context and the target are unchanged, and the build's own `/mcp` and FreeTDS ODBC assertions passed. |
| **Edition** | `cloud`, read from each container's own interpreter (app, worker). |
| **Configuration** | `production-graded`. `datanika_allow_local_file_paths` is `False` in the app and the worker, read from each container's own interpreter. The same read in a process given `DATANIKA_ALLOW_LOCAL_FILE_PATHS=true` printed `True`, so the read is not a constant. |
| **Guide revision** | landing `a0c144a2` (blob `b38c3064`), the last commit to change `clickhouse.md` before this walk. The same blob was on `dev` and on `main`. |
| **Destination** | ClickHouse **24.8.14.39** (`clickhouse/clickhouse-server:24.8`), from `docs/walk-fixtures/clickhouse.compose.yml` in this repository: Growth's fixture from the 2026-09-16 walk, promoted in this change and used verbatim. It sets no `CLICKHOUSE_USER`, `CLICKHOUSE_DB` or `CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT`, and before Step 1 the server held neither `raw_data` nor `datanika_loader` (the same query found `default`, so it can find a row). Reachable from the stack as host `clickhouse`, on 8123 over HTTP and 9000 over the native protocol. Worker libraries: dlt 1.21.0, clickhouse-connect 0.11.0, clickhouse-driver 0.2.10. |
| **Source** | MySQL 8.4.8 `online_store` from `datanika-examples` (`f031bd4`), seeded at `--multiplier 1` (its `databases.conf` defaults to 100), MySQL only, by replaying `seed_data.py`'s own generators in their order. That gives `sellers` 50, `goods` 500, `orders` 2000, `order_items` 4632, the counts every earlier walk of this dataset recorded. Connection `mysqlonlinestore`, as a user granted `SELECT` only. ⚠️ **The same seed does not give the same countries.** `generate_sellers` draws the `country` column from `list(set(COUNTRIES))`, whose order follows `PYTHONHASHSEED`. Measured: two hash seeds gave two orders, and the same hash seed twice gave one. So this capture's countries (and the seller names that embed one) differ from the mysql guide's capture for the same ids; counts and ids do not. `datanika-examples` has no remote, so there is nowhere to file it. |
| **Not exercised** | TLS and ClickHouse Cloud entirely: the **Use HTTPS (TLS)** checkbox, the `9440` derivation, Step 1's `--port 9440 --secure` client command, Cloud's IP access list and its auto-suspend · allowlisting Datanika's egress IPs · **Enable cluster replication** / `ON CLUSTER` · ClickHouse as a **source** (it is offered in the source picker; nothing was loaded from it) · Load Mode `single_table`, Write Disposition `replace` and `merge`, Source schema, Table names, Batch size, the Schema Contract dropdowns · a native port blocked while HTTP is open (the `step=sync` entry) · the `Authentication failed`, `Table doesn't exist`, `FINAL` and cold-start entries · a second run · a schedule **firing** (no scheduler ran, and the schedule was paused after it was read back) · Step 5.4, failure alerts · dbt transformations against ClickHouse |

#### What each step did

**Step 1, run as written, as the fixture's admin.** All four statements returned rc=0, and the server then
reported exactly the grants the page gives:

```
GRANT SELECT ON INFORMATION_SCHEMA.* TO datanika_loader
GRANT SELECT, INSERT, ALTER TABLE, CREATE TABLE, DROP TABLE ON raw_data.* TO datanika_loader
```

As `datanika_loader`, each claim of *Least privilege* held, asserted by the presence of `ACCESS_DENIED`:
`system.users`, `CREATE DATABASE` and `CREATE TABLE` in `default` are refused. Reading `INFORMATION_SCHEMA.COLUMNS`
(368 rows), and creating and dropping a table in `raw_data`, are allowed, so the refusals discriminate. The case
warning held too: under the uppercase grant, lowercase `information_schema.columns` is refused.

**Step 2.** The form rendered **Connection Name, Host, Port, User, Password, Database** and the checkboxes **Use
HTTPS (TLS)** and **Enable cluster replication**, plus the generic **Use raw JSON config**, with Port prefilled
`8123`. ⚠️ Port's placeholder is still `5432`, PostgreSQL's default, as on 2026-09-16. Both port arms, one Test
Connection at a time, each waiting for its own verdict:

| port typed into the form's single port field | verdict |
|---|---|
| `9000`, the native TCP port | **red**: the Troubleshooting entry's quoted text, verbatim, followed by `(for url http://clickhouse:9000)` |
| `8123`, the HTTP port, as the guide says | **green**: *"Connected successfully"*, in 0.39 s, with the `check` icon (`connections.py`) |

The server's own `query_log` shows what the check sent as `datanika_loader`: `SELECT version(), timezone()`, a
read of `system.settings`, then `SELECT 1`. So Step 2.4's *"Datanika runs a `SELECT 1`"* is accurate. Connection
`clickhouseanalytics` was created and stored with `port` 8123 and `secure` false (decrypted by the app's own
interpreter; the password was never printed). The saved row's **Test** showed `circle-check` in 0.24 s.

**Step 3.** `clickhouse-raw-load` was stripped to `clickhouserawload` as typed. The destination picker offered only
`5 — clickhouseanalytics (clickhouse)`, under its note *"Only connection types Datanika can load into are listed"*.
The source picker offered ClickHouse as well, which is the page's *"ClickHouse can also be a source"* callout.
Load Mode, Write Disposition, Source schema and Table names appeared because the source is MySQL, and Batch size
and the Schema Contract dropdowns were there too. Created as `draft`, stored
`{"mode": "full_database", "write_disposition": "append"}`.

**Step 4: run 3, `success`, Rows `7182`, 195,224 bytes, 9.0 s.** Triggered from the upload's own row (a *"Run
triggered"* toast), then watched on `/runs`, whose columns are Status, Started, Finished, Rows, Error and Logs.
Counted in ClickHouse as the admin, so the loader's own grants could hide nothing:

| table | destination | source | `SUM(id)` destination / source | control (source+1) |
|---|---|---|---|---|
| `goods` | 500 | 500 | 125250 / 125250 | not equal (good) |
| `orders` | 2000 | 2000 | 2001000 / 2001000 | not equal (good) |
| `order_items` | 4632 | 4632 | 10730028 / 10730028 | not equal (good) |
| `sellers` | 50 | 50 | 1275 / 1275 | not equal (good) |

The four sum to 7182, the run's own figure. `raw_data` held **0** tables before the run. Afterwards it held exactly
what Step 4.3 names: `clickhouserawload___goods`, `___order_items`, `___orders` and `___sellers`, beside
`____dlt_loads`, `____dlt_pipeline_state`, `____dlt_version` and an empty `___dlt_sentinel_table`. Step 4.4's SQL,
run verbatim as `datanika_loader`, listed them and counted 50 in `___sellers`.

**Step 4.3 — `/models` lists the load as the page says, which is what 2026-09-16 could not show.** It listed four
rows: exactly the four prefixed tables, each with Schema `raw_data` (the connection's database), Origin
`clickhouserawload` and Last Status `success`, and **none** of dlt's bookkeeping tables or the sentinel. The detail
page for `clickhouserawload___sellers` read `Schema: raw_data | Origin: clickhouserawload` with ClickHouse's column
types, and **Load first 100 rows** returned `Rows: 50`. That page is the capture above. Nothing in a `/models` row
was clicked: the detail page was reached through the row link's own `href` (`/models/9`), because that row's
Delete acts on the first click ([core#851]).

**Step 5, walked for the first time on this guide.** The New Schedule form is inline. **Target type** offers
`upload`, `transformation` and `pipeline`, and **Timezone** was prefilled `UTC`. Entering `upload` /
`clickhouserawload` / `0 3 * * *` gave *"Schedule saved"*, and the row landed **Active** with **Pause**, as Step 5.3
says. It was then paused, aimed by the row's own content, so that nothing can fire at a server that will be gone:
the row read **Inactive** with **Resume**, and `is_active` was stored false.

**What the walk found wrong with the page: nothing.** Every claim it makes that this stack could reach held. On
2026-09-16 Step 1 was wrong and Step 4 could not be evidenced; both are resolved. The one change the guide needed
is the capture itself, referenced at the end of Step 4.

### Superseded 2026-09-22: how this section opened after the 2026-09-16 walk, kept verbatim

*True when written. The capture it says cannot exist was taken on 2026-09-22 (above), once core#1397 had reached `master`.*

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

*(2026-09-17: the path can produce one now that core#1397 is in production, and the capture still has not been
taken. See the dated note at the end of the walk.)*

### Where and on what this was walked (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

*The 2026-09-16 walk's record, kept as written. The 2026-09-22 walk's is in its own section above.*

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

### 2026-09-17 — Step 4 goes back to `/models`, and nobody has re-walked it

Product removed Step 4's *"`/models` does not list what a ClickHouse load landed"* callout and sent the reader to
`/models` and the Data preview again. That was the flip condition recorded on
[core#1397](https://github.com/datanika-io/datanika-core/issues/1397). The fix is core `0ece16b` (*"Catalogue a
ClickHouse upload under the database and the prefixed table name"*). It is on core `master` `da634df5`, whose
production deploy (`deploy-pointer.yml` run 35228187079) completed `success`.

**What the new text rests on:** Engineering's record on core#1397. Against a real
`clickhouse/clickhouse-server:24.8.14.39`, through `run_upload`, with no patch on the load or the sync:
- each table is catalogued as the connection's database plus the prefixed table name;
- dlt's bookkeeping tables and the sentinel are not listed;
- listed tables carry their columns.

Engineering records all six of that issue's criteria as asserted, including the Data preview returning the rows that
are in ClickHouse.

**Still true, and still why this connector is outside landing#395's `evidenced` count:** there is no
`04-first-run.png`. The capture is landing#618 (Growth), which is no longer blocked by core#1397. It waits for a walk
stack. `verified_by` and `verified_date` are unchanged.

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
[landing#618]: https://github.com/datanika-io/datanika-landing/issues/618
[core#851]: https://github.com/datanika-io/datanika-core/issues/851
[core#1397]: https://github.com/datanika-io/datanika-core/issues/1397
[core#1439]: https://github.com/datanika-io/datanika-core/issues/1439
[core#1481]: https://github.com/datanika-io/datanika-core/issues/1481
[core#1511]: https://github.com/datanika-io/datanika-core/issues/1511
