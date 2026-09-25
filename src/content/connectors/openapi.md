---
title: "Connect any REST API from its OpenAPI spec"
description: "Paste an OpenAPI or Swagger spec into Datanika and it discovers the endpoints, auth, pagination and columns for you — no hand-written endpoint config."
source: "openapi"
source_name: "OpenAPI"
category: "api"
verified_by: "qa-ui"
verified_date: "2026-09-15"
related_use_cases: []
related_comparisons:
  - "airbyte"
  - "fivetran"
draft: false
---

Most APIs already describe themselves. If the vendor publishes an OpenAPI (or Swagger) document, Datanika can read it and build the connector for you — endpoints, authentication, pagination and column types all come out of the spec. You paste the document once; you do not hand-write endpoint JSON.

> **This guide is about reading *someone else's* OpenAPI spec to pull data in.** Datanika also *publishes* an OpenAPI spec for its own REST API — that is a different thing, and it lives in the [API reference](/api/reference). If you are here to script Datanika itself, that is the page you want.

**When to use this instead of the [REST API connector](/docs/connectors/rest-api):** if the API has a spec, use this one — it does the endpoint discovery for you. If it has no spec, or you only want two endpoints out of four hundred, the REST API connector lets you list them by hand.

## Prerequisites

- A **Datanika account** with permission to create connections (Admin or Editor role).
- A **destination warehouse** already connected in Datanika. OpenAPI is **source-only** — it extracts, it never receives.
- The vendor's **OpenAPI document**, as JSON or YAML. **OpenAPI 3.x and Swagger 2.0 are both accepted** — a 2.0 document is converted internally, so you do not need to upgrade it first.
- A **static credential** for the API — a bearer token, an API key, or the username half of HTTP Basic. See the auth section below for what the spec has to declare.

## Step 1 — Get the spec

Vendors publish these in a few predictable places:

- A link labelled *OpenAPI*, *Swagger*, *API reference (JSON)* or *Download spec* in their developer docs.
- A well-known path on the API itself — `/openapi.json`, `/swagger.json`, `/v3/api-docs`, `/openapi.yaml`.
- The "Export" button in a hosted Swagger UI or Redoc page.

Save it to a file, or copy it to the clipboard — you are going to paste the whole document.

> ⚠️ **In the Datanika UI this is paste-only. There is no "fetch from URL" field**, and giving one a URL is not a supported step. (A URL-fetch path does exist, but only through the REST API — it is not wired into the connection form.) If your spec is large enough that pasting is awkward, that is a sign to check it against the size limit below.

> **A spec with no endpoint Datanika can load is refused at save**, with the parser's reasons: `Invalid config: This spec has no endpoint the connector can load: …`, listing up to three. A JSON response counts however it is declared: plain `application/json`, with a parameter such as `application/json; v=1.0` (what ASP.NET's Swashbuckle emits when API versioning is on), or a `+json` type.

<!-- core#1345, fixed in production. This replaced a warning, walked 2026-09-15, that told readers to strip
     media-type parameters by hand before pasting. Walked 2026-09-17 on a local stack from core master ba7289b
     (public/docs/connectors/openapi/README.md, "2026-09-17"): the vendor's published spec, unedited, saved with
     5 endpoints and loaded rows, and a spec with no loadable endpoint was refused with the message quoted in
     Troubleshooting. The +json case is read in code only. The reasons inside that message are core#1416. -->

**Two limits, both enforced at save time:**

| limit | value | what happens |
|---|---|---|
| Spec size | **5 MB** | rejected as `spec_too_large` |
| Readable endpoints | **300** | rejected as `too_complex` |
| Total paths | **1,200** | rejected as `too_complex` before endpoints are even counted |

