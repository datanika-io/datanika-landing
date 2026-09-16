# SQLite setup-guide screenshots

Referenced from `src/content/connectors/sqlite.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `sqlite` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |
| `04-first-run.png` | Step 4 | The **Data preview** on the model detail page for the landed `sellers` table (schema `appdatasync`): the `Rows: 50` label, six columns (`id`, `name`, `registered_at`, `country`, `_dlt_load_id`, `_dlt_id`) and all 50 rows, read live from the destination after run 10. Every row carries the same `_dlt_load_id`. Captured 2026-09-16 from a **local stack** (see *Where and on what this was walked*), light theme, 992x1870 CSS px, 188,073 B, no PNG text chunks (a planted `tEXt` chunk read 1, so the scan can see one). `PRODUCT_RULES` §4 credential gate before the shot: 4 inputs, 0 credential-shaped, 0 non-empty. |

## Verification

`verified_by: growth-ui` / `verified_date: 2026-09-16`.

The 2026-07-18 record that stood here before was **field parity against the shipped UI source** plus the
add-connection capture. It was real and it is still true of the form, but it was not a connection and a run,
which is what `SPEC_CONNECTOR_GUIDE_VERIFICATION` §2 means by verified. The walk below is. The earlier record is
kept verbatim in *Prior record* at the bottom, per §4's forward-facing rule.

### Where and on what this was walked (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

| field | value |
|---|---|
| **Environment** | `local stack`: its own compose project (`growthwalk`), core's `docker-compose.yml` + `docker-compose.local.yml` and an overlay renaming every container (`growthwalk-app`, `growthwalk-celery`, …) and moving every published port into one band on `127.0.0.1`. The commands quoted from the guide below were run with those container names. Browser: a separate headless Chromium, not the shared MCP one; every websocket recorded went to this stack's own backend (`other=0` on every step). |
| **Core revision** | `01de8b0cfbf6d8e41af8e2b590f561b944ef50d0`, `origin/master` when built. Core was promoted during the walk to `ba7289b9`, a single merge whose only change in the walked paths is `connection_state.py`; no line mentioning SQLite changed in `dlt_runner.py` or `connection_service.py`. Ancestor check against `origin/master` after a fresh fetch: **yes** (rc=0). Control: the unmerged branch tip `6642ef62` answered **no** (rc=1). Core `dev` could not serve as the control, because the post-promotion resync had made it equal to `master`. |
| **Cloud revision** | `68a2ee5631db3f5099fca769d52a84187fb4f354`, `origin/master` when built and when recorded. Ancestor check: **yes** (rc=0). Control: the unmerged branch tip `933ceeff` answered **no** (rc=1). |
| **Edition** | `cloud`, read from each container's own interpreter (app, worker, scheduler). |
| **Configuration** | `self-hosted defaults`, because the guide scopes itself to self-hosting. `DATANIKA_ALLOW_LOCAL_FILE_PATHS` was **not set**, and resolved `True` in the app, the worker and the scheduler, read from each container's own interpreter. The same read with the variable set to `false` printed `False`, so the read is not a constant. **Deviation:** `DATANIKA_EDITION=cloud` was set, as on every §2.4 walk on this stack; a stock `docker compose up` leaves it unset, which is `core`. |
| **What Datanika Cloud does instead** | Measured in a throwaway process with `DATANIKA_ALLOW_LOCAL_FILE_PATHS=false`, the value production runs: saving this connection's config is refused with `LocalPathNotAllowedError` — *"Local file paths aren't available on this deployment. Upload the file instead, or point this connection at a database."* That is the refusal behind the guide's *self-hosted-only* prerequisite. The same call on the stack's own default was allowed. |
| **Guide revision** | landing `f92f9e4` (blob `4760c9be`), the last commit to change `sqlite.md` before this walk; the same blob was on `dev` and on `main`. |
| **Source** | A SQLite file built for the walk from the `datanika-examples` Online Store dataset (`f031bd4`, MySQL 8.4.8): four tables — `sellers` 50, `goods` 500, `orders` 2000, `order_items` 4632 — declared with SQLite types (`INTEGER`, `TEXT`, `NUMERIC(10,2)`, `DATETIME`), rollback-journal mode, `PRAGMA integrity_check` ok, 262,144 bytes, sha256 `53addaf7…8641965`. Counts, `SUM(total_amount)` and `SUM(quantity)` equal MySQL's before anything loaded it. The worker's libraries: SQLite 3.46.1, SQLAlchemy 2.0.46, dlt 1.21.0. |
| **Destination** | `walkwarehouse`, PostgreSQL, database `walk_warehouse` on the stack's own Postgres. |
| **Not exercised** | Datanika Cloud end to end (the guide scopes itself to self-hosting; only the save-time refusal above was measured) · the read-only **bind mount** variant of Step 1 (`:ro`) · a file on the host rather than in a named volume · a worker running as a non-root user (both containers ran as `root`, so file permissions never came into it) · WAL mode and `database is locked` · `database disk image is malformed` · the type-affinity troubleshooting entry · the size guidance · Load Mode `single_table`, Write Disposition `replace` and `merge`, Source schema, Table names, Batch size, the Schema Contract dropdowns · the Target type dropdown's other options · a scheduled firing (the schedule was paused first) · Step 5.4, failure alerts · egress-IP allowlisting (not applicable to a local file) |

### 2026-09-16 — walked end to end, three ways

Walked by Growth through the UI, signed in to the throwaway org `Growth Walk's Org` that the earlier walks
created on this stack. **One connection and three uploads**, because the question the guide's Step 1 warning
raises is what a run does when only the web app can see the file — so the worker's view was varied while the
connection stayed the same.

