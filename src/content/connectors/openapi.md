---
title: "Connect any REST API from its OpenAPI spec"
description: "Paste an OpenAPI or Swagger spec into Datanika and it discovers the endpoints, auth, pagination and columns for you — no hand-written endpoint config."
source: "openapi"
source_name: "OpenAPI"
category: "api"
verified_by: "draft-pending-verification"
verified_date: null
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

**Two limits, both enforced at save time:**

| limit | value | what happens |
|---|---|---|
| Spec size | **5 MB** | rejected as `spec_too_large` |
| Readable endpoints | **300** | rejected as `too_complex` |
| Total paths | **1,200** | rejected as `too_complex` before endpoints are even counted |

A spec over these limits is not a bug to report — it is a spec describing more surface than one connection should carry. Split it, or use the [REST API connector](/docs/connectors/rest-api) and list the endpoints you actually want.

## Step 2 — Add the connection in Datanika

1. In Datanika, open **`/connections`**. The New Connection form is already rendered on the page — there is no separate "New Connection" button to click.
2. From the **type dropdown** at the top of the form, pick `openapi`.
3. Fill in the **three** fields. That is the whole form — there is no Extra Headers box here, unlike the REST API connector:
   - **OpenAPI Spec** *(required)* — paste the entire document, JSON or YAML. The hint under the field says *"Endpoints are auto-discovered from the spec when you save."* That is literal: the parse happens on save, not on a separate button.
   - **Base URL** — the API root. **Leave it blank to use the `servers` entry from the spec**, which is the common case. Fill it in to override — useful when the spec names a production host and you want the sandbox, or when the spec omits `servers` entirely.
   - **API Key (optional)** — your token. Stored encrypted at rest with Fernet. How it is *used* depends on what the spec declares; see below.
4. Click **Create Connection**.

**Test Connection returns a neutral *not tested* verdict here, and that is deliberate.** The product's own reason:

> *"Not tested: authentication and the resource catalog come from the imported spec, and calling an arbitrary catalog entry may have side effects. The first run reports."*

There is no endpoint we know is safe to call — a spec's first `GET` might be `/users/{id}/export` on a metered plan. Your first run is the verification step.

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
- **OAuth2 is not supported.** You will see the warning *"OAuth2 scheme '&lt;name&gt;' is not supported — supply a static token."* If the API only does OAuth2 authorization-code flows, mint a long-lived token out of band and check whether the API also accepts it as a bearer token.

### What is inferred, and what that means

From each readable `GET` endpoint, Datanika derives:

- **The collection to load** — it looks through common envelope keys (`data`, `results`, `items`, `records`, `value`, `rows`) up to three levels deep to find the array of records.
- **A paginator** — link-header, `next`-URL, cursor, or page-number, chosen from the endpoint's declared parameters.
- **An incremental cursor**, where the endpoint has a suitable filter parameter (`updated_since`, `since`, `start_date`, …) paired with a timestamp field (`updated_at`, `modified_at`, `last_modified`, …).
- **Columns and a primary key**, from the response schema.

> ⚠️ **These are inferences from a document, not observations of the API.** A spec that is out of date, or that describes a response envelope loosely, produces a connector that is confidently wrong rather than obviously broken. **Treat the first run's output as the thing you verify against** — not the fact that the connection saved.

## Step 3 — Configure the upload

Extract-load is configured at **`/uploads`**, not on the connection.

1. Open **`/uploads`**. The **New Upload** form is rendered inline on the page.
2. Fill in **Upload name** (letters and digits only — anything else is stripped as you type, so `vendor-api-daily` becomes `vendorapidaily`) and an optional **Description**.
3. Pick the **Source connection** (the OpenAPI connection from Step 2) and the **Destination connection**. Each picker opens a dialog listing entries as `16 — myconnection (postgres)`, i.e. id, name, type.
4. **Leave "Use raw JSON config" unticked to sync every endpoint the spec exposed.** This is the main difference from the REST API connector, which cannot run at all without a hand-written `resources` list — here the catalog already came from the spec.
5. Click **Create Upload**.

**To sync only some endpoints**, tick **Use raw JSON config** and name them:

```json
{
  "resource_names": ["customers", "invoices"]
}
```

The names are the resource names derived from the spec's paths. If none of the names you list exists in the catalog, the run fails with `None of the requested resource_names exist in this connection` rather than silently loading nothing.

> ⚠️ **There is no endpoint picker in the UI.** `resource_names` is accepted only through the raw JSON box, and it is not listed in the API's own `dlt_config` schema either — so the way to learn the available names today is to run once with everything and read the table list. A selector is a known gap, not a hidden feature you are failing to find.