A spec over these limits is not a bug to report — it is a spec describing more surface than one connection should carry. Split it, or use the [REST API connector](/docs/connectors/rest-api) and list the endpoints you actually want.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there is no separate "New Connection" button to click.
2. Fill in **Connection Name**. It is the **first** field, above the type picker, and it is **required** — the form refuses to save without it (*“Connection name is required”*).
3. From the **type picker** — the **second** control, directly below Connection Name — pick `openapi`.
4. Fill in the three `openapi` fields. There is no Extra Headers box here, unlike the REST API connector:
   - **OpenAPI Spec** *(required)* — paste the entire document, JSON or YAML. The hint above the field says *"Endpoints are auto-discovered from the spec when you save."* That is literal: the parse happens on save, not on a separate button.
   - **Base URL** — the API root, and **optional for this connector**. **Leave it blank to use the `servers` entry from the spec**, which is the common case. Fill it in when the spec omits `servers`, when its `servers` entry is a path such as `/api/v1` rather than a full `https://` address, or to override it — for example when the spec names a production host and you want the sandbox. ⚠️ **Some versions of the form label this field `Base URL *`. Ignore the asterisk for this connector** — it came from a label shared with connectors where the field really is mandatory.
   - **API Key (optional)** — your token. Stored encrypted at rest with Fernet. How it is *used* depends on what the spec declares; see below.
5. Click **Create Connection**.

<!-- core#1311's first slice (core PR #1346) removed the asterisk from openapi's Base URL label. Release tags
     v0.1.0 to v0.1.3 still render "Base URL *", so the Base URL sentence above covers both on purpose; drop its
     asterisk warning once no supported tag renders it. 02-add-connection.png was recaptured on 2026-09-17 from
     core master ba7289b and shows the unmarked label (README, "2026-09-17"). -->

Two more things are on that screen. A notice that the **S3 connector is temporarily unavailable** —
unrelated to OpenAPI, ignore it. And a **Use raw JSON config** checkbox below the fields: **leave it
unticked.** Ticking it replaces the three typed fields with a single raw-config box, which you do not
need here.

⚠️ **That checkbox is not the one in Step 3.** The upload form in Step 3 has a control with the
*same label* and a different job — there it selects which endpoints to sync (`resource_names`). Same
words, two forms, two meanings.

🚨 **Creating the connection through the API instead of the form? `base_url` is genuinely required there.**
The API schema for `openapi` requires `base_url` and `resources`, so a programmatic create that omits the base
URL is rejected even though the form accepts it blank. The form is the more forgiving of the two surfaces: it
backfills the base URL from the spec's `servers` entry after parsing.

**Test Connection returns a neutral *not tested* verdict here, and that is deliberate.** The sentence you will see:

> *"Not tested. Calling an endpoint from your spec could have side effects, so we do not choose one for you. Your credentials are checked on the first run."*

<!-- landing#572 item 1. Quote datanika/i18n/en.json "connections.test_not_tested_openapi" -- the string the UI
     RENDERS. Do NOT quote ConnectionVerdict.message from SAAS_PROBE_EXEMPT in connection_service.py: that is the
     developer/API/log string and it is deliberately a different sentence (see connection_state.py:45-50). This
     guide quoted the developer string for months; a reader looking for it in the product does not find it. -->

There is no endpoint we know is safe to call — a spec's first `GET` might be `/users/{id}/export` on a metered plan. Your first run is the verification step.

![Adding the OpenAPI connection in Datanika, with a spec pasted and the Base URL filled](/docs/connectors/openapi/02-add-connection.png)

### What the parse does with your credential

This is the part that most often surprises people, so it is worth reading before the first run fails.

Datanika reads `components.securitySchemes` from the spec and maps it:

| the spec declares | Datanika sends |
|---|---|
| `http` + `bearer` | `Authorization: Bearer <your API key>` |
| `apiKey` | the key under the **name and location the spec specifies** — header, query or cookie |
| `http` + `basic` | HTTP Basic, with **your API key as the username and an empty password** |
| `oauth2` | **not supported** |

Three consequences worth stating plainly:

