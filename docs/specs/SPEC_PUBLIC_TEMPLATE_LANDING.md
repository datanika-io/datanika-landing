# Spec: Public Template Landing Pages (Option C)

> **Status**: Draft, awaiting user review. No implementation. This is the standalone Option C spec surfaced from [SPEC_PIPELINE_TEMPLATES_DEPTH.md](https://github.com/datanika-io/datanika-core/blob/dev/docs/specs/SPEC_PIPELINE_TEMPLATES_DEPTH.md), where it was flagged as a measurement unblock but deserves to be evaluated on its own architectural merits.
> **Owner**: Product
> **Related**:
> - PR #81 — Pipeline Templates MVP (in-app, auth-gated, Python dataclass registry)
> - PR #94 — Plausible instrumentation (`?template=<slug>` query param already wired in `ConnectionState.load_template_from_query`)
> - [SPEC_PIPELINE_TEMPLATES_DEPTH.md](https://github.com/datanika-io/datanika-core/blob/dev/docs/specs/SPEC_PIPELINE_TEMPLATES_DEPTH.md) — Option B depth spec; flags Option C in [measurement preconditions](https://github.com/datanika-io/datanika-core/blob/dev/docs/specs/SPEC_PIPELINE_TEMPLATES_DEPTH.md) as a fallback when in-app data stays too thin
> - [SPEC_DOCS_IA_REDESIGN.md](SPEC_DOCS_IA_REDESIGN.md) — docs IA work that already shipped (PR #101/#104/#107); relevant because Option C adds a new top-nav surface
> - Existing `src/data/connectors.ts` on landing — the architectural precedent for how 32 data-driven pages on the landing site work today
> - Engineering's agent-tiers single-source-of-truth pattern (commit `46d1fa8` on core dev) — the drift-mitigation pattern Option C borrows
> **Date**: 2026-04-13 (drafted)
> **Decision framework**: Option C is an *architectural* question first, a *sequencing* question second. This spec answers "what would it look like?" completely, then presents three sequencing options without committing to one. The user picks the sequencing based on commercial priorities.

## Problem statement

The Pipeline Templates MVP shipped in PR #81 lives entirely inside the authenticated Reflex app at `app.datanika.io/pipelines/templates`. This is architecturally fine for the in-app flow (users land there from the Getting Started checklist and the empty-state CTA) but creates three structural problems that get worse over time:

### Problem 1 — Templates are unmeasurable for cold traffic

Plausible events from PR #94 (`template_selected`, `template_prefill_applied`) fire only when an already-logged-in user clicks a template inside the app. Cold traffic — the Google Ads visitors who haven't signed up yet, the organic search visitors who land from a blog post, the users who see a template link on social — **cannot be attributed** to templates at all.

The consequence is that the Option B depth decision (see [SPEC_PIPELINE_TEMPLATES_DEPTH.md](https://github.com/datanika-io/datanika-core/blob/dev/docs/specs/SPEC_PIPELINE_TEMPLATES_DEPTH.md)) can only be made from *post-signup* data. A template's commercial value depends on whether it closes the ad-click-to-signup gap, not just the empty-dashboard-to-first-run gap. Today we cannot observe the first gap.

The v2 depth spec's "reality check" section captures the practical implication: with ~20 sessions/day across the entire app, in-app template events will take 21–28 days to generate enough signal to decide anything. Public template pages would generate the same signal in days, not weeks, because they're in the path of all the cold traffic — not just the trickle that makes it past signup.

### Problem 2 — Templates are un-SEO-indexable

Google Search Console cannot index pages behind authentication. `/pipelines/templates` will **never** appear in organic search results regardless of how the page is structured internally. The audit trail is explicit: GSC was verified for the landing domain `datanika.io`, not for `app.datanika.io`, and even if we added the app as a property, the `/pipelines/templates` route returns a redirect to login for unauthenticated crawlers.

Meanwhile, the long-tail keyword opportunity is real:

- `stripe to postgres pipeline` — competitive but high commercial intent
- `stripe to bigquery etl template` — less competitive, same intent
- `postgres to snowflake replication template` — specific, match-typed
- `csv to duckdb free` — zero-credentials quickstart audience
- Every candidate in the Axis 2 list from the depth spec multiplies into 3–5 query variants via `to`/`→`/`and`/`pipeline`/`etl`/`template` combinations

None of these queries can land on anything template-shaped today. The best Datanika has for them is the [/connectors/stripe](../../src/pages/connectors/[slug].astro) page (connector-level, not template-level) or a comparison page ([/compare/fivetran](../../src/pages/compare/fivetran.astro)). Both are one level removed from the actual template experience the user is searching for.

### Problem 3 — Templates are un-shareable

A user who discovers a template they want to share with a colleague — via Slack, email, a blog post comment, a Reddit thread on r/dataengineering — has **no URL to paste**. `app.datanika.io/pipelines/templates` opens a login wall. `app.datanika.io/pipelines/templates?template=stripe-to-postgres` does the same. The only shareable artifact today is a screenshot, which is worthless for the "this looks cool, let me click" reflex that drives developer-tool virality.

Every successful data-tool company in the adjacent space — Fivetran, Airbyte, Stitch, dbt Labs, Supabase — has public connector or template pages precisely because the share-link is the virality mechanism. Datanika has shipped the competitive feature (templates) without the competitive distribution (public pages).

## What exists today (quick recap)

See [datanika/data/pipeline_templates.py](https://github.com/datanika-io/datanika-core/blob/dev/datanika/data/pipeline_templates.py) and [datanika/ui/pages/pipeline_templates.py](https://github.com/datanika-io/datanika-core/blob/dev/datanika/ui/pages/pipeline_templates.py).

- **Data**: frozen `PipelineTemplate` dataclass in Python, 3 instances (Stripe→PG, PG→BQ, CSV→DuckDB)
- **Route**: `/pipelines/templates` inside the Reflex app, auth-required
- **Query param bridge**: `/connections?template=<slug>` prefills the connection form via `ConnectionState.load_template_from_query` (wired in PR #81, instrumented in PR #94)
- **Plausible events**: fire only after auth

The query-param bridge is important. **It is the hook Option C needs.** Any external visitor sent to `app.datanika.io/pipelines/templates?template=stripe-to-postgres` today will either see the auth wall (if logged out) or jump straight into the prefilled flow (if logged in). The plumbing for "cold traffic → template preview → signup → pre-filled app" is already 80% built — the missing piece is the public preview step.

## The architectural decision

**Make template metadata a public content surface on the landing site, not an in-app Python registry.**

Concretely: a new `/templates/[slug]` route on `datanika.io` (the landing site, not the app) rendered from either a content collection or a TypeScript data file (see [Content model](#content-model)). The public page shows the template in detail with a "Try this template" CTA that deep-links into the authenticated app flow at `app.datanika.io/pipelines/templates?template=<slug>`.

The in-app `/pipelines/templates` page and the `datanika/data/pipeline_templates.py` dataclass **both continue to exist** — they're the authenticated entry point. The public pages are a new, additional surface for cold traffic, not a replacement for the in-app experience.

This is an architectural decision because it separates two concerns that the MVP conflated:

| Concern | Current MVP | Option C |
|---|---|---|
| Template **discovery** (cold traffic, SEO, sharing, ads) | In-app, auth-required, invisible to everyone who isn't signed up | Public landing pages, indexable, shareable, ad-linkable |
| Template **execution** (prefill + credentials + save + run) | In-app, auth-required, correct | In-app, auth-required, unchanged |

One surface for each concern. The MVP tried to do both from the same place, which is why cold-traffic measurement and SEO are impossible today.

## Content model

Each public template page contains:

### Required fields (source of truth: landing site)

| Field | Example | Notes |
|---|---|---|
| `slug` | `stripe-to-postgres` | Must match the Python `PipelineTemplate.slug` exactly. Drift-detection test enforces this. |
| `title` | `Stripe → PostgreSQL Pipeline Template` | SEO title, ≤60 chars |
| `description` | `Sync Stripe customers, charges, invoices, and subscriptions into a PostgreSQL warehouse for revenue analytics. Pre-configured schema, merge-mode writes, and dbt-ready staging.` | Meta description, 150–160 chars |
| `h1` | `Stripe → PostgreSQL` | Page heading, shorter than title |
| `source_connector` | `stripe` | Must match a slug in `src/data/connectors.ts` — lets the template page link to the existing `/connectors/stripe` page for setup-guide context |
| `destination_connector` | `postgresql` | Same contract, links to `/connectors/postgresql` |
| `use_case` | `Revenue analytics, MRR/churn reporting, cohort analysis` | Short prose, shown under the H1 |
| `tagline` | `Revenue analytics in 5 minutes, not a week` | Above-the-fold hook |
| `time_to_first_run` | `5 minutes` | Honest estimate, shown in the hero |
| `prerequisites` | `["Stripe account with read access", "PostgreSQL 12+ database"]` | Array of strings |
| `what_it_loads` | `["customers", "charges", "invoices", "subscriptions", "products", "prices"]` | Array of resources/tables the template configures |
| `example_sql` | Short dbt-style transformation showing `raw_stripe.invoices → marts.revenue_by_month` | Embedded code block, illustrative only |
| `screenshot` | `/images/templates/stripe-to-postgres.png` | Optional — hero image for OG/Twitter cards |
| `draft` | `false` | Hide unfinished templates from the index |

### Cross-reference fields (for internal linking)

| Field | Example | Notes |
|---|---|---|
| `related_templates` | `["stripe-to-bigquery", "stripe-to-snowflake"]` | Other templates that share the source or destination |
| `related_connectors` | Auto-computed from `source_connector` + `destination_connector` | Link to existing `/connectors/*` pages |
| `related_use_cases` | `["stripe-to-bigquery"]` | Link to existing `/use-cases/*` pages where the pair already has a story |
| `related_blog_posts` | `[]` (initially empty) | Populated manually when blog posts reference the template |

### SEO fields (Tier-1 treatment matching the connector pages)

| Field | Example | Notes |
|---|---|---|
| `seoTitle` | `Stripe to PostgreSQL Pipeline Template \| Datanika` | Matches the pattern already used in `src/data/connectors.ts` |
| `seoDescription` | `Pre-configured Stripe → PostgreSQL data pipeline. Customers, charges, invoices, subscriptions. Schema, dbt, and scheduling built in. Start free.` | ≤160 chars, primary keyword first |
| `seoH1` | `Stripe to PostgreSQL Pipeline Template` | Same pattern as connectors |

### Content model choice: data file OR content collection?

The landing site uses **both patterns** already, for different reasons:

- **Connectors** (`/connectors/[slug]`, 32 pages) live in [src/data/connectors.ts](../../src/data/connectors.ts) as a TypeScript data file, because they are short structured records with no long-form prose.
- **Connector setup guides** (`/docs/connectors/[slug]`, 15 pages) live in [src/content/connectors/*.md](../../src/content/connectors/) as a content collection, because they *are* long-form authored prose.
- **Use cases** (`/use-cases/[slug]`, 10 pages) live in [src/data/use-cases.ts](../../src/data/use-cases.ts) as a TypeScript data file, because the layout is mostly data-driven with short prose.
- **Blog** is a content collection, obviously.

Template pages sit between these two. They have a fixed layout (hero + what it loads + example SQL + CTA + cross-references) that's best expressed as data, but they also benefit from authored prose in the `tagline` / `use_case` / `example_sql` fields. Both patterns would work.

**Recommendation**: start with `src/data/templates.ts` as a TypeScript data file, because:

1. It matches the connectors/use-cases precedent (the closest analogs)
2. It's cheaper to drift-check against `datanika/data/pipeline_templates.py` (both are structured data; the test can be a simple slug comparison)
3. It scales trivially — adding a template is one object in an array, not a new markdown file
4. Authored prose fits fine in string fields; markdown rendering can happen inside the `[slug].astro` template using `<Markdown>` for the description/example_sql fields if needed

If a template later outgrows the data file (e.g., we add tutorial-length walkthroughs), migrating to a content collection is a mechanical transformation. Start simple; upgrade later.

## Routing

New routes on the landing site (`datanika.io`):

| Route | Purpose | Notes |
|---|---|---|
| `/templates` | Template index — grid of all non-draft templates, filterable by source category | Parallels `/connectors` and `/use-cases` index patterns |
| `/templates/[slug]` | Individual template detail page | Dynamic route via `getStaticPaths()` from `templates.ts` |

Updates to existing landing routes:

| Route | Change |
|---|---|
| `Navbar.astro` `links` array | Add `{ label: "Templates", href: "/templates" }` between "Use Cases" and "Pricing", OR between "API" and "Blog" — Growth's call |
| `/connectors/[slug].astro` | Auto-compute "Templates that use this connector" section, similar to how PR #87 auto-computes matching use-cases |
| `/compare/*` | Add "Use Case → Template" cross-references in the existing comparison bodies (e.g., "Migrating from Fivetran? The Stripe → PostgreSQL template matches their default flow.") |
| `/docs/pipelines` (PR #119 cross-link work) | Existing "Related Connectors" section extended with a new "Related Templates" section above it |
| `sitemap.xml` | Auto-picks up `/templates/*` via the existing Astro sitemap integration; no manual entry needed |
| `astro.config.mjs` sitemap `serialize()` | Add a new branch: `path.startsWith("/templates/") → changefreq: "monthly", priority: 0.8` (between connectors at 0.7 and pricing at 0.9 — templates have higher commercial intent than connectors) |

No URL changes for any existing page. No redirects.

## The auth bridge (cold traffic → in-app prefill)

This is the most important sequencing detail in Option C: the plumbing already exists.

```
┌────────────────────────────────┐     ┌──────────────────────────────┐
│ datanika.io/templates/         │ ──> │ "Try this template" click    │
│ stripe-to-postgres             │     │                              │
│  (PUBLIC, indexable,           │     │ Plausible: template_cta_     │
│   ad-linkable)                 │     │ clicked { slug, referrer }   │
└────────────────────────────────┘     └──────────────────────────────┘
                                                     │
                                                     ▼
               ┌─────────────────────────────────────────────────────┐
               │ app.datanika.io/signup?template=stripe-to-postgres  │
               │  (capture the intended template across the auth    │
               │   bridge via query param)                           │
               └─────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
               ┌─────────────────────────────────────────────────────┐
               │ Signup completes → AuthState.handle_signup_success  │
               │ reads ?template= from self.router.page.params and   │
               │ redirects to /connections?template=<slug>            │
               └─────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
               ┌─────────────────────────────────────────────────────┐
               │ ConnectionState.load_template_from_query (existing, │
               │ shipped in PR #81) reads ?template= and prefills    │
               │ the source connection form. User adds credentials,  │
               │ saves, continues the existing in-app flow.          │
               └─────────────────────────────────────────────────────┘
```

### What Option C requires on the core side

- `AuthState.handle_signup_success` (or wherever post-signup redirect happens) must read `?template=<slug>` from the URL and propagate it to the `/connections` redirect. **This is new work — ~30 minutes** once the landing side is live.
- Optional: a new Plausible event `template_signup_completed { slug }` fires from the signup state method, giving us the full funnel from public preview through signup. Adds ~15 minutes to the analytics module. Bumps `ANALYTICS_EVENTS` in [datanika/ui/analytics.py](https://github.com/datanika-io/datanika-core/blob/dev/datanika/ui/analytics.py).

### What Option C requires on the landing side

- New `src/data/templates.ts` with 3 initial template entries (same slugs as the Python dataclass)
- New `src/pages/templates/index.astro` (grid index)
- New `src/pages/templates/[slug].astro` (detail page)
- New test at `tests/templates-consistency.test.ts` that asserts: (a) every template in `templates.ts` has a matching slug in the Python dataclass file (read via filesystem, parsed as plain text), (b) every Python slug has a matching landing entry, (c) the render of each detail page contains the `/pipelines/templates?template=<slug>` deep link with the correct slug
- Navbar update (one line in `src/components/Navbar.astro` — same pattern as the `API` entry added during Approach B of the docs IA stack in PR #107)
- Optional: update `/docs/pipelines` to cross-link into `/templates` (PR #119 already added a "Related Connectors" section there; adding a sibling "Related Templates" section is a 15-minute change)

### What Option C does NOT require

- **No changes to the in-app `/pipelines/templates` page.** Users who reach it via the in-app empty-state CTA or the Getting Started checklist see the same experience as today.
- **No changes to `ConnectionState.load_template_from_query`.** The query-param bridge already works; it's the termination point of the auth bridge flow.
- **No new Python dataclass fields.** The landing side carries the marketing prose; the Python side keeps the technical config. They share slugs, not schemas.

## SEO strategy

The commercial argument for Option C is primarily SEO. The measurability and shareability benefits are real but secondary.

### Target keyword catalog

With 3 initial templates (Stripe→PG, PG→BQ, CSV→DuckDB), the primary keyword set is:

| Template | Primary keyword | Secondary | Long-tail |
|---|---|---|---|
| Stripe → PostgreSQL | `stripe to postgres pipeline` | `stripe postgresql etl`, `stripe data warehouse` | `stripe to postgres template`, `stripe postgres dbt`, `stripe revenue analytics postgres` |
| PostgreSQL → BigQuery | `postgres to bigquery etl` | `postgresql bigquery pipeline`, `postgres bigquery replication` | `postgres bigquery template`, `postgres to gcp warehouse`, `postgres analytics bigquery` |
| CSV → DuckDB | `csv to duckdb` | `duckdb csv pipeline`, `csv analytics duckdb` | `csv duckdb tutorial`, `local csv analytics`, `duckdb etl free` |

Each primary keyword has 2–3 secondary variants and 3–5 long-tail variants. That's **3 templates × ~8 query variants = ~24 long-tail queries** Option C could plausibly rank for — all with direct commercial intent.

At Option B depth (adding 8 more templates to the catalog), the total becomes `11 templates × 8 variants ≈ 88 indexable queries`. This is the compounding value: every template shipped on the public surface adds ~8 query variants to the organic footprint, for ~0 marginal spend.

### Page structure for rankings

Every template detail page should follow the same structural pattern (because Google rewards templated, consistent pages for head-term matching):

1. **H1** matches the target primary keyword exactly or near-exactly (`Stripe to PostgreSQL Pipeline Template`)
2. **Above-fold hero** includes the tagline, time-to-first-run, and the "Try this template" CTA
3. **Structured sections** in this order:
   - "What this template does" — 1-2 paragraphs of authored prose
   - "What it loads" — bullet list of resources (for rich-snippet eligibility)
   - "Prerequisites" — bullet list
   - "How it works" — 3-step walkthrough (screenshot or numbered list)
   - "Example transformation" — code block showing the output schema
   - "Try this template" — second CTA, bottom of page
   - "Related templates" — auto-computed from `related_templates`
   - "Related connectors" — auto-computed from source/destination slugs
4. **JSON-LD** — `HowTo` schema on each page (the template literally *is* a how-to), which Google's rich-results picker strongly favors for commercial queries
5. **OG/Twitter metadata** carrying the screenshot and primary keyword in the title

The [SPEC_DOCS_IA_REDESIGN.md](SPEC_DOCS_IA_REDESIGN.md) work already established the docs pattern for `BreadcrumbList` JSON-LD; templates would add `HowTo` alongside it.

### Cross-linking strategy (feeds internal PageRank)

PR #87's internal linking audit set the precedent: every high-value landing page should link to every other high-value landing page in its semantic neighborhood. For templates, the audit produces:

- **From each `/connectors/[slug]` page** → link to all templates that use that connector as source or destination (auto-computed)
- **From each `/use-cases/[slug]` page** → link to the matching template if one exists (auto-computed via shared source/destination slugs)
- **From `/compare/[slug]`** → link to 2–3 templates in the "how to migrate" section (manual curation once; the existing comparison pages already have sections where this fits naturally)
- **From `/docs/pipelines`** → new "Related Templates" section mirroring the "Related Connectors" section added by PR #119
- **From `/docs/getting-started`** → "Skip ahead with a template" link near the top, above the manual setup steps
- **From the blog** — the 11 existing non-draft blog posts should get an audit for "where would a template link make sense" (similar to the PR #87 blog audit); expect 3–5 relevant insertions
- **From the landing `/` homepage** — new "Start from a template" section below the existing hero, showing the 3 (or 5, or 11) template cards

The last bullet is the highest-leverage internal link because the homepage has the most incoming authority. It's also a design change that touches shared components, so it needs Growth coordination.

## Conversion funnel impact

### Current funnel (MVP + PR #94)

```
Google Ads click / organic click
         │
         ▼
Landing page (/, /pricing, /compare/*, /connectors/*)
         │
         │  (generic "Start free" CTA, no template context)
         ▼
Signup
         │
         ▼
Empty dashboard → Getting Started checklist → "Create a pipeline"
         │
         ▼
/pipelines/templates  ◄── first point at which the user even knows
         │                  templates exist
         ▼
Template click → /connections?template=<slug> → prefill → credentials → save
         │
         ▼
Manual: uploads → dlt config → first run
```

Steps between ad click and first run: **6–8**, depending on whether the user walks the Getting Started checklist or wanders. Every step is a drop-off opportunity.

### Option C funnel

```
Google Ads click / organic click (targeted at template keywords)
         │
         ▼
/templates/stripe-to-postgres (PUBLIC)
         │
         │  (specific "Try this template" CTA, high intent match)
         ▼
Signup (with ?template=<slug> preserved across auth)
         │
         ▼
Auto-redirect: /connections?template=<slug>
         │
         ▼
Prefill → credentials → save
         │
         ▼
Manual: uploads → dlt config → first run
```

Steps between ad click and first run: **4–5**. The template selection happens *before* signup, not after, which removes two manual clicks (Getting Started checklist → "Create a pipeline" → `/pipelines/templates` → template click). More importantly, the ad copy and the landing page are **pre-matched**: someone who clicks a `stripe to postgres template` ad lands on a page literally titled "Stripe → PostgreSQL Pipeline Template", which is a much lower-friction intent match than landing on the generic homepage.

### Estimated conversion uplift

This is speculative (we don't have Option C data, by definition), but the literature on SaaS conversion funnels consistently shows:

- **Intent-matched ad landing pages convert 2–5× better** than generic homepage landings for the same ad spend — e.g., [Unbounce's conversion benchmarks](https://unbounce.com/conversion-benchmark-report/), Google Ads' own "landing page experience" score documentation.
- **Removing funnel steps between intent and signup** typically yields 10–20% improvement per step removed, diminishing returns after 3 steps.
- **Public template pages in the dev-tools space specifically**: Fivetran, Airbyte, and Stitch all moved their connector pages public in the mid-2010s and reported (in conference talks, not audited data) 2–3× improvements in organic signup traffic.

A realistic Product expectation: **1.5–2× signup rate from paid traffic on template-matched ad groups**, plus an **uncapped compounding gain** from organic search over 3–6 months. The compounding side is the bigger prize; the paid side is easier to measure.

These numbers are not commitments. They are the kind of numbers Option C should be evaluated against, not promised to deliver.

## Cost estimate

### Engineering effort

| Work | Scope | Effort |
|---|---|---|
| `src/data/templates.ts` with 3 initial templates | ~80 lines of TypeScript matching the Python dataclass | 1 hour |
| `src/pages/templates/index.astro` (grid) | Mirrors `/connectors/index.astro` shape | 1 hour |
| `src/pages/templates/[slug].astro` (detail) | Mirrors `/connectors/[slug].astro` shape, adds `HowTo` JSON-LD | 3 hours |
| `Navbar.astro` — add "Templates" link (desktop + mobile) | Same pattern as "API" link added in PR #107 | 15 minutes |
| `astro.config.mjs` — sitemap priority entry | One branch in `serialize()` | 5 minutes |
| Cross-link updates to existing pages (`/connectors/[slug]`, `/compare/*`, `/docs/pipelines`, `/docs/getting-started`, homepage) | PR #87-style audit + edits | 2 hours |
| Drift-detection test (`tests/templates-consistency.test.ts`) | Reads both files, compares slugs | 1 hour |
| Core: `AuthState.handle_signup_success` picks up `?template=<slug>` and redirects to `/connections?template=<slug>` | Reflex state method + test | 30 minutes |
| Core: new `template_signup_completed` Plausible event (optional but recommended) | Inline `rx.script` + catalog update | 30 minutes |
| Manual QA of the full cold-traffic → signup → prefill flow | Real browser, real account | 1 hour |
| Screenshot production for the 3 hero images | 1 screenshot per template | 1 hour |
| **Total** | | **~11 hours / 1.5 days** |

### Growth effort (coordination, not implementation)

- **Ad campaign pivot** — point the existing Google Ads campaign groups at the new `/templates/*` pages instead of the generic homepage. Growth owns this; it's ~2 hours of ad account work + reviewing the match-type/keyword list against the new pages.
- **Copy review** — ensure `description`, `tagline`, `use_case` fields match the ad copy voice (Growth owns the tone guide)
- **Homepage "Start from a template" section** — design + copy; Growth + Product jointly
- **Blog audit** — find 3–5 places to insert template links in existing posts. ~1 hour of Growth's time.

Growth's total: **~4–6 hours**, spread over the Product implementation window.

### Grand total

**1.5 Product dev-days + 4–6 Growth hours.** That's ~2 calendar days of coordinated work if Product and Growth parallelize.

## Risk analysis

### Risk 1 — Drift between public template metadata and in-app Python dataclass

**Scenario**: the public `/templates/stripe-to-postgres` page advertises "loads customers, charges, invoices, subscriptions" but the Python `PipelineTemplate.dlt_config_defaults` only configures customers and charges. User clicks CTA, signs up, runs the pipeline, and finds it doesn't load what was promised.

**Mitigation**: `tests/templates-consistency.test.ts` reads the Python dataclass file as plain text (it's static data, no code execution needed) and extracts the slug set + the `dlt_config_defaults["resources"]` list for each template. Asserts that:
- every slug in `src/data/templates.ts` has a matching slug in the Python file
- every slug in the Python file has a matching TypeScript entry (fail loud on missing coverage)
- the `what_it_loads` field in `templates.ts` is a subset of (or equal to) the Python `resources` list for the same template (prevents over-promising)

This is the same pattern as Engineering's "agent tiers single source of truth" commit on core dev — the SoT lives in Python, the marketing surface lives in TypeScript, and a test enforces the subset relationship.

**Residual risk**: the drift test catches field-level drift but not semantic drift (e.g., "loads customers" vs "loads customer events"). Semantic drift is caught by manual review during PR review, which is good enough for 3 templates and borderline for 11.

### Risk 2 — Template execution fails silently after the public preview promised success

**Scenario**: the public page shows "5 minutes to first run". User clicks through, signs up, prefills, enters Stripe API key, saves, runs — and the run fails with "permission denied on invoices" because their Stripe account doesn't have the scope the template assumes.

**Mitigation**: the `prerequisites` field on the public page must **explicitly list** every permission/scope/network requirement. For Stripe, that means "Stripe account with read access to Customers, Charges, Invoices, Subscriptions, Products, Prices". For PostgreSQL, that means "PostgreSQL 12+ accessible from the internet or via our egress allowlist". The public page is the last chance to set expectations before the user signs up.

**Residual risk**: users who skim the prerequisites and hit the "5 minutes" claim have a worse first experience than users who never saw a promise. This is the classic "marketing promises vs. engineering reality" failure mode. The mitigation is honest, specific prerequisites — no weasel words.

### Risk 3 — SEO cannibalization of existing pages

**Scenario**: `/templates/stripe-to-postgres` starts ranking for `stripe to postgres pipeline`, but so does `/connectors/stripe` and `/use-cases/stripe-to-bigquery` and the blog post "Introducing Stripe Data Pipelines in Datanika". Google picks one and de-ranks the others; we waste the internal link equity.

**Mitigation**: each page type has a distinct target keyword intent:
- `/connectors/stripe` targets `[connector] + [etl tool]` (commercial, brand-aware)
- `/use-cases/stripe-to-bigquery` targets `how to sync [X] to [Y]` (educational, top-of-funnel)
- `/templates/stripe-to-postgres` targets `[X] to [Y] template` (commercial, late-funnel, highest intent)
- Blog posts target longer-tail narrative queries

The intent-mapping should keep Google from picking one over the others as long as the H1 and meta description match the intent precisely. If GSC shows cannibalization after launch, the fix is tightening the H1/meta per page, not merging pages.

**Residual risk**: Google's ranking system doesn't care about our intent mapping — it cares about click-through rate and dwell time. If `/templates/*` pages have much higher CTR than `/connectors/*` pages (which is the hypothesis), Google may de-rank the connector pages over time. This is **fine**, actually — templates are the higher-commercial-value pages, and the connector pages were never the top of the funnel.

### Risk 4 — Growth traffic diversion before measurement infrastructure is stable

**Scenario**: Option C ships, Growth points ads at `/templates/*`, Plausible on the landing site logs template CTA clicks. But `app.datanika.io` Plausible (PR #94) is still not wired by Infra, so the *post*-signup half of the funnel is still dark. Growth ships ads blind to the in-app side of the funnel.

**Mitigation**: the cross-domain funnel is stitched via Plausible's built-in cross-subdomain support (Plausible CE supports tracking across `datanika.io` and `app.datanika.io` under one parent site). The key is to configure the landing-site Plausible `data-domain` as `datanika.io` (already done in `Layout.astro`) AND the app-side Plausible `data-domain` as `datanika.io` (not `app.datanika.io` as currently planned in PR #94). That way both halves report to the same dashboard.

**This is a PR #94 modification.** It's not a breaking change — just a single env var change: `DATANIKA_ANALYTICS_DOMAIN=datanika.io` instead of `DATANIKA_ANALYTICS_DOMAIN=app.datanika.io`. Flag this in the sequencing section below.

**Residual risk**: Plausible cross-subdomain tracking has edge cases (iframe auth flows, redirect chains) that may undercount the funnel stitch. Accept ~5% measurement error.

### Risk 5 — Template catalog expansion becomes a content treadmill

**Scenario**: Option C ships 3 templates. Growth's ad campaign wants 10. Each new template is 2–3 hours of content production (screenshot, copy, prerequisites list, example SQL) plus the drift-test maintenance. At 10 templates, the content burden is 20–30 hours, and every new connector we add triggers "should we ship a template for this?" as a recurring question.

**Mitigation**: the content model is intentionally data-driven (TypeScript file, not markdown) precisely to keep marginal cost per template low. A new template is one object literal in `src/data/templates.ts` + a new entry in the Python dataclass + a regenerated screenshot. That's a <2-hour task if the template structure is stable.

The deeper question — "which templates do we ship?" — is the **Option B depth spec's job**, not Option C's. Option C is the infrastructure; Option B (and the data that feeds it) decides what goes in.

**Residual risk**: the first 3 templates will likely have bespoke content that feels authored, and the 10th template will feel templated. Accept this; templated-feel on the 10th is still better than no template on the 10th.

## Sequencing options

Three credible ways to sequence Option C relative to the Option B depth work in [SPEC_PIPELINE_TEMPLATES_DEPTH.md](https://github.com/datanika-io/datanika-core/blob/dev/docs/specs/SPEC_PIPELINE_TEMPLATES_DEPTH.md).

### Sequencing 1 — Option C before Option B (recommended for measurement unblock)

**When**: if the in-app funnel data from PR #94 stays too thin after 2–3 weeks (the "worst case" in the depth spec's Reality check section).

**Why**: public template pages generate measurement signal from cold traffic directly, so they unblock the Option B decision by giving us a working dataset on template click-through before any Option B feature is implemented. The Axis 2 decision in the depth spec ("which templates to add") becomes data-driven immediately instead of waiting for 3–4 weeks of post-signup data.

**Cost**: the 1.5 Product dev-days for Option C implementation delay Option B by ~2 calendar days.

**Risk**: if the user picks this and Option B's picks turn out to need server-side work (Axis 1 or Axis 4 options), the Option C work is pure addition, not substitution — no wasted effort.

**Decision criterion**: if by **day 14** after PR #94 goes live, the in-app `/pipelines/templates` has <20 unique sessions, promote Option C to pre-Option-B work.

### Sequencing 2 — Option B before Option C (recommended if in-app data is sufficient)

**When**: if the in-app funnel generates enough signal to make Option B picks by day 21–28 without needing Option C's measurement surface.

**Why**: ship the highest-leverage depth features first (whichever Option B axis wins from the data), then ship Option C as a second deliverable to amplify the now-validated templates to cold traffic.

**Cost**: cold traffic remains unmeasured and unreachable for the duration of Option B work (1–2 weeks). Google Ads campaign continues targeting the generic homepage instead of matched template pages.

**Risk**: the Option B picks may themselves turn out to be speculative because the only data informing them was post-signup (see the "Warning: Plausible-only decisions are biased" section in the depth spec). Sequencing 2 accepts this risk.

**Decision criterion**: if by **day 14**, the in-app `/pipelines/templates` has ≥20 unique sessions AND the distribution across the 3 MVP templates is meaningfully different from uniform, Option B can be decided from that data alone — run Option B first.

### Sequencing 3 — Parallel (best ROI if capacity exists)

**When**: if Product has bandwidth for both tracks OR if Growth can own the Option C implementation while Product waits on Option B data.

**Why**: Option C's landing-side work (Astro pages, TypeScript data file, cross-linking) is mostly Growth's skill set — it's the same pattern as the 32 connector pages Growth already shipped. Product's role is limited to the core-side `AuthState` redirect (~30 minutes) and the drift-detection test (~1 hour). The rest is Growth's territory.

**Cost**: requires Growth to agree to own the implementation, which means negotiating scope across departments. Neither Product nor Growth can unilaterally start Sequencing 3.

**Risk**: coordination overhead. Cross-team sequencing has failure modes (one side starts before the other is ready, one side's scope creeps, one side's deadline slips and blocks the other).

**Decision criterion**: user decision, not data-driven. If the user wants max optionality and is willing to broker the Product/Growth handoff, Sequencing 3 is the highest ROI.

### Summary table

| Sequencing | When to pick | Option B delay | Cold-traffic measurement | Risk profile |
|---|---|---|---|---|
| 1 — C before B | In-app data too thin after 14 days | +2 days | Fast (days) | Low — Option C is pure addition |
| 2 — B before C | In-app data sufficient by day 14 | 0 | Slow (weeks) | Medium — Option B decisions made without cold-traffic signal |
| 3 — Parallel | Cross-dept capacity available | 0 | Fast (days) | Higher — coordination failure modes |

**My recommendation — Sequencing 1 (C before B)**, contingent on the in-app data actually being thin at day 14. The v2 depth spec's Reality check section already predicts it will be, given Growth's audit findings. If the prediction is right, Option C becomes obvious pre-Option-B work. If the prediction is wrong and in-app data is rich, Sequencing 2 is fine.

Do not pick Sequencing 3 unilaterally — it requires a cross-team call with Growth first.

## Out of scope for this spec

- **Template marketplace / user-contributed templates.** Covered in the [depth spec's out-of-scope section](https://github.com/datanika-io/datanika-core/blob/dev/docs/specs/SPEC_PIPELINE_TEMPLATES_DEPTH.md). Not touched here.
- **Template versioning.** Same — depth spec. Not touched.
- **Template testing in CI against real warehouses.** Would be valuable but substantial scope. Follow-up.
- **Localization of template pages.** The landing site is English-only today; template pages inherit that. When landing gets i18n (if ever), templates come along.
- **A/B testing different CTA copy on template pages.** Growth's territory, not this spec's.
- **Changing the in-app `/pipelines/templates` page.** Option C adds a new surface; it does not replace or modify the in-app one.
- **Migrating `datanika/data/pipeline_templates.py` to a different format.** The Python dataclass stays as the technical source of truth.

## Open questions for the user

- [ ] **Sequencing**: pick Sequencing 1, 2, or 3 from the options above? My recommendation is 1 contingent on day-14 data, but the user may have commercial constraints (ad campaign launch date, investor milestone, etc.) that force a different choice.
- [ ] **Navbar placement**: where should the "Templates" link go in `Navbar.astro`? Options are (a) between Use Cases and Pricing, (b) between API and Blog, (c) as a new item in the existing Product submenu if one gets added, (d) not in the navbar at all (only reachable via links from other pages). Growth should weigh in.
- [ ] **Content model**: confirm the recommendation to start with `src/data/templates.ts` as a TypeScript data file (not a content collection)? The spec argues yes but the user may have an aesthetic preference for markdown.
- [ ] **Plausible cross-subdomain tracking**: confirm the Risk 4 mitigation (change PR #94's `DATANIKA_ANALYTICS_DOMAIN` from `app.datanika.io` to `datanika.io`)? This is a prerequisite for any Option C measurement story and should be done regardless of whether Option C ships.
- [ ] **Homepage "Start from a template" section**: build it as part of Option C, or defer to a separate homepage redesign project? Growth owns the homepage; this is primarily a coordination question.
- [ ] **Screenshot vs SVG hero**: production time and visual consistency. Screenshots age with the UI; SVGs are stylized but evergreen. Growth has more opinions here.
- [ ] **Initial template count**: 3 (matching MVP), 5, or more? Ship exactly what the Python side has, or use Option C as the forcing function to add 2–3 candidate templates from the Axis 2 list in the depth spec?

## Process notes for next agent

- **Do not implement this spec until the user picks a sequencing option.** The architectural decision is stable, but the "when" is a commercial call.
- **Start by confirming Plausible cross-subdomain tracking** (the Risk 4 mitigation). This is independent of sequencing and unblocks measurement regardless.
- **Before implementing, re-audit the in-app data** from PR #94. The depth spec's day-14 health check is the trigger for promoting Option C to pre-Option-B status. If that audit hasn't been done, do it first.
- **Coordinate with Growth early.** Option C touches the navbar (shared component), the homepage (Growth's territory), and the ad campaign pivot (Growth's territory). A unilateral Product shipping Option C wastes Growth's time and risks a conflict-heavy merge.
- **Cross-reference the depth spec.** Every Option B axis decision should consider whether Option C shipping first would change the picks. Usually it does — cold-traffic data is strictly better than post-signup data for Axis 2 (catalog expansion) decisions.

---

## Session log

- **2026-04-13 (v1)** — Initial spec drafted. Option C surfaced as a standalone architectural decision, not just the measurement fallback it's flagged as in [SPEC_PIPELINE_TEMPLATES_DEPTH.md](https://github.com/datanika-io/datanika-core/blob/dev/docs/specs/SPEC_PIPELINE_TEMPLATES_DEPTH.md). Three sequencing options presented without final pick. Ready for user review.

> Future extensions: add a new entry to this session log at the top of each revision. The spec lives outside any git repo; this log is the only version history we have.