> **Unlike a REST API upload, editing an OpenAPI connection does not lose your work.** The pasted spec is stored and is reloaded into the form when you click **Edit**. (The REST API connector's raw `resources` config is *not* reloaded — that is [core#803](https://github.com/datanika-io/datanika-core/issues/803), and it does not apply here.)

**Batch size** (default 10000) and the optional **Schema Contract** dropdowns — **Tables** / **Columns** / **Data Type** — are on every upload regardless of source. Given that this connector's columns are inferred from a document, the **Columns** contract is worth setting deliberately: it decides whether a response shape the spec did not predict evolves the destination or fails the run.

## Step 4 — First run

1. On the **`/uploads`** row for your upload, click **Run**.
2. Watch **`/runs`**. The run shows a status badge, start and finish timestamps and a **Rows** count; the **Logs** icon on the row opens the detail.
3. When it finishes, open **Models** (`/models`) and browse the landed tables. The upload lands them in a schema **named after the upload** — `vendorapidaily` creates schema `vendorapidaily`. dlt also creates its own `_dlt_loads` / `_dlt_pipeline_state` / `_dlt_version` bookkeeping tables there, but Models does not list them, so seeing only your own tables is correct.
4. **Open a table and click `Load first 100 rows`.** The Data preview runs a live `SELECT` against your destination, so the rows on screen are the rows in your warehouse. **Verify there, not on the status badge** — a green run means the load finished, not that it moved what you expected.
5. Because the endpoint list came from a document rather than from you, **check the table list itself, not just the row counts.** A spec that describes endpoints the vendor has retired produces empty tables; a spec whose envelope key differs from the six Datanika looks for produces a table with one row of metadata instead of many rows of data. Both are visible in thirty seconds here and invisible on the run badge.

## Step 5 — Schedule it

1. Open **`/schedules`**. The **New Schedule** form is rendered inline.
2. Fill in:
   - **Target type** — `upload`.
   - **Target name** — the upload's name exactly as saved, e.g. `vendorapidaily`.
   - **Cron expression** — a real five-field cron string. `0 * * * *` hourly, `0 */6 * * *` every six hours, `0 3 * * *` nightly at 03:00. There is no cadence picker and no "manual only" option: leaving the upload unscheduled *is* manual-only.
   - **Timezone** — defaults to `UTC`.
3. Click **Create Schedule**. The row lands as **Active**, with **Pause** available per row.
4. Wire up failure alerts in **Settings → Notifications**.

> **If the vendor revises their spec, Datanika will not notice.** The catalog is parsed once, at save time, and stored on the connection. New endpoints, renamed fields and changed pagination arrive only when you re-paste the spec and save again. Put that on the same calendar as any other vendor API review.

## Troubleshooting

The save-time failures come back with one of four codes, so you can match the message exactly.

### `invalid_spec`
**Cause.** The document did not parse as JSON or YAML, or it parsed to something that is not an object, or its `paths` is not an object.
**Fix.** Validate the document in any OpenAPI linter first. The most common cause is pasting an HTML page — a Swagger UI *page* rather than the JSON it renders.

### `spec_too_large`
**Cause.** The document exceeds 5 MB.
**Fix.** Most oversized specs are large because of examples and descriptions rather than endpoints. Strip those, or use the REST API connector for the handful of endpoints you want.

### `unsupported_version`
**Cause.** The document is neither OpenAPI 3.x nor Swagger 2.0.
**Fix.** Check the top-level `openapi:` or `swagger:` key. OpenAPI 1.x and non-OpenAPI formats (RAML, API Blueprint) are not accepted.

### `too_complex`
**Cause.** More than 300 readable endpoints, or more than 1,200 paths.
**Fix.** Use a scoped spec if the vendor publishes one per product area, or use the REST API connector.

### `No base URL found in the spec — set the Base URL field`
**Cause.** The spec has no `servers` entry and you left Base URL blank.
**Fix.** Fill in Base URL on the connection form.

### `OpenAPI source has no resource catalog — re-parse the spec`
**Cause.** The connection exists but carries no stored catalog — typically a connection created through the API without a parse step.
**Fix.** Open the connection, **Edit**, and save again. The spec is reloaded into the form, so saving re-runs the parse.

### `401` or `403` on the first run, with a spec that saved cleanly
**Cause.** Most often the spec declares no `securitySchemes`, so your API key was never attached — see the auth table above. Also possible: the spec declares OAuth2, or the first declared scheme is not the one this API actually wants.
**Fix.** Check the spec for a `securitySchemes` block. If it has none, or only OAuth2, use the [REST API connector](/docs/connectors/rest-api) and set the header yourself in **Extra Headers**.

### A table landed with one row that looks like metadata
**Cause.** The response envelope does not use one of the keys Datanika searches (`data`, `results`, `items`, `records`, `value`, `rows`), so the whole response object was treated as a single record.
**Fix.** Use the REST API connector for that endpoint, where you can point at the collection explicitly.

### Only the first page loaded
**Cause.** The endpoint's pagination is not described in the spec in a way the paginator inference recognises.
**Fix.** Confirm against the vendor's docs how pagination works, then use the REST API connector with an explicit `paginator` for that endpoint.

## Related

- **The manual alternative:** [REST API connector guide](/docs/connectors/rest-api) — use it when there is no spec, when the spec omits auth, or when you want to pin pagination by hand.
- **Datanika's own API:** [API reference](/api/reference) — the OpenAPI spec Datanika *publishes*, which is a different subject entirely.
- **Comparisons:** [Datanika vs Airbyte](/compare/airbyte), [Datanika vs Fivetran](/compare/fivetran)
- **Scheduling deep-dive:** [Scheduling guide](/docs/scheduling-guide)
- **dbt tips:** [Transformations guide](/docs/transformations-guide)