- 🚨 **If the spec declares no `securitySchemes` at all, your API key is silently dropped.** The connection saves cleanly and the first run gets a `401`. Nothing warns you at save time. If you know the API needs auth and the spec does not describe it, use the [REST API connector](/docs/connectors/rest-api) instead — its **Extra Headers** field lets you set the header yourself.
- **Only the first declared scheme is used.** A spec offering both bearer and API-key auth gets whichever appears first; there is no picker.
- **OAuth2 is not supported.** The parse records the warning *"OAuth2 scheme '&lt;name&gt;' is not supported — supply a static token"*. ⚠️ **It is deliberately absent from the save-time refusal** — since [core#1416](https://github.com/datanika-io/datanika-core/issues/1416) that message lists only the reasons endpoints could not be loaded, and an unsupported auth scheme is not one of them. If the API only does OAuth2 authorization-code flows, mint a long-lived token out of band and check whether the API also accepts it as a bearer token.

### What is inferred, and what that means

From each readable `GET` endpoint, Datanika derives:

- **The collection to load** — the array of records in the response schema the spec declares. Datanika tries the common envelope keys first (`data`, `results`, `items`, `records`, `value`, `rows`), then any other array property, and looks inside nested objects up to three levels deep. A `GET` whose declared response contains no array is skipped, and so is a templated path such as `/users/{id}`.
- **A paginator** — from the declared response first (a next-page URL in the body, or a `Link` header), otherwise from the endpoint's query parameters: a cursor parameter that the response also returns, an offset/limit pair (`offset`/`limit`, `skip`/`top`, `skip`/`take` or `start`/`count`), or a page number. If the spec declares none of these, Datanika sets no paginator and dlt's own runtime detection decides.
- **An incremental cursor**, where the endpoint has a suitable filter parameter (`updated_since`, `since`, `start_date`, …) paired with a timestamp field (`updated_at`, `modified_at`, `last_modified`, …). It does not carry from one run to the next, so it does not narrow later runs: each run requests every endpoint from the start again, and Step 5 says what that leaves in your tables ([core#1404](https://github.com/datanika-io/datanika-core/issues/1404)).
- **Columns and a primary key**, from the response schema.
- **Names.** Each table is named after the last segment of its path, lowercased, with any run of other characters replaced by `_` — `/api/v1/CoverPhotos` becomes the table `coverphotos`. Column names are normalised to snake_case as they load, so a field the spec calls `dueDate` lands as `due_date`.

> ⚠️ **These are inferences from a document, not observations of the API.** A spec that is out of date, or that describes a response envelope loosely, produces a connector that is confidently wrong rather than obviously broken. **Treat the first run's output as the thing you verify against** — not the fact that the connection saved.

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters, digits **and spaces** — everything else is stripped as you type, so `vendor-api-daily` becomes `vendorapidaily`, while `vendor api daily` keeps its spaces). ⚠️ Spaces surviving matters: Step 5 asks you to type the target name **exactly as saved**, so note whether yours has them. and an optional **Description**.
3. Pick the **Source connection** (the OpenAPI connection from Step 2) and the **Destination connection**. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. **Leave "Use raw JSON config" unticked to sync every endpoint the spec exposed.** This is the main difference from the REST API connector, which cannot run at all without a hand-written `resources` list — here the catalog already came from the spec.
5. Click **Create Upload**. It appears in the table below with status `draft`.

**To sync only some endpoints**, tick **Use raw JSON config** and name them:

```json
{
  "resource_names": ["customers", "invoices"]
}
```

The names are the resource names derived from the spec's paths — the same names the tables get (see *What is inferred*), so `/api/v1/CoverPhotos` is `coverphotos`. If none of the names you list exists in the catalog, the run fails with `None of the requested resource_names exist in this connection` rather than silently loading nothing.

> ⚠️ **There is no endpoint picker in the UI.** `resource_names` is accepted only through the raw JSON box, and it is not listed in the API's own `dlt_config` schema either — so the way to learn the available names today is to run once with everything and read the table list. A selector is a known gap, not a hidden feature you are failing to find.

> **Unlike a REST API upload, editing an OpenAPI connection does not lose your work.** The pasted spec is stored and is reloaded into the form when you click **Edit**. (The REST API connector's raw `resources` config is *not* reloaded — that is [core#803](https://github.com/datanika-io/datanika-core/issues/803), and it does not apply here.)

**Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. Given that this connector's columns are inferred from a document, the **Columns** contract is worth setting deliberately: it decides whether a response shape the spec did not predict evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **derived from the upload's name**: spaces become underscores and the whole thing is lower-cased. So `vendorapidaily` creates schema `vendorapidaily`, and an upload named `Vendor API Daily` creates schema `vendor_api_daily` — worth knowing, since the name field accepts spaces. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables there, but Models does not list them, so seeing only your own tables is correct.
4. **Open a table and click `Load first 100 rows`.** The Data preview runs a live `SELECT` against your destination, so the rows on screen are the rows in your warehouse. **Verify there, not on the status badge** — a green run means the load finished, not that it moved what you expected.
5. Because the endpoint list came from a document rather than from you, **check the table list itself, not just the row counts.** A spec that describes endpoints the vendor has retired produces empty tables. An endpoint whose responses use a media type Datanika does not read (see Step 1) produces no table at all. A spec whose declared response does not match what the API really returns can produce a table with one row of metadata instead of many rows of data. All three are visible in thirty seconds here and invisible on the run badge.

![The Data preview on the landed activities table, showing 30 rows read live from the destination](/docs/connectors/openapi/04-first-run.png)

## Step 5 — Schedule it

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload`.
   - **Target name** — the upload's name exactly as saved, e.g. `vendorapidaily`.
   - **Cron expression** — a real five-field cron string. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only.
   - **Timezone** — defaults to `UTC`.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications**.

> **Each run replaces this upload's tables with what that run fetched.** Running an unchanged upload again leaves each record in the destination once, and a schedule does the same on every firing. A record the API no longer returns is gone after the next run, and so are rows only an earlier run had loaded. A table that still holds copies from earlier runs goes back to one copy at the upload's next run.
>
> To keep every run's rows instead, for history or snapshots, the upload needs an explicit `"write_disposition": "append"` in its raw JSON config. Each row carries its run's `_dlt_load_id`, so a transformation can pick the most recent load.

<!-- core#1336, fixed in production 2026-09-16 (core master 01de8b0c). This replaced a warning that
     each run appended a full copy. Measured after the fix: core's
     tests/test_services/test_rerun_lands_each_record_once.py (openapi path into a real DuckDB file:
     two runs leave each record once, a table holding copies goes back to one copy, an explicit
     append still appends) and QA's reading of the deployed decision function on core#1336.
     Walked 2026-09-17 on a local stack from core master ba7289b (README, "2026-09-17"): a second run of
     an unchanged upload left each table at that run's own count, counted in the destination, and
     authors went from 600 rows to 594, so rows only the first run had loaded were gone. -->

> **If the vendor revises their spec, Datanika will not notice.** The catalog is parsed once, at save time, and stored on the connection. New endpoints, renamed fields and changed pagination arrive only when you re-paste the spec and save again. Put that on the same calendar as any other vendor API review.

## Troubleshooting

Through the API, a save-time failure comes back with one of four codes. **On the form you see the message instead, after `Invalid config:`** — each entry below gives both, so you can match either one exactly.

### `invalid_spec`
**On the form.** `Invalid config: Could not parse spec as JSON or YAML: …`, `Invalid config: Spec did not parse to an object`, or `Invalid config: Spec 'paths' is not an object`.
**Cause.** The document did not parse as JSON or YAML, or it parsed to something that is not an object, or its `paths` is not an object.
**Fix.** Validate the document in any OpenAPI linter first. The most common cause is pasting an HTML page — a Swagger UI *page* rather than the JSON it renders.

### `spec_too_large`
**On the form.** `Invalid config: Spec exceeds the size limit`.
**Cause.** The document exceeds 5 MB.
**Fix.** Most oversized specs are large because of examples and descriptions rather than endpoints. Strip those, or use the REST API connector for the handful of endpoints you want.

### `unsupported_version`
**On the form.** `Invalid config: Missing or unsupported 'openapi' version (need 3.x)` — or, for a Swagger document other than 2.0, `Invalid config: Swagger <version> is not supported — convert to OpenAPI 3.x (2.0 is supported)`.
**Cause.** The document is neither OpenAPI 3.x nor Swagger 2.0.
**Fix.** Check the top-level `openapi:` or `swagger:` key. OpenAPI 1.x and non-OpenAPI formats (RAML, API Blueprint) are not accepted.

### `too_complex`
**On the form.** `Invalid config: Spec has more than 1200 paths` or `Invalid config: Spec exposes more than 300 readable endpoints`.
**Cause.** More than 300 readable endpoints, or more than 1,200 paths.
**Fix.** Use a scoped spec if the vendor publishes one per product area, or use the REST API connector.

### `Invalid config: No base URL found in the spec — set the Base URL field`
**Cause.** The spec has no `servers` entry and you left Base URL blank.
**Fix.** Fill in Base URL on the connection form.

⚠️ **There is a near-identical second message, and it is not this one.** The error above is raised only when
you save through the **form**. The parser itself appends a *warning* with almost the same words —
*"No 'servers' URL in the spec — set the base URL manually."* — which is what you get on the API path.
Same cause, same fix; matching either one literally will miss the other.

### `Invalid config: This spec has no endpoint the connector can load: …`
**Cause.** No `GET` operation in the spec survived the parse. The message lists the parser's reasons, up to three: typically templated paths such as `/users/{id}`, or responses that contain no array.
**Fix.** Those endpoints have no collection this connector can load as a table. Use the [REST API connector](/docs/connectors/rest-api) and point at the collection yourself.

### `OpenAPI source has no resource catalog — re-parse the spec`
**Cause.** The first run fails with this message when the connection holds no endpoints to load: for example one created through the API without a parse step, or one saved before the form began refusing a spec with no loadable endpoint. In **`/runs`** it is the tooltip on the run's error icon.
**Fix.** Open the connection, **Edit**, and save again. The spec is reloaded into the form, so saving re-runs the parse: the form either stores the endpoints or tells you why there are none.

### `401` or `403` on the first run, with a spec that saved cleanly
**Cause.** Most often the spec declares no `securitySchemes`, so your API key was never attached — see the auth table above. Also possible: the spec declares OAuth2, or the first declared scheme is not the one this API actually wants.
**Fix.** Check the spec for a `securitySchemes` block. If it has none, or only OAuth2, use the [REST API connector](/docs/connectors/rest-api) and set the header yourself in **Extra Headers**.

### Some endpoints are missing from the table list
**Cause.** The parse skipped them, and when some endpoints do load the form does not show you what it skipped. Three reasons, all visible in the spec:
- the endpoint declares no JSON response at all (plain `application/json`, `application/json` with a parameter, and `+json` types all count);
- the path is templated, such as `/users/{id}` — detail endpoints are skipped;
- the declared response contains no array, so there is no collection to load.

**Fix.** Use the [REST API connector](/docs/connectors/rest-api) for those endpoints.

### A table landed with one row that looks like metadata
**Cause.** The records are not where the spec says they are. Datanika takes the path to the record array from the response schema the spec declares — under any property name, not only the common envelope keys — so when the API's real response is shaped differently from that schema, the path misses the records.
**Fix.** Use the REST API connector for that endpoint, where you can point at the collection explicitly.

### Rows that were in a table are gone after a run
**Cause.** Each run replaces the upload's tables with what that run fetched. A record the API no longer returns (deleted, or outside what the endpoint lists by default, such as a date window) is removed at the next run, along with rows only an earlier run had loaded.
**Fix.** If those rows should stay, give the upload an explicit `"write_disposition": "append"` in its raw JSON config, and keep a single copy downstream: each row carries its run's `_dlt_load_id`.

### Only the first page loaded
**Cause.** The endpoint's pagination is not described in the spec in a way the paginator inference recognises.
**Fix.** Confirm against the vendor's docs how pagination works, then use the REST API connector with an explicit `paginator` for that endpoint.

## Related

- **The manual alternative:** [REST API connector guide](/docs/connectors/rest-api) — use it when there is no spec, when the spec omits auth, or when you want to pin pagination by hand.
- **Datanika's own API:** [API reference](/api/reference) — the OpenAPI spec Datanika *publishes*, which is a different subject entirely.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
- **dbt tips:** [Transformations guide](/docs/transformations-guide)
