# OpenAPI setup-guide screenshots

Referenced from `src/content/connectors/openapi.md` (source-only API connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `openapi` selected. Captured 2026-09-15 from a **local stack** (see *Where and on what this was walked*), light theme. **Connection Name** `fakerestapi`, the vendor's published FakeRESTApi spec pasted (sha256 `c0367244…`; the textarea shows its last lines), **Base URL** filled, **API Key** empty because this source needs none. `PRODUCT_RULES` §4 credential gate before the shot: 4 inputs, 1 credential-shaped, 0 non-empty. The form was not submitted. |
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

## Not captured

- `01-credentials.png`: nothing to capture, because this source needs no credential.
- `03-configure-upload.png` / `05-schedule.png`: the upload and schedule forms are connector-agnostic and already
  shown in the CSV guide.
