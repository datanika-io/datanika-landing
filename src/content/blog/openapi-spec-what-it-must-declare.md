---
title: "Paste an OpenAPI Spec, Get a Connector — If the Spec Declares Three Things"
description: "Datanika builds the endpoints, auth, pagination and columns out of an OpenAPI or Swagger document. That means the connector is only ever as good as the document: three declarations decide whether it works, and a spec missing one of them saves cleanly and fails on the first run."
date: 2026-11-06
publishedAt: 2026-11-06
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "openapi", "swagger", "rest-api", "api"]
---

Most APIs already describe themselves. If a vendor publishes an OpenAPI or Swagger document, you can paste it into Datanika and get a working connector without hand-writing a line of endpoint config — the endpoints, the authentication, the pagination and the column types all come out of the document.

That is the pitch, and it holds. But it carries one consequence worth internalising before your first run:

> **The connector is built from a document, not from the API.**

Everything below follows from that sentence. A spec that is out of date, or that describes its own responses loosely, produces a connector that is *confidently wrong* rather than obviously broken — and it saves without complaint, because at save time there is nothing to compare the document against.

So here are the three declarations that decide whether a spec is usable, in the order they will bite you.

## 1. `securitySchemes` — or your API key is silently dropped

Datanika reads `components.securitySchemes` from the spec and maps what it finds:

| the spec declares | Datanika sends |
|---|---|
| `http` + `bearer` | `Authorization: Bearer <your API key>` |
| `apiKey` | the key under the **name and location the spec specifies** — header, query or cookie |
| `http` + `basic` | HTTP Basic, with your API key as the **username** and an empty password |
| `oauth2` | **not supported** |

Three things about that table are worth more than the table.

**If the spec declares no `securitySchemes` at all, your key goes nowhere.** The connection saves cleanly. Nothing warns you. The first run comes back `401`. This is the single most common way this connector looks broken when it is doing exactly what it was told — a document that forgot to describe its own auth is a document, and the parser believes documents.

**Only the first declared scheme is used.** A spec offering both bearer and API-key auth gets whichever appears first, and there is no picker.

**OAuth2 is not supported.** The parse records a warning rather than refusing the save, and that warning is deliberately not part of the save-time error — that message lists only the reasons endpoints could not be loaded, and an unsupported auth scheme is not one of them. If the API only does authorization-code flows, mint a long-lived token out of band and check whether the API will also take it as a bearer token.

In all three cases the fallback is the same: use the [REST API connector](/docs/connectors/rest-api), whose **Extra Headers** field lets you set the header yourself. That is the whole difference between the two connectors — this one reads the document, that one does what you tell it.

## 2. A response schema containing an array

An endpoint is only loadable if Datanika can find the records in it. From each readable `GET`, the parser takes the path to the record array out of the declared response schema — trying the common envelope keys first (`data`, `results`, `items`, `records`, `value`, `rows`), then any other array property, looking inside nested objects up to three levels deep.

Two shapes are skipped outright:

- a `GET` whose declared response contains **no array** — there is no collection to load;
- a **templated path** such as `/users/{id}` — detail endpoints are not list endpoints.

A spec where *nothing* survives that is refused when you save, and the message lists the parser's reasons, up to three. A spec where *some* endpoints survive saves quietly, and the form does not show you what it skipped. If your table list is shorter than you expected, that is the first place to look.

There is a third, nastier variant: a response the API really returns is shaped differently from the schema the spec declares. Then the path to the array misses, and you get a table with **one row that looks like metadata** instead of many rows of data. Nothing errors. That endpoint needs the REST API connector, where you point at the collection explicitly.

## 3. Pagination, somewhere it can be read

The paginator is inferred from the declared response first — a next-page URL in the body, or a `Link` header — and otherwise from the endpoint's query parameters: a cursor parameter the response also returns, an offset/limit pair (`offset`/`limit`, `skip`/`top`, `skip`/`take`, `start`/`count`), or a page number.

If the spec declares none of those, Datanika sets no paginator and dlt's own runtime detection decides. Sometimes that works. When it does not, the symptom is clean and unmistakable: **only the first page loads**. Confirm how pagination really works from the vendor's docs, then pin it by hand with the REST API connector for that endpoint.

