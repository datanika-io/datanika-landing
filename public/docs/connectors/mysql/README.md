# MySQL setup-guide screenshots

Referenced from `src/content/connectors/mysql.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `mysql` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |
| `04-first-run.png` | Step 4 | The **Data preview** on the model detail page for the landed `sellers` table (schema `onlinestoresync`): the `Rows: 50` label, six columns (`id`, `name`, `registered_at`, `country`, `_dlt_load_id`, `_dlt_id`) and all 50 rows, read live from the destination after run 1. Every row carries the same `_dlt_load_id`. Captured 2026-09-15 from a **local stack** (see *Where and on what this was walked*), light theme, 992x1870 CSS px, 187,393 B, no PNG text chunks. `PRODUCT_RULES` §4 credential gate before the shot: 4 inputs, 0 credential-shaped, 0 non-empty. |

## Verification

`verified_by: growth-ui` / `verified_date: 2026-09-15`.

The 2026-07-18 record that stood here before was **field parity against the shipped UI source** (`db_fields()` and
`en.json` on `origin/master`) plus the add-connection capture. It was real and it is still true of the form, but it
was not a connection and a run, which is what `SPEC_CONNECTOR_GUIDE_VERIFICATION` §2 means by verified. The walk
below is.

### Where and on what this was walked (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

| field | value |
|---|---|
| **Environment** | `local stack`: its own compose project, run with core's `docker-compose.yml` + `docker-compose.local.yml` (the one-origin proxy) and a local overlay that renamed containers and host ports and set the edition and the graded setting below. The browser was a separate headless Chromium. |
| **Core revision** | `ada0987092043e3f6ad1a86c0ecae8992a8eba8c`, `origin/master` when built. The image was built from `git archive` of that commit, which records its own commit id, rather than from a working tree. `git merge-base --is-ancestor` against `origin/master` after a fresh fetch: **yes**. Control: core's `dev` head answered **no**. |
| **Cloud revision** | `9a1b2ea9e94ac731006b29076936e7b7afce7d7f`, `origin/master` when built, archived the same way. Cloud `master` moved to `84ae6da` during the walk; the change between them is one spec document. Ancestor check: **yes**. Control: an unmerged branch tip answered **no**. |
| **Edition** | cloud, read from each container's own interpreter |
| **Configuration** | `production-graded`. `datanika_allow_local_file_paths` is `False` in the app, worker and scheduler, read from each container's own interpreter; it is the one setting core's `deploy/server/export-prod-settings.sh` grades. The same read with that value flipped printed `True`, so the read is not a constant. Deviation: the two billing settings that script records without grading were at their code defaults. No guide step depends on them. |
| **Guide revision** | landing `f92f9e4`, the last commit to change `mysql.md` before this record (blob `a640846b`). The same blob was on `dev` when the walk began (`a441cba`) and when this record was written. |
| **Source database** | MySQL 8.4.8 from `datanika-examples` `f031bd4` (the Online Store dataset), seeded with `--multiplier 1`, reachable from the stack at host `mysql`. Server time zone UTC. |
| **Not exercised** | allowlisting Datanika's egress IPs · the troubleshooting entry *Connection test times out*: a host that never answers could not be reproduced faithfully on this machine, whose container network accepts the TCP connection before failing upstream · Load Mode `single_table`, Write Disposition `replace` and `merge`, Source schema, Table names · the Schema Contract dropdowns · the Target type dropdown's other options · a scheduled firing (the schedule was paused first) · Step 5.4, failure alerts |

### 2026-09-15 — walked end to end

Walked by Growth through the UI, signed up as a new user in a fresh org (`Growth Walk's Org`) on that stack:

- **Step 1**, run as written against the source: `datanika_readonly` with `GRANT SELECT ON online_store.*`
- destination connection **1** `walkwarehouse` (postgres), the prerequisite
- source connection **2** `mysqlprodreadonly`, type `mysql`: Host `mysql`, Port 3306, Database `online_store`, User `datanika_readonly`. The stored config was read back (non-secret keys only) and names that user.
- upload **1** `onlinestoresync`: Load Mode `full_database`, Write Disposition `append`, Source schema and Table names blank, raw JSON unticked
- run **1** `success` in 1.96 s, Rows `7182`
- schedule **1** `upload: onlinestoresync`, `0 3 * * *`, UTC: landed **Active**, then **paused**

