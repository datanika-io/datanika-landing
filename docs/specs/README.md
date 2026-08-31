# Specs

Contracts that govern this site's copy and pricing narrative, versioned here rather than in the
local `plans/` tree.

**Why this directory exists.** Until 2026-08-31 these specs lived in `plans/`, which is outside every
git repo — no reflog, no remote, no review, no recovery. `plans/growth/SEO_KEYWORDS.md` (~36 KB) was
destroyed by a truncating write on 2026-08-30 and could not be restored. `plans/SPEC_PLANS_CONSOLIDATION.md`
(founder decision, 2026-08-30) moves every spec into the repo it governs.

**Not built, not served.** This directory sits outside `src/` and `public/`, so Astro neither renders
nor publishes it, and the `src/`-scanning suites (`compliance-claims`, `pricing-copy-rules`,
`connector-count-prose`) correctly do not treat it as site copy.

| Spec | Governs | Enforced by |
|---|---|---|
| [`SPEC_PRICING_V2.md`](SPEC_PRICING_V2.md) | Tier structure, the public "GB processed" definition, the messaging line, and the banned-phrase list for pricing copy | `tests/pricing-copy-rules.test.ts` (§4.3), `tests/rate-limit-claims.test.ts` (§2.5) |
| [`SPEC_DOCS_IA_REDESIGN.md`](SPEC_DOCS_IA_REDESIGN.md) | The `/docs` information architecture — the six sidebar groups, their reading order, and when a new top-level entry is justified | `tests/docs-sidebar.test.ts` |
| [`SPEC_PUBLIC_TEMPLATE_LANDING.md`](SPEC_PUBLIC_TEMPLATE_LANDING.md) | The public `/templates/[slug]` pages, their HowTo JSON-LD, and the drift check against core's Python source of truth | `tests/templates-consistency.test.ts` |

The two Product specs arrived 2026-08-31 with [core#734](https://github.com/datanika-io/datanika-core/issues/734).
Product's remaining specs govern the application rather than the site and live in
[`datanika-core/docs/specs/`](https://github.com/datanika-io/datanika-core/tree/dev/docs/specs).

**A spec is a claim about the world, so it goes stale like any other.** Each one carries a dated
header saying which of its sections are historical record and which are still binding. Read that
header before quoting a number out of the body.