Datanika also derives a cursor where an endpoint has a suitable filter parameter paired with a timestamp field. It is not carried between runs, so it does not narrow what a later run asks for — every run requests every endpoint from the beginning again.

## What the form actually asks for

Open `/connections`. Connection Name comes first and is required; the type picker is directly below it; pick `openapi`. Then three fields:

- **OpenAPI Spec** *(required)* — paste the whole document, JSON or YAML. **OpenAPI 3.x and Swagger 2.0 are both accepted**; a 2.0 document is converted internally, so you do not need to upgrade it first. The parse happens **on save**, not on a separate button.
- **Base URL** — optional here. Leave it blank to use the spec's own `servers` entry, which is the common case. Fill it in when the spec omits `servers`, when its `servers` entry is a bare path like `/api/v1`, or to override a production host with a sandbox.
- **API Key** *(optional)* — stored encrypted at rest. How it is *used* is the table above.

Two traps around that form, both cheap to avoid:

**This is paste-only.** There is no "fetch from URL" field on the connection form. A URL-fetch path exists through the REST API, but it is not wired into the form, so handing the field a URL is not a supported step.

**Creating the connection through the API is stricter than the form.** The API schema requires `base_url`, so a programmatic create that omits it is rejected even though the form accepts it blank — the form backfills it from the spec's `servers` after parsing. If you script connection creation, send the base URL.

Three limits are enforced at save time, and a spec over any of them is not a bug to report — it is a document describing more surface than one connection should carry: **5 MB**, **300 readable endpoints**, **1,200 paths**. Most oversized specs are large because of examples and descriptions rather than endpoints.

## Test Connection deliberately does not try

You will get a neutral *not tested* verdict here, with its reason:

> *"Not tested. Calling an endpoint from your spec could have side effects, so we do not choose one for you. Your credentials are checked on the first run."*

There is no endpoint we know is safe to call — a spec's first `GET` might be `/users/{id}/export` on a metered plan. That makes the first run your verification step, which is the same conclusion as [the three answers Test Connection can give](/blog/test-connection-three-answers) reaches from the other direction.

## Verify the table *list*, not just the row counts

This is the part that is specific to a connector built from a document. When you check the first run, open `/models` and look at **which tables exist** before you look at how many rows are in them:

- A spec describing endpoints the vendor has retired produces **empty tables**.
- An endpoint whose responses use a media type the parser does not read produces **no table at all**.
- A declared response that does not match reality produces the **one-row metadata table** from section 2.

All three are visible in about thirty seconds on that screen, and all three are invisible on the run's status badge. Each table is named after the last segment of its path, lowercased with any run of other characters replaced by `_`, so `/api/v1/CoverPhotos` lands as `coverphotos`; column names are normalised to snake_case as they load, so a field the spec calls `dueDate` arrives as `due_date`.

Two more things to file away:

**Each run replaces this upload's tables with what that run fetched.** A record the API no longer returns is gone after the next run, and so are rows only an earlier run had loaded. If you want to keep every run's rows, the upload needs an explicit `"write_disposition": "append"` in its raw JSON config; each row carries its run's `_dlt_load_id` so a transformation can pick the most recent load.

**If the vendor revises their spec, Datanika will not notice.** The catalog is parsed once, at save time, and stored on the connection. New endpoints, renamed fields and changed pagination arrive only when you re-paste the document and save again. Put that on the same calendar as any other vendor API review.

## When to use the other one

Reach for the [REST API connector](/docs/connectors/rest-api) instead when:

- there is no spec at all;
- the spec omits `securitySchemes`, or declares only OAuth2;
- an endpoint you need is templated, declares no array, or lies about its response shape;
- pagination is not described in a way the inference recognises;
- you want two endpoints out of four hundred and would rather list them than trim a document.

Everything else — and it is most vendor APIs that publish a spec at all — is a paste.

- Field-by-field reference: the [OpenAPI connector page](/connectors/openapi).
- The full walkthrough, including every save-time error code and its form message: [Connect any REST API from its OpenAPI spec](/docs/connectors/openapi).
- Looking for the spec Datanika *publishes*, rather than one it reads? That is a different thing entirely, and it is the [API reference](/api/reference).