Connections 3 and 4 in that org were duplicates of 1 and 2, created by an error in the walk's own tooling. They
were soft-deleted before the upload was created, and nothing below used them.

**Source counts, read in MySQL itself:** `sellers` 50, `goods` 500, `orders` 2000, `order_items` 4632.

**Rows after run 1, counted in the destination database itself, not through the app:**

| table | rows | distinct `id` | at source |
|---|---|---|---|
| `sellers` | 50 | 50 | 50 |
| `goods` | 500 | 500 | 500 |
| `orders` | 2000 | 2000 | 2000 |
| `order_items` | 4632 | 4632 | 4632 |

The schema `onlinestoresync` holds exactly these four tables plus dlt's `_dlt_loads`, `_dlt_pipeline_state` and
`_dlt_version`; `_dlt_loads` holds one load. The sum, 7182, equals the run's Rows count, and the Data preview's
`Rows: 50` equals the destination's count for `sellers`.

Beyond counts: `SUM(orders.total_amount)` is 2181530.07 on both sides, `SUM(order_items.quantity)` is 8741 on both
sides, the orders-by-status split is identical, and the earliest and latest value of each timestamp column is
identical in UTC (a one-hour shift, as a control, does not compare equal). Types landed as `bigint` ids,
`numeric` for the DECIMAL columns, `character varying` for the ENUM `status`, and `timestamp with time zone` for
the DATETIME columns.

One run only. No count here comes from a second run. After this record was complete, the upload was run a second time for a separate measurement of `append` on an unchanged source; nothing in this README uses that run.

#### What the guide got right, observed on screen

- **Step 1.2.** The user as written can read (`SELECT COUNT(*) FROM orders` → 2000) and cannot write: an `INSERT`
  was refused with `ERROR 1142`.
- **Step 2.** The form is inline. `mysql` renders **Connection Name \***, **Host \***, **Port \*** (prefilled `3306`),
  **User**, **Password** and **Database \***, and no Schema field. **Test Connection** answered with a green
  *Connected successfully* in 0.16 s. With the password mistyped it answered red, in 0.16 s, with the text the
  troubleshooting entry quotes: `(1045, "Access denied for user 'datanika_readonly'@'…' (using password: YES)")`.
  With the wrong port it answered `(2003, "Can't connect to MySQL server on 'mysql' ([Errno 111] Connection
  refused)")`. Editing a field after testing clears the result.
- **Step 3.** The name rule strips as you type (`online-store-sync` → `onlinestoresync`). The pickers list
  `2 — mysqlprodreadonly (mysql)`, and the destination picker offers no MySQL connection, as the opening note says.
  The SQL block shows Load Mode `full_database` and Write Disposition `append` by default; Batch size and the
  Schema Contract dropdowns are there too. The upload lands as `draft`.
- **Step 4.** **Run** is on the upload's row. `/runs` shows the status badge, both timestamps and the Rows count.
  `/models` lists the four tables in a schema named after the upload and no `_dlt_*` table. The model page's
  **Load first 100 rows** shows the preview captured above.
- **Step 5.** The form is inline, Target type defaults to `upload`, Timezone to `UTC`, and the schedule lands
  **Active** with **Pause**.

#### What the walk measured otherwise (corrected in the same change)

- **Step 1.3** said a `GRANT SELECT` covers only the tables that exist when it is run, and to re-run it for tables
  created later. For MySQL that is not so. A table created in `online_store` after
  `GRANT SELECT ON online_store.*` was readable by the user straight away, while a table in a database the grant
  does not name was refused (`ERROR 1142`). A grant on `<database>.*` covers tables created later.
- **Step 2.3** used `mysql-prod-readonly` as its example name. Typed into the form it becomes `mysqlprodreadonly`:
  connection names keep letters, digits and spaces, the same rule Step 3 states for upload names.

A further detail, not a guide error: the Port field keeps the placeholder `5432` behind its prefilled `3306`, which
shows only if the field is cleared.

## Not captured

- `01-credentials.png`: Step 1 is SQL run in a MySQL client; there is no Datanika screen to capture.
- `03-configure-upload.png` / `05-schedule.png`: the upload and schedule forms are connector-agnostic and already
  shown in the CSV guide.
