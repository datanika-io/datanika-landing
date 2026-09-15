# SQL Server setup-guide screenshots

Referenced from `src/content/connectors/mssql.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `mssql` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme. Demo values only; the password field renders masked. |
| `04-first-run.png` | Step 4 | The **Data preview** on the model detail page for the landed `goods_ratings` table (schema `salesdailysync`): the `Rows: 100` label, seven columns (`id`, `good_id`, `user_id`, `rating`, `created_at`, `_dlt_load_id`, `_dlt_id`) and the **first 20 of the 100 preview rows**, read live from the destination after run 1. `Rows: 100` is the preview's own limit — the table holds 3000 rows, counted in the destination below. Captured 2026-09-15 from a **local stack** (see *Where and on what this was walked*), light theme, 992 px wide at CSS scale, 73,166 B. `PRODUCT_RULES` §4 credential gate before the shot: 4 inputs, 0 credential-shaped, 0 non-empty. |

## Verification

`verified_by: growth-ui` / `verified_date: 2026-09-15`.

The 2026-07-18 record that stood here before was **field parity against the shipped UI source** plus the
add-connection capture. It was real and it is still true of the form, but it was not a connection and a run,
which is what `SPEC_CONNECTOR_GUIDE_VERIFICATION` §2 means by verified. The walk below is.

⚠️ **Part A (SQL Server as a source) is verified. Part B (SQL Server as a destination) is NOT — it fails
today**, and the guide says so. See *Part B* below.

### Where and on what this was walked (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

| field | value |
|---|---|
| **Environment** | `local stack`: its own compose project (`growthwalk`), core's `docker-compose.yml` + `docker-compose.local.yml` (the one-origin proxy) and a local overlay renaming every container and moving every published port into one band on `127.0.0.1`. The browser was a separate headless Chromium, not the shared one. Both websockets reached this stack's own backend and none reached anything else. |
| **Core revision** | `8ffd416575311b59678b0d301dde0102190b329f`, `origin/master` when built. The image was built from `git archive` of that commit — which records its own commit id — rather than from a working tree. `git merge-base --is-ancestor` against `origin/master` after a fresh fetch: **yes**. Control: core's `dev` head `d79c46f` answered **no**. |
| **Cloud revision** | `84ae6daa2e482a8ce24874caafa0b0988f6dad3c`, `origin/master` when built, archived the same way. Ancestor check: **yes**. Control: an unmerged cloud branch tip answered **no**. |
| **Edition** | `cloud`, read from each container's own interpreter (app, worker, scheduler). |
| **Configuration** | `production-graded`. `datanika_allow_local_file_paths` is `False` in the app, worker and scheduler — the one setting core's `deploy/server/export-prod-settings.sh` grades — read from each container's own interpreter. The same read with the value flipped in a throwaway environment printed `True`, so it is not a constant. Deviation: the two billing settings that script records without grading were at their code defaults; no step of this guide depends on them. |
| **Guide revision** | landing `b88100f`, the last commit to change `mssql.md` before this record (blob `0d3576d`). |
| **Source database** | SQL Server 2022 (RTM-CU24) `16.0.4245`, the `mcr.microsoft.com/mssql/server:2022-latest` image from `datanika-examples` `f031bd4` (the Online Store dataset), seeded with `--multiplier 1`, reachable from the stack at host `mssql`. `SERVERPROPERTY('IsIntegratedSecurityOnly')` is `0`, i.e. the mixed mode the guide's Windows-authentication note calls for. |
| **Destination** | Postgres database `walk_warehouse`, owner `walkdest`, inside this stack's own Postgres container. |
| **Not exercised** | allowlisting Datanika's egress IPs · the troubleshooting entry *Connection test times out* (`login_timeout=5`): a host that never answers could not be reproduced faithfully on this machine, whose container network accepts the TCP connection before failing upstream · TLS and the `TrustServerCertificate` note: whether the driver negotiated encryption was not measured · Windows Authentication (unsupported by design) · Azure SQL specifics · the collation, `rowversion` and bulk-insert troubleshooting entries · Load Mode `single_table`, Write Disposition `replace` and `merge`, Table names, Batch size, the Schema Contract dropdowns · the Target type dropdown's other options · a scheduled firing (the schedule was paused immediately) · Step 5.4 failure alerts · **Part B end to end** (see below) |

### 2026-09-15 — Part A walked end to end

Walked by Growth through the UI, signed in to the same throwaway org the MySQL walk created on this stack.

- **Step 1**, run as written against the source: `CREATE LOGIN` + `CREATE USER` + `GRANT SELECT ON SCHEMA::dbo` + `GRANT VIEW DEFINITION ON SCHEMA::dbo` for `datanika_readonly`. `sys.database_permissions` then lists exactly `SELECT` and `VIEW DEFINITION` on that schema.
- source connection **5** `mssqlerpreadonly`, type `mssql`: Host `mssql`, Port 1433, Database `online_store`, User `datanika_readonly`
- upload **2** `salesdailysync`: Load Mode `full_database`, Write Disposition `append`, **Source schema `dbo`** as the guide suggests, Table names blank, raw JSON unticked. Stored config: `{"mode": "full_database", "write_disposition": "append", "source_schema": "dbo"}`
- run **3** `success` in 3.15 s, Rows `4000`
- schedule **2** `upload: salesdailysync`, `0 4 * * *`, UTC: landed **Active**, then **paused**

**Least privilege, measured rather than assumed.** As `datanika_readonly`: `SELECT COUNT(*)` returns 3000 and 1000. A no-op write (`DELETE TOP (0) FROM dbo.reviews`) is refused with *"The DELETE permission was denied on the object 'reviews'"*, and `CREATE TABLE` with *"CREATE TABLE permission denied in database 'online_store'"*. The source was unchanged afterwards.

**Rows after run 1, counted in the destination database itself, not through the app:**

| table | destination rows | distinct `id` | at source |
|---|---|---|---|
| `goods_ratings` | 3000 | 3000 | 3000 |
| `reviews` | 1000 | 1000 | 1000 |

The schema `salesdailysync` holds exactly those two tables plus dlt's `_dlt_loads`, `_dlt_pipeline_state` and
`_dlt_version`; `_dlt_loads` holds one load. The two tables sum to 4000, which is the run's own Rows count.

Beyond counts, each figure read on both sides: `SUM(id)` 4501500, `SUM(good_id)` 757426, `SUM(user_id)` 756510
and `SUM(rating)` 12098 on `goods_ratings`; the rating split is identical (`1=148 2=136 3=405 4=1092 5=1219`);
`reviews` carries 18 distinct titles and 30,476 characters of `body` on both sides. The earliest and latest
`created_at` of each table are equal to the millisecond, and a one-hour shift of the source value — the control
— is not equal.

Types landed: `int` → `bigint`, `tinyint` → `bigint`, `nvarchar` → `character varying`, and `datetime2` →
**`timestamp without time zone`**. (The MySQL walk's `DATETIME` landed as `timestamp with time zone`; the
difference is the source type, not the destination.)

One run only. **No count in this record comes from a second run.**

#### What the guide got right, observed on screen

- **Step 2.** The form is inline. `mssql` renders **Connection Name \***, **Host \***, **Port \*** (prefilled `1433`), **User**, **Password** and **Database \***. Test Connection answered green *Connected successfully* in 0.26 s with the login Step 1 creates, and the saved row's **Test** action showed a green check in 0.22 s.
- **Step 3.** The name rule strips as the guide says: `sales-daily-sync` becomes `salesdailysync`. The pickers list `5 — mssqlerpreadonly (mssql)`. The four SQL-only controls are there — Load Mode, Write Disposition, Source schema, Table names — and the upload lands as `draft`.
- **Step 4.** **Run** is on the upload's own row. `/runs` shows the status badge, both timestamps and the Rows count. `/models` lists the two tables in a schema named after the upload and **no** `_dlt_*` table, and the model page's **Load first 100 rows** shows the preview captured above.
- **Step 5.** The form is inline, Target type defaults to `upload`, Timezone to `UTC`, the schedule lands **Active** with **Pause**.

#### What the walk measured otherwise (corrected in the same change)

- **Step 2.3's example name.** `mssql-erp-readonly` typed into the form becomes `mssqlerpreadonly`: connection names keep letters, digits and spaces. The guide documented that rule for *upload* names and not for connection names.
- **Troubleshooting quotes strings this driver never produces.** Datanika connects with `pymssql`, whose messages are not SSMS's. Measured through the product's own URL builder and message formatter, for all three failures:

  | attempt | what the user sees |
  |---|---|
  | wrong password | `(18456, b'DB-Lib error message 20018 … General SQL Server error … Adaptive Server connection failed (mssql)')` — **no** *"Login failed for user"* anywhere in it |
  | wrong database | `(18456, b"Login failed for user 'datanika_readonly'. …")` — **not** *"Cannot open database … requested by the login"* |
  | nothing listening on the port | `(20009 … Unable to connect: Adaptive Server is unavailable or does not exist (mssql) Net-Lib error during Connection refused (111))` — **not** *"A network-related or instance-specific error"* |

  So *"Cannot open database"* and *"A network-related or instance-specific error"* never appear, and *"Login
  failed for user"* appears for the **wrong database** rather than the wrong password. The causes and the
  fixes the guide gives are right; the quoted messages were not, and a reader searching for the text on their
  screen would have found nothing.

- **The message is truncated at 300 characters.** `connection_service._failure_reason` collapses whitespace and cuts the driver's reason at `_MAX_REASON_CHARS = 300`, appending `…`. Every failure above reaches the screen as 366 characters ending in an ellipsis, so the end of a long driver message is never visible. The guide now says to read the beginning of the message rather than expecting a specific sentence.

### Part B — SQL Server as a destination fails today

Walked because the guide documents it, and it does not work on this revision:

- upload **4** `mysqlintomssql`: MySQL source → SQL Server destination (the destination picker **does** offer SQL Server connections)
- run **5** `FAILED` after **0.3 s**, `rows_loaded` NULL:
  `Pipeline execution failed at 'step=sync' with exception: <class 'ImportError'> libodbc.so.2: cannot open shared object file: No such file or directory`
- the destination database `walk_dest` holds schema `dbo` and **no tables**; every table query answers `Msg 208 … invalid object name`. The source was untouched.

`pyproject.toml` declares `dlt[…,mssql,…]`, so dlt's mssql destination is installed, and it loads through
`pyodbc` — which needs a unixODBC runtime the image does not install. Asked of the worker directly,
`import pyodbc` raises the same `ImportError`. Filed as
[core#1379](https://github.com/datanika-io/datanika-core/issues/1379). The destination-side grants in Part B
were created and the login connects, but **nothing has ever been written through them**, so those grants are
unverified beyond that.

## Not captured

- `01-credentials.png`: Step 1 is SQL run in a SQL Server client; there is no Datanika screen to capture.
- `03-configure-upload.png` / `05-schedule.png`: the upload and schedule forms are connector-agnostic and already shown in the CSV guide.
