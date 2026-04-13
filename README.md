# Datanika Landing

Marketing and content site for [Datanika](https://datanika.io) — an open-source data pipeline platform (dlt + dbt-core + Reflex) living at [datanika-io/datanika-core](https://github.com/datanika-io/datanika-core).

This is a multi-section Astro site: homepage, blog, docs, comparisons, connector pages, use-cases, templates, AI-agent landing, and an API reference. Production build currently emits **112 pages** from 38 source routes + content collections.

## Tech stack

- **Astro 5** — static site generator, content collections, sitemap integration
- **Tailwind CSS 4** — utility-first styling via `@tailwindcss/vite`
- **Inter** — self-hosted via `public/fonts/inter/` (switched off Google Fonts CDN in PR #77 for better LCP)
- **Vitest** — 920 tests across 38 test files, all running in CI on PRs to `dev` and `main`
- **Plausible** — privacy-friendly analytics wired in `Layout.astro` with pricing-page conversion goals
- **Google Ads** — `gtag.js` conversion tracking wrapped into the `ConversionCTA` component

## Site sections

| Section | Route | Pages | Notes |
|---|---|---|---|
| Homepage | `/` | 1 | Hero + Features + Templates + HowItWorks + Integrations + Pricing |
| Blog | `/blog/*` | 16 posts | Astro content collection at `src/content/blog/` |
| Docs | `/docs/*` | ~20 | Architecture, getting started, connectors, pipelines, transformations, scheduling, self-hosting, audit log, AI agents |
| Connectors | `/connectors/[slug]` | 32 + index | Driven by `src/data/connectors.ts`; 15 have full setup guides at `src/content/connectors/<slug>.md` |
| Use cases | `/use-cases/[slug]` | 10 + index | Source → destination migration pages (e.g. `postgresql-to-bigquery`) |
| Comparisons | `/compare/{airbyte,fivetran,hevo,stitch}` | 4 | Feature matrix vs each competitor |
| Templates | `/templates/[slug]` | 3 + index | Pre-configured pipeline templates with HowTo JSON-LD |
| AI agents | `/ai-agents`, `/docs/ai-agents` | 2 | Positions the 5-tier agent API — see PRs #97, #121 |
| API reference | `/api/{index,keys,reference}` | 3 | REST API v1 docs with scopes and rate limits |
| Pricing | `/pricing` | 1 | 3-tier table + annual toggle + FAQ with `FAQPage` JSON-LD |
| Legal | `/{terms,privacy,refund}` | 3 | |
| OG images | `/og/*` | generated | Build-time OG image generation for every SEO leaf page |
| Misc | `/404`, `/rss.xml` | — | Branded 404, blog RSS feed |

## Project structure

```
datanika-landing/
├── src/
│   ├── components/             # Reusable Astro components
│   │   ├── Navbar.astro            # Fixed nav with logo, links, mobile menu
│   │   ├── Hero.astro              # Homepage hero with CTAs
│   │   ├── Features.astro          # 8-card feature grid (inc. AI-Agent Ready)
│   │   ├── Templates.astro         # Homepage "Start from a template" section
│   │   ├── HowItWorks.astro        # Connect → Build → Run → Monitor
│   │   ├── Integrations.astro     # Integration logo grid
│   │   ├── Pricing.astro           # 3-tier pricing table with annual toggle
│   │   ├── FAQ.astro               # Accordion fed from `src/data/pricing-faq.ts`
│   │   ├── CtaBanner.astro         # Final call-to-action section
│   │   ├── ConversionCTA.astro     # CTA wrapper that fires gtag conversion events
│   │   ├── RelatedConnectors.astro # Cross-link block used on connector/docs pages
│   │   └── Footer.astro
│   ├── content/                # Astro content collections
│   │   ├── blog/                   # 16 markdown blog posts
│   │   └── connectors/             # Per-connector setup guides (15/32 complete)
│   ├── data/                   # Typed data modules + build-time SoT fetches
│   │   ├── agent-tiers.ts          # Fetches /api/v1/meta/agent-tiers at build with fallback snapshot
│   │   ├── agent-tiers.fallback.json
│   │   ├── connectors.ts           # 32 connectors (categories, logos, primary keywords)
│   │   ├── use-cases.ts            # 10 source→destination migration pages
│   │   ├── templates.ts            # 3 pipeline templates — slugs mirror core `PipelineTemplate`
│   │   ├── pricing-faq.ts          # Q&A for /pricing, also rendered as FAQPage JSON-LD
│   │   └── software-application.ts # Homepage SoftwareApplication JSON-LD
│   ├── layouts/
│   │   ├── Layout.astro            # Base layout with meta, OG, breadcrumbs, JSON-LD
│   │   └── DocsLayout.astro        # Docs layout with sidebar, TOC, BreadcrumbList JSON-LD
│   ├── pages/                  # File-based routes
│   │   ├── index.astro
│   │   ├── ai-agents.astro
│   │   ├── pricing.astro
│   │   ├── 404.astro
│   │   ├── rss.xml.ts
│   │   ├── api/{index,keys,reference}.astro
│   │   ├── blog/               # Content collection route
│   │   ├── compare/{airbyte,fivetran,hevo,stitch}.astro
│   │   ├── connectors/{[slug],index}.astro
│   │   ├── docs/*              # ~20 doc pages
│   │   ├── og/                 # Build-time OG image generation
│   │   ├── templates/{[slug],index}.astro
│   │   ├── use-cases/{[slug],index}.astro
│   │   └── {terms,privacy,refund}.astro
│   └── styles/
│       └── global.css              # Tailwind import + custom theme + self-hosted Inter
├── public/
│   ├── fonts/inter/                # Self-hosted Inter (PR #77)
│   ├── llms.txt                    # Agent discovery doc
│   └── logo.png
├── tests/                      # 38 vitest files, 920 tests
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Commands

```bash
npm install           # install dependencies
npm run dev           # dev server on localhost:4321
npm run build         # production build to dist/ — emits 112 pages
npm run preview       # preview production build
npm run test          # vitest run — 920 tests
```

For pre-push safety, also run the repo precheck from the monorepo root:

```bash
bash plans/precheck.sh worktrees/datanika-landing-growth    # or your worktree path
```

## Source-of-truth fetches at build time

Two modules pull canonical data from the core app at build time, with checked-in fallback snapshots for offline builds:

- **`src/data/agent-tiers.ts`** fetches `https://app.datanika.io/api/v1/meta/agent-tiers` (5s timeout), runs a strict depth-1 validator on the payload, and falls back to `agent-tiers.fallback.json` on any failure. See PR #121 for the consumer and PR #130 (issue #123) for the strict validator.
- **`src/data/templates.ts`** enforces slug parity with the in-app Python registry at `datanika/data/pipeline_templates.py` via `tests/templates-consistency.test.ts`. Slugs must match core `AuthState._post_auth_redirect_target` regex `^[a-z0-9][a-z0-9-]{0,63}$`.

The pattern is deliberate: hardcoded content drifted out of sync with the app before (PR #97's 5-vs-6 tier contradiction), so the landing site now reads authoritative data from core and trips the build on shape violations instead of silently rendering stale content.

## Testing guardrails

The 920-test suite isn't just unit coverage — it's a layer of drift guardrails that enforce what the marketing site is allowed to claim:

- **Internal links**: every `/connectors/<slug>`, `/use-cases/<slug>`, `/templates/<slug>` referenced in prose must resolve to a generated page
- **SEO consistency**: title/meta/H1 pass for all SEO leaf pages against the format rules in `plans/growth/SEO_KEYWORDS.md`
- **OG image fallback**: every SEO leaf page must declare an `ogImage` or resolve one via the `ogCollection`/`ogSlug` → `/logo.png` chain
- **Agent-tier drift**: any `N-tier` phrase in `ai-agent-native.md` must match the SoT `tier_count`
- **Template consistency**: TS slugs ↔ Python dataclass slugs ↔ `connectors.ts` cross-references
- **Sidebar + breadcrumb parity**: every doc page gets the same sidebar + breadcrumb structure

If one of these fails locally or in CI, treat it as a factual error on the site, not a flaky test.

## Deployment

`main` is the production branch. Pushes to `main` trigger `.github/workflows/deploy.yml`, which SSHes into the Aweb VPS at `185.226.65.96`, pulls, builds, and rsyncs to `/var/www/datanika.io/`. The IndexNow submission step in the same workflow pings Bing on publish.

Feature PRs target `dev`; Infra promotes `dev` → `main` via a merge-commit PR when the queue is ready. Never push directly to `main`, and never merge a feature PR into `main` — see `plans/WORKFLOW_RULES.md`.

## Design notes

- **Dark theme** — near-black background (`#0a0a0f`) with slate text
- **Gradient accents** — violet (`#8b5cf6`) to cyan (`#06b6d4`) on text, buttons, and borders
- **Glassmorphism** — navbar uses `backdrop-blur-lg` with semi-transparent background
- **Responsive** — mobile-first with `sm`/`md`/`lg` breakpoints
- **Glow effects** — blurred circular gradients for depth behind hero and section dividers
- **Card borders** — all sections use bordered cards with subtle backgrounds for visual rhythm
