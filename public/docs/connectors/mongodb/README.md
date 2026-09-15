# MongoDB setup-guide screenshots

Referenced from `src/content/connectors/mongodb.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `mongodb` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme. Demo values only; the password field renders masked. ⚠️ It predates the **Authentication database** field described below, so it shows six controls where the form now has seven. |
| `04-first-run.png` | Step 4 | The **Data preview** on the model detail page for the landed `users` table (schema `mongodailysync`): the `Rows: 100` label and the **first 20 of the 100 preview rows**, read live from the destination after run 1. `Rows: 100` is the preview's own limit — the table holds 500 rows, counted in the destination below. The table is 13 columns wide and the frame shows the first seven, including `contacts__email` — the flattening the guide promises, visible as a column. Captured 2026-09-15 from a **local stack** (see *Where and on what this was walked*), light theme, 992 px wide at CSS scale, 97,763 B. `PRODUCT_RULES` §4 credential gate before the shot: 4 inputs, 0 credential-shaped, 0 non-empty. |

## Verification

`verified_by: growth-ui` / `verified_date: 2026-09-15`.

The 2026-07-18 record that stood here before was **field parity against the shipped UI source** plus the
add-connection capture — real, and not a connection and a run. The walk below is.

### Where and on what this was walked (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

| field | value |
|---|---|
| **Environment** | `local stack`: its own compose project (`growthwalk`), core's `docker-compose.yml` + `docker-compose.local.yml` (the one-origin proxy) and a local overlay renaming every container and moving every published port into one band on `127.0.0.1`. The browser was a separate headless Chromium, not the shared one. Both websockets reached this stack's own backend and none reached anything else. |
| **Core revision** | `8ffd416575311b59678b0d301dde0102190b329f`, `origin/master` when built, from `git archive` of that commit rather than a working tree. `git merge-base --is-ancestor` against `origin/master` after a fresh fetch: **yes**. Control: core's `dev` head `d79c46f` answered **no**. |
| **Cloud revision** | `84ae6daa2e482a8ce24874caafa0b0988f6dad3c`, `origin/master` when built. Ancestor check: **yes**. Control: an unmerged cloud branch tip answered **no**. |
| **Edition** | `cloud`, read from each container's own interpreter (app, worker, scheduler). |
| **Configuration** | `production-graded`. `datanika_allow_local_file_paths` is `False` in all three containers, read from each container's own interpreter; the same read with the value flipped printed `True`. Deviation: the two billing settings core's exporter records without grading were at their code defaults; no step of this guide depends on them. |
| **Guide revision** | landing `b88100f`, the last commit to change `mongodb.md` before this record (blob `b62b3fa`). |
| **Source database** | MongoDB `7.0.31`, the `mongo:7` image from `datanika-examples` `f031bd4` (the Online Store dataset), seeded with `--multiplier 1`, reachable from the stack at host `mongodb`. One collection, `users`, 500 documents, each with two nested objects (`contacts`, `address`) and no arrays. |
| **Destination** | Postgres database `walk_warehouse`, owner `walkdest`, inside this stack's own Postgres container. |
| **Not exercised** | allowlisting Datanika's egress IPs · **TLS in every form** — the guide's Atlas / DocumentDB / Cosmos DB warning ([core#626](https://github.com/datanika-io/datanika-core/issues/626)) could not be tested here, because this server accepts plaintext and no TLS-required deployment was available · `mongodb+srv://` · the **raw JSON** config path · whether a structured-form save drops a raw-JSON `auth_source` (the second half of [core#638](https://github.com/datanika-io/datanika-core/issues/638)) · **the `read` role's authorization limit**: this server runs with no access control (`getCmdLineOpts` reports no `security` section), so a write by the read-only user succeeded — authentication was exercised, authorization was not · Collection Names with an explicit list (left empty, which is the documented default) · Batch size · the Schema Contract dropdowns · the Target type dropdown's other options · a scheduled firing (the schedule was paused immediately) · Step 5.4 failure alerts |

### 2026-09-15 — walked end to end