**Step 1.** Arm A added the guide's `sqlite_sources` volume to the web app only; arm B added it to both, but with
the worker's half mistyped as `sqlite_source`, so Compose gave the worker a second, empty volume at the same
path; arm C used the guide's snippet exactly. Step 1.2's `docker cp` into the web app ran once, in arm A (rc=0,
same sha256 inside the container as on disk), and the web app kept that volume through arms B and C.

| arm | Step 1.3's probe from the worker | what the worker had |
|---|---|---|
| A | `ls: cannot access '/var/datanika/sources/online_store.sqlite': No such file or directory`, rc=2 | no such directory |
| B | the same message, rc=2 | the directory, and no file |
| C | `-rwxr-xr-x 1 root root 262144 … online_store.sqlite`, rc=0 | the same file: identical sha256 in both containers |

**Step 2.** The form rendered exactly **Connection Name \*** and **Database Path \*** (placeholder `/data/my.db`),
plus **Use raw JSON config** — the guide's "two inputs" is right. The guide's example name `sqlite-myapp`
typed as `sqlitemyapp`. One Test Connection at a time, each waiting for its own verdict, all in 0.17–0.18 s:

| path in the form | verdict |
|---|---|
| `/var/datanika/sources/missing.sqlite` (nothing there) | **red** — *No database at '/var/datanika/sources/missing.sqlite'. Check the path, or create the file first.* No file was created in the web app afterwards. |
| `/etc/hostname` (exists, plain text) | **red** — *Cannot open '/etc/hostname' — check that it is a database file and that it is readable.* |
| `/var/datanika/sources/online_store.sqlite` (arm A: the worker cannot see it) | **green** — *Connected — read the database at '/var/datanika/sources/online_store.sqlite'.* |

Connection **9** `sqlitemyapp` created.

**Step 3.** Name rule as documented (`worker-cannot-see` → `workercannotsee`, `app-data-sync` → `appdatasync`).
The source picker listed `9 — sqlitemyapp (sqlite)`. The **destination** picker listed only
`8 — clickhouserawdata (clickhouse)` and `1 — walkwarehouse (postgres)` — no SQLite connection — under the label
*"Only connection types Datanika can load into are listed. MySQL and SQLite are supported as extract sources, but
there is no loader driver for them as destinations."* The SQL block appeared with Load Mode `full_database` and
Write Disposition `append` by default, Source schema, Table names and Batch size, plus the Schema Contract
dropdowns. Stored config `{"mode": "full_database", "write_disposition": "append"}`, status `draft`.

**Step 4 — one run per upload, and they did not agree:**

| arm | upload | run | status | Rows | what it left behind |
|---|---|---|---|---|---|
| A | 7 `workercannotsee` | 8 | **`FAILED`**, 0.36 s | — | `(sqlite3.OperationalError) unable to open database file (Background on this error at: https://sqlalche.me/e/20/e3q8)`. No destination schema. Nothing in the worker. |
| B | 8 `workertypovolume` | 9 | 🚨 **`SUCCESS`**, 1.71 s, 529 B | **0** | A destination schema `workertypovolume` holding only `_dlt_loads`, `_dlt_pipeline_state`, `_dlt_version` — and a **0-byte `online_store.sqlite` in the worker's directory that was not there before the run.** Filed as [core#1401](https://github.com/datanika-io/datanika-core/issues/1401). |
| C | 9 `appdatasync` | 10 | `SUCCESS`, 1.44 s, 181,739 B | **7182** | The four tables. The source file's sha256 was unchanged afterwards in both containers, and no journal file appeared. |

