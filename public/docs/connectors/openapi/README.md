# OpenAPI setup-guide screenshots

Referenced from `src/content/connectors/openapi.md` (source-only API connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `openapi` selected. **Recaptured 2026-09-17** from a **local stack** on core `master` (see *2026-09-17 — Step 2 recaptured on core master*), light theme, CSS scale, 992×696. **Connection Name** `fakerestapi`, the vendor's published FakeRESTApi spec pasted unedited (sha256 `c0367244…`, the same document as on 2026-09-15; the textarea shows its last lines), **Base URL** filled and labelled without an asterisk, **API Key** empty because this source needs none. `PRODUCT_RULES` §4 credential gate before the shot: 4 inputs, 1 credential-shaped, 0 non-empty. The form was not submitted, and the PNG carries no text chunk. It replaces the 2026-09-15 capture, which showed the label `Base URL *` that core `master` no longer renders ([core#1346](https://github.com/datanika-io/datanika-core/pull/1346)). |
| `04-first-run.png` | Step 4 | The **Data preview** on `/models/2`, the model detail page for the landed `activities` table: six columns (`id`, `title`, `due_date`, `completed`, `_dlt_load_id`, `_dlt_id`) and 30 rows, `Activity 1` to `Activity 30`, read live from the destination. Taken after run 3, the first run that loaded anything, while the table held exactly 30 rows. Every row carries the same `_dlt_load_id`. The `Rows: 30` label is out of frame. Credential gate: 0 non-empty credential-shaped fields. |

⚠️ **A re-take of the Data preview after run 4 read `Rows: 60`, and it was not used.** Running the unchanged upload
a second time appended every row again. That is [core#1336](https://github.com/datanika-io/datanika-core/issues/1336),
measured on this walk; see below.

## Verification

`verified_by: qa-ui` / `verified_date: 2026-09-15`.

### Where and on what this was walked (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

| field | value |
|---|---|
| **Environment** | `local stack`: core `scripts/build-from-worktree.sh`, run with `docker-compose.yml` + `docker-compose.local.yml` (the one-origin proxy), plus a local overlay. The overlay renamed containers and host ports so the stack could run beside another one, and set the edition and the graded setting below. |
| **Core revision** | `ada0987092043e3f6ad1a86c0ecae8992a8eba8c`, `origin/master` when built. `git merge-base --is-ancestor` against `origin/master` after a fresh fetch: **yes**. Control: a `dev`-only commit answered **no**. |
| **Cloud revision** | `9a1b2ea9e94ac731006b29076936e7b7afce7d7f`, `origin/master` when built. Ancestor check: **yes**. |
| **Edition** | cloud, read from each container's own interpreter |
| **Configuration** | `production-graded`. `datanika_allow_local_file_paths` is `False` in the app, worker and scheduler, read from each container's own interpreter; it is the one setting core's `deploy/server/export-prod-settings.sh` grades. Deviation: the two billing settings that script records without grading were left at their code defaults. No guide step depends on them. |
| **Guide revision** | landing `dd7f24e0`, the last commit to change `openapi.md` (blob `d294bc8c`). The same blob was on `dev` when the walk began and when this record was written. |
| **Not exercised** | allowlisting Datanika's egress IPs (the source is a public API) · an API key, and every row of the auth table (the spec declares no `securitySchemes`) · a blank Base URL on a spec that declares `servers` (this one declares none) · the blank Connection Name refusal · creating the connection through the API · pagination, incremental cursors and envelope keys (the source returns plain arrays and declares no paging parameters) · `resource_names` · the four save-time error codes · the Columns schema contract · a scheduled firing (the schedule was paused first) · Step 5.4, failure alerts |

### 2026-09-15 — walked end to end; the walk exposed two product defects

Walked by QA through the UI, signed up as a new user in a fresh org (`QA Walkthrough's Org`) on that stack:

- destination connection **1** `walkwarehouse` (postgres), the prerequisite
- source connection **2** `fakerestapi`, type `openapi`, Base URL `https://fakerestapi.azurewebsites.net`, API Key blank
- upload **1** `fakerestapiwalk`, structured form, *Use raw JSON config* unticked, so every endpoint syncs
- runs **1** and **2** `failed` (defect 1); run **3** `success`, Rows `1039`; run **4** `success`, Rows `1034`
- schedule **1** `upload: fakerestapiwalk`, `0 3 * * *`, `UTC`: landed **Active**, then **paused** (`Inactive`)

**The source** is FakeRESTApi, a public test API that needs no account. Its own spec (`/swagger/v1/swagger.json`,
OpenAPI 3.0.1) declares no `servers`, no `securitySchemes`, 5 parameter-free collection GETs and 7 templated paths.
Five reads at the source gave the same counts for four endpoints: Activities 30, Books 200, CoverPhotos 200 and
Users 10. Authors returned a list of random length on every request, between 578 and 617.

**Rows after run 3, counted in the destination database itself, not through the app:**

| table | rows | distinct `id` | at source |
|---|---|---|---|
| `activities` | 30 | 30 | 30 |
| `authors` | 599 | 599 | random per request |
| `books` | 200 | 200 | 200 |
| `coverphotos` | 200 | 200 | 200 |
| `users` | 10 | 10 | 10 |

No child tables. The sum, 1039, equals run 3's Rows count. The Data preview's `Rows: 30` equals the destination's
count for `activities`.

#### 🚨 Defect 1: the vendor's published spec imports zero endpoints ([core#1345](https://github.com/datanika-io/datanika-core/issues/1345))

> **2026-09-17: fixed on core `master`, and re-measured through the form.** The same published document, unedited,
> stored 5 resources and loaded rows. See *2026-09-17 — Step 2 recaptured on core master* below.

Every collection response in the spec is declared as `application/json; v=1.0`. Swashbuckle emits that type when
ASP.NET API versioning is on. The parser matches only an exact `application/json`, so the parse found
**0 resources**. **Create Connection** succeeded **with no warning on screen**. Every run then failed in under a
second with `OpenAPI source has no resource catalog — re-parse the spec`, shown as the hover tooltip on the run's
error icon.

The guide's troubleshooting entry for that message names a different cause: a connection created through the API
without a parse step. It prescribes **Edit** and save again. That remedy was walked: it re-parses the same document
to zero resources, and run 2 failed the same way.

**Deviation, so the remaining steps could be walked:** the same vendor document was saved through
**Edit → Save Changes** with one change. `"application/json; v=1.0"` was replaced by `"application/json"`
(27 replacements, sha256 `e57d3760…`). The stored catalog then held 5 resources, each with primary key `id`. Runs 3
and 4, the Models and Data preview observations and the first-run capture used this edited document. The
add-connection capture shows the published one.

#### 🚨 Defect 2: a re-run lands every row again ([core#1336](https://github.com/datanika-io/datanika-core/issues/1336), measured here)

> **2026-09-17: fixed on core `master`, and re-measured.** A second run of an unchanged upload left each table at
> that run's own count. See *2026-09-17 — Step 2 recaptured on core master* below.

An upload saved on the structured form stores a hidden `write_disposition: append`. Neither Write Disposition nor
Load Mode is rendered for this source type, and the stored row reads
`{"mode": "full_database", "write_disposition": "append"}`. Running the unchanged upload a second time gave:

| table | after run 3 | after run 4 | distinct `id` after run 4 |
|---|---|---|---|
| `activities` | 30 | **60** | 30 |
| `authors` | 599 | **1193** | 599 |
| `books` | 200 | **400** | 200 |
| `coverphotos` | 200 | **400** | 200 |
| `users` | 10 | **20** | 10 |

Both runs were green. The inferred primary key did not prevent the duplication.

**Inferred, not observed:** a scheduled run executes the same upload. Until core#1336 is fixed, each firing of
Step 5's schedule would therefore add another full copy of every table.

#### What the guide got right, observed on screen

- **Step 2.** The form is inline. **Connection Name \*** comes first, then the type picker. `openapi` shows the hint
  callout, **OpenAPI Spec \***, **Base URL \*** and **API Key (optional)**, with **no Extra Headers** box. The S3
  notice and **Use raw JSON config** are on the page.
- **Blank Base URL** on a spec with no `servers` gives the documented error. The UI adds a prefix the guide omits:
  `Invalid config: No base URL found in the spec — set the Base URL field`.
- **Test Connection**, the button on the form, shows the neutral verdict as a callout on the form. Its sentence is
  exactly the one the guide quotes. That was checked in the update the product sends (event
  `test_connection_from_form`, reply in 42 ms) and in the text on screen. Nothing was saved.
- **Edit** reloads the pasted spec intact (hash-identical).
- **Step 3.** The name rule keeps spaces: `fake-rest api 1` becomes `fakerest api 1`. The pickers list
  `2 — fakerestapi (openapi)`. Choosing the `openapi` source hides Load Mode, Write Disposition and Source schema.
  There is no endpoint picker. Batch size and Schema Contract are present. With raw JSON unticked, all five parsed
  endpoints synced.
- **Step 4.** `/runs` shows a status badge, start and finish timestamps and a Rows count, and the **Logs** icon opens
  the run's log inline. `/models` lists five tables in schema `fakerestapiwalk` and no `_dlt_*` table. None of the
  five tables is empty or holds a single metadata row.
- **Step 5.** The schedule lands **Active**, with **Pause**.

#### What the guide says that the screen does not (sent to [landing#572](https://github.com/datanika-io/datanika-landing/issues/572))

- *"The hint under the field"*: the hint renders **above** the OpenAPI Spec field.
- The troubleshooting entry for `OpenAPI source has no resource catalog` names only API-created connections, and its
  remedy does not work for defect 1.
- Not mentioned: a new upload lands as `draft`, and the spec's `dueDate` lands as `due_date`. The **Test** action on a
  saved connection's row shows the same verdict only as a status icon; the sentence is in that icon's hover tooltip.

### 2026-09-17 — Step 2 recaptured on core master; both defects re-measured

Walked by Product through the UI. Three changes reached core `master` after the 2026-09-15 walk, and each changes
what this guide shows or promises: [core#1346](https://github.com/datanika-io/datanika-core/pull/1346) removed the
asterisk from Base URL's label, [core#1345](https://github.com/datanika-io/datanika-core/issues/1345) changed what
the parse reads and what the form refuses, and [core#1336](https://github.com/datanika-io/datanika-core/issues/1336)
changed what a re-run does.

`verified_by` and `verified_date` still name the 2026-09-15 walk, and this section does not change them. It adds a
later walk of Steps 2 to 4 to the record.

#### Where and on what (`SPEC_CONNECTOR_GUIDE_VERIFICATION.md` §2.4)

| field | value |
|---|---|
| **Environment** | `local stack`: the image core's `scripts/build-from-worktree.sh` built, run with core's `scripts/worktree-stack.sh` (its own compose project, container names and host ports). The one-origin proxy did not start, because its host port was inside a range the host had reserved. The browser used the frontend and backend ports directly. Every websocket reached this stack's own backend, and every request to a host other than `localhost` was aborted. |
| **Core revision** | `ba7289b92ca37daa6110958a605282020a16771a`: `origin/master` when built and when this record was written, and the revision production deployed on 2026-09-16. Four core files inside the image matched their git blobs at that commit. One of them, `connections.py`, differs on `origin/dev`, and the image's copy did not match `dev`'s. `git merge-base --is-ancestor` against `origin/master` after a fresh fetch: **yes**. Control: core `dev` `3a2d4147` answered **no**. |
| **Cloud revision** | `68a2ee5631db3f5099fca769d52a84187fb4f354`, `origin/master` when built. Cloud `master` has since moved on. Ancestor check: **yes**. Control: an unmerged cloud branch answered **no**. |
| **Edition** | cloud, read from the app, worker and scheduler's own interpreters |
| **Configuration** | `production-graded`. `datanika_allow_local_file_paths` is `False` in the app, worker and scheduler, each read from its own interpreter. The billing settings were left at their code defaults, as on 2026-09-15. |
| **Guide revision** | blob `f941dda8`, the text of landing `c81d0b8`, which reached `dev` as `389be33` during this walk |
| **Not exercised** | allowlisting Datanika's egress IPs · an API key and the auth table (the spec declares no `securitySchemes`) · a blank Base URL · creating the connection through the API · pagination, incremental cursors and envelope keys · `resource_names` · the four save-time error codes · a `+json` media type (read in code only) · the Columns schema contract · Test Connection · the Data preview (`04-first-run.png` is still the 2026-09-15 capture) · Step 5 |

#### What happened

- **Step 2, photographed and not submitted.** The labels as rendered: `Connection Name *`, `OpenAPI Spec *`,
  `Base URL`, `API Key (optional)`. The Base URL input has no `required` attribute.
- **Step 2, submitted separately.** The published spec, unedited and still declaring `application/json; v=1.0` 27
  times, saved. Read back through the app's own interpreter, the connection holds **5 resources**:
  `activities`, `authors`, `books`, `coverphotos`, `users`, each with primary key `id`. On 2026-09-15 the same
  document stored none.
- **The refusal Step 1 describes.** A spec whose only GETs are a templated path and a path whose response is a
  single object was refused at save, and no connection was created. The form showed:
  `Invalid config: This spec has no endpoint the connector can load: Skipped templated endpoint /users/{id} — detail endpoints need a parent (P3).; Skipped GET /status — no array/collection JSON response schema.`
  ⚠️ **That is the message as it rendered on `ba7289b`, kept verbatim because this section is evidence.** It changed on `master` on 2026-09-22 ([core#1416](https://github.com/datanika-io/datanika-core/issues/1416)) — do not copy it into a test or a guide.
- **Steps 3 and 4.** Destination connection **2** `walkwarehouse` (postgres, a database in the stack's own
  Postgres), source connection **3** `fakerestapi`, upload **1** `fakerestapiwalk` on the structured form with
  *Use raw JSON config* unticked. The upload landed as `draft` and stored `{"mode": "full_database"}`, with no
  `write_disposition` (on 2026-09-15 it stored `append`). Run **1** `success`, Rows `1040`; run **2**, the same
  upload unchanged, `success`, Rows `1034`. `/models` listed all five tables.

**Rows counted in the destination database, not through the app:**

| table | after run 1 | after run 2 | ids after run 2 | `_dlt_load_id` values after run 2 |
|---|---|---|---|---|
| `activities` | 30 | 30 | 1–30 | 1 |
| `authors` | 600 | 594 | 1–594 | 1 |
| `books` | 200 | 200 | 1–200 | 1 |
| `coverphotos` | 200 | 200 | 1–200 | 1 |
| `users` | 10 | 10 | 1–10 | 1 |

In every table, after each run, the row count equals the count of distinct `id`. Each run's table total equals its
Rows count. At the source, read after each run, `activities`, `books`, `coverphotos` and `users` returned the counts
above; `authors` returns a list of random length on every request, as on 2026-09-15.

- **Defect 1 is fixed on this revision.** The published document needed no edit.
- **Defect 2 is fixed on this revision.** The second run replaced each table rather than appending to it.
  `authors` also shows the consequence Step 5 states: it held 600 rows after run 1 and 594 after run 2, so rows that
  only the first run had loaded did not survive the second.

#### Found on this walk

- The refusal message lists an auth warning as if it were a reason, and shows internal phase labels and a doubled
  `.;` → [core#1416](https://github.com/datanika-io/datanika-core/issues/1416). ✅ **Fixed, and on `master` as of
  2026-09-22.** The refusal now lists only the reasons endpoints did not load, the phase labels are gone, and the
  guide sentence above has been updated to match. ⚠️ **The message quoted under *What happened* is deliberately
  left as it was seen on `ba7289b`** — that section is a capture, and editing it would falsify the record.
- `OpenAPI Spec *` is marked, and the form refuses it blank, but its textarea has no `required` attribute. Recorded on
  [core#1311](https://github.com/datanika-io/datanika-core/issues/1311).

## Not captured

- `01-credentials.png`: nothing to capture, because this source needs no credential.
- `03-configure-upload.png` / `05-schedule.png`: the upload and schedule forms are connector-agnostic and already
  shown in the CSV guide.