- **Step 1**, run as written: `db.getSiblingDB("admin").createUser({user: "datanika_readonly", …, roles: [{role: "read", db: "online_store"}]})`. The troubleshooting section's own query then reports `user=datanika_readonly db=admin`, and the guide's isolation command — `mongosh "mongodb://…/online_store?authSource=admin"` — reads 500 documents. Control: the same command with a wrong password fails with `MongoServerError: Authentication failed`.
- source connection **7** `mongostorereadonly`, type `mongodb`: Host `mongodb`, Port 27017, Database `online_store`, User `datanika_readonly`
- upload **3** `mongodailysync`: **Collection Names left empty**, which the guide documents as "every collection"
- run **4** `success` in 0.48 s, Rows `500`
- schedule **3** `upload: mongodailysync`, `0 5 * * *`, UTC: landed **Active**, then **paused**

**Rows after run 1, counted in the destination database itself, not through the app:**

| | destination | source |
|---|---|---|
| `users` rows | 500 | 500 |
| distinct `user_id` | 500 | 500 |
| `SUM(user_id)` | 125250 | 125250 |
| distinct `first_name` | 50 | 50 |
| distinct email | 497 | 497 |
| distinct city | 30 | 30 |
| earliest / latest `created_at` | equal to the millisecond | — |

A one-hour shift of the source timestamp, as a control, is not equal. The schema `mongodailysync` holds
`users` plus dlt's three bookkeeping tables, and `_dlt_loads` holds one load.

**One run only. No count in this record comes from a second run.**

#### What the guide got right, observed on screen

- **Nested documents are flattened, and no child table appears.** `contacts.email` lands as `contacts__email`, `address.city` as `address__city`, and so on — 13 columns for a document with two nested objects. `_id` lands as `character varying` carrying the ObjectId's hex, and both date fields as `timestamp with time zone`.
- **Step 3's form for a MongoDB source is what the guide says it is.** There is no Load Mode, Write Disposition, Source schema or Table names — those are SQL-source controls. What is there is **Collection Names (optional, comma-separated)**, placeholdered exactly as the guide quotes it (`users, orders (leave empty for all collections)`), plus Batch size and the three Schema Contract dropdowns.
- **The `Authentication failed` troubleshooting entry is right about the cause.** A user created inside `online_store` rather than in `admin` fails against the default, and authenticates with `authSource=online_store` — measured both from `mongosh` and through the form.
- **Steps 4 and 5** behave as written: Run is on the upload's own row, `/models` lists `users` in a schema named after the upload and no `_dlt_*` table, and the schedule lands Active with Pause.

#### What the walk measured otherwise (corrected in the same change)

- 🔑 **The form now has an `auth_source` input, and the guide said it has none.** The `mongodb` form renders **seven** controls: Connection Name, Host, Port, User, Password, Database and **Authentication database** (placeholder `admin`). It is read, not decorative — one session, one field changed, against the user defined inside `online_store`:

  | Authentication database | Test Connection |
  |---|---|
  | empty | red — `Authentication failed., full error: {… 'code': 18, 'codeName': 'AuthenticationFailed'}` |
  | `online_store` | green — **Connected successfully** |

  So the guide's *"those five are the whole form"*, its instruction to reach for **Use raw JSON** to set
  `auth_source`, and its warning that a structured-form save silently drops the key no longer describe the
  product. The page now documents the field. [core#638](https://github.com/datanika-io/datanika-core/issues/638)
  is still open, and the measurement is posted there; the second half of it — the raw-JSON round trip — was
  not re-tested here.

- **The upload stores a write disposition the MongoDB form never offers.** Upload 3's stored config is `{"mode": "full_database", "write_disposition": "append"}` although no such control is rendered for a MongoDB source. Nothing in this record depends on it, because the upload was run exactly once; it is the same shape as [core#1336](https://github.com/datanika-io/datanika-core/issues/1336) and is why no second-run count appears above.

- **Step 5 is quota-limited on the Free plan, which the guide does not mention.** The first attempt to create this schedule was refused with an amber callout: *"Schedule limit reached (2 on Free plan) — Upgrade your plan to unlock more capacity."* The stack's two earlier walks held both slots. One of them (this walk's own, already recorded and paused) was deleted through the UI — which asks for confirmation in a dialog — and the schedule was then created as written. That is the product working as priced rather than a guide error, so the page is unchanged and the limit is recorded here.

## Not captured

- `01-credentials.png`: Step 1 is `mongosh` in a terminal; there is no Datanika screen to capture.
- `03-configure-upload.png` / `05-schedule.png`: the upload and schedule forms are connector-agnostic and already shown in the CSV guide.