So the guide's warning — *"Test Connection goes green while every run fails"* — held for arm A and **not for
arm B**, where the run succeeded with nothing. And after arm B's run, Step 1.3's `ls -l` probe would list a file
(0 bytes) where before it said *No such file or directory*: an existence check stops catching the problem once
one run has happened. Both are corrected in the guide.

**Rows after run 10, counted in the destination database itself, not through the app:**

| table | rows | distinct `id` | `SUM(id)` | SQLite file | MySQL origin | control (source+1) |
|---|---|---|---|---|---|---|
| `sellers` | 50 | 50 | 1275 | equal | equal | not equal |
| `goods` | 500 | 500 | 125250 | equal | equal | not equal |
| `orders` | 2000 | 2000 | 2001000 | equal | equal | not equal |
| `order_items` | 4632 | 4632 | 10730028 | equal | equal | not equal |

The four sum to 7182, the run's own **Rows** figure, and `_dlt_loads` holds one load. Beyond counts:
`SUM(orders.total_amount)` 2181530.07, `SUM(order_items.quantity)` 8741 and `SUM(goods.price)` 123925.87 are
equal on both sides; the orders-by-status split is identical (cancelled 111, delivered 1404, processing 201,
shipped 284); the first 12 `goods` rows hash identically field by field. **Types:** ids and integers landed as
`bigint`, `NUMERIC` as `numeric`, `TEXT` as `character varying`, and `DATETIME` text as
`timestamp with time zone` carrying the **same clock time marked UTC** (`2023-12-24 12:46:00` →
`2023-12-24 12:46:00+00`; a one-hour shift, as a control, does not compare equal). One run only; no count here
comes from a second run.

`/models` listed the four `appdatasync` tables and no `_dlt_*` table, as Step 4.3 says; it listed nothing for
`workertypovolume`, which had no tables. The model page's **Load first 100 rows** gave the preview captured above.

**Step 5.** The form was inline, Target type defaulted to `upload`, Timezone to `UTC`. Schedule **4**
`upload: appdatasync`, `0 3 * * *`, landed **Active** with **Pause**, and was then paused (**Inactive**,
**Resume**).

**The "Not a destination" bullet** (landing#577) was measured as well as read: the product's own
`UploadService.create_upload`, called in a throwaway process with connection 9 as the destination, refused with
`UserFacingError` — *"Connection 9 is a sqlite connection, which Datanika can read from but cannot load into"* —
while the same call with connection 1 was not refused. Both calls ran in a transaction that was rolled back; the
upload count read 9 before and after, and no row was left.

#### What the walk measured otherwise (corrected in the same change)

- **Step 1's warning** said a file only the web app sees makes *every* run fail. Arm B succeeded with 0 rows.
  The guide now gives both outcomes and tracks the second as core#1401.
- **Step 1.3's probe** checked existence, which one run defeats. It now compares checksums from both containers.
- **Step 2.3's example name** `sqlite-myapp` cannot be typed as shown.
- **Step 2.4** said any failure *"is a path or permission issue"*. A plain text file gets its own answer, and the
  guide now quotes all three.
- **The form note** said the connector *"opens the file read-only at pipeline runtime, enforced by the source
  role"*. A run did not change the file, but it is not a read-only open: arm B's run created one.
- **Step 3.2's example** read *"so `appdatasync` becomes `appdatasync`"*, which demonstrates nothing.
- **Troubleshooting** `unable to open database file` is what a **run** says; Test Connection never shows it.
  *First run completes instantly with zero rows* now leads with the cause arm B produced.
- **Added:** how a SQLite `DATETIME` column lands in PostgreSQL.

**Housekeeping, stated so the next reader is not puzzled by it.** The walk org was at the Free plan's ceilings
(5 connections, 2 schedules). I soft-deleted **my own** connection **5** `mssqlerpreadonly` and **my own**
paused schedule **2**, both from the SQL Server walk and both already recorded in that guide's README, each with
a targeted update aimed by id **and** name or target, and read the other live rows back unchanged. Upload 2
consequently reads `blocked`. Upload id **10** does not exist: the rolled-back refusal probe consumed it from the
sequence.

## Prior record (2026-07-18), kept verbatim

`verified_by: product-ui` / `verified_date: 2026-07-18` — Step-2 field labels verified against the live shipped UI (`sqlite_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form has a single field: **Database Path** (required), plus **Connection Name** above. The type dropdown shows the lowercase key **`sqlite`**. Both **Test Connection** and **Create Connection** buttons render. The draft field text was already accurate; only the dropdown casing was corrected and this screenshot added.
