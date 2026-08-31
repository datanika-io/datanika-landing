# Spec: Docs IA Redesign

> **Status**: ✅ **Both approaches implemented and shipped to dev (2026-04-13).** User chose to ship A first, then B, as a chained-PR stack on top of PR #101.
> **Owner**: Product
> **Related**: PR #101 (sidebar scrollability quick fix, issue #100), PR #104 (Approach A, issue #103), PR #107 (Approach B, issue #105)
> **Date**: 2026-04-12 (drafted), 2026-04-13 (implementation shipped)

## Implementation status

| Approach | Issue | PR | Stacked on | State |
|---|---|---|---|---|
| Quick fix: scrollable sidebar | #100 | #101 | dev | Awaiting Infra dev→main |
| **A** — Nested groups inside `/docs/` | #103 | #104 | #101 | Awaiting Infra dev→main |
| **B** — Top-nav `/api/` split | #105 | #107 | #104 | Awaiting Infra dev→main |

The whole stack will rebase cleanly onto `dev` as Infra promotes each upstream PR. After PR #101 merges, GitHub auto-retargets #104 → `dev`. After #104 merges, GitHub auto-retargets #107 → `dev`.

The remainder of this document is the original design spec, kept for reference. The "Recommendation" section was overridden by the user — they chose to ship both approaches in sequence rather than waiting for OpenAPI to land first.

---

## Problem

The docs sidebar in [src/layouts/DocsLayout.astro](../../src/layouts/DocsLayout.astro) is a flat list of 20 entries:

```
Overview, Getting Started, Organizations & Members, Connections, Connectors,
Uploads, Transformations, Transformation Guide, Pipelines, Scheduling & Dependencies,
Scheduling Guide, Runs & Monitoring, Data Catalog, File Uploads, API Keys,
API Reference, Audit Log, Self-Hosting, Backup & Import, Architecture
```

Three concrete failures:

1. **Not visually navigable.** New visitors can't tell at a glance what's a tutorial, what's a reference, what's an admin topic, or what they need first vs. last. Everything has equal visual weight.
2. **Lower entries get buried.** Even with the scrollability fix from PR #101, anyone landing on a long page still has to scan past 17 entries to find "Self-Hosting" — the answer to a question they probably arrived with.
3. **Will get worse.** The connector setup guide assembly line is producing 32 connector pages, the cross-link work will surface them from doc pages, and follow-ups (agent docs, API webhooks, OpenAPI spec) will add 5–10 more entries. A flat list won't survive the next 6 months.

The scrollability fix in PR #101 keeps the sidebar usable in the short term. This spec is about the structural fix.

## Two approaches

### Approach A — Nested groups inside `/docs/`

Group the existing 20 entries into 5–6 collapsible sections inside the existing `/docs/` route. URLs don't change. The sidebar becomes a tree.

**Proposed grouping** (counts in parens):

| Group | Pages | Mental model |
|---|---|---|
| **Getting Started** (3) | Overview, Getting Started, Architecture | "What is this and how do I start?" |
| **Connect** (4) | Connections, Connectors, File Uploads, Uploads | "Get my data in" |
| **Build** (3) | Transformations, Transformation Guide, Data Catalog | "Shape my data" |
| **Run & Schedule** (4) | Pipelines, Scheduling & Dependencies, Scheduling Guide, Runs & Monitoring | "Make it run on a schedule" |
| **Operate** (5) | Organizations & Members, API Keys, Audit Log, Self-Hosting, Backup & Import | "Admin and ops" |
| **API & Reference** (1, growing) | API Reference | Holds API Reference today; OpenAPI, agent docs, webhooks land here later |

Sidebar UX:
- Default state: current group expanded, others collapsed
- Persist open state in `localStorage` (`docs:sidebar:open-groups`)
- Group headers are clickable (toggle expand/collapse), not links
- Active page's group always renders expanded on first paint

#### Pros
- **Cheap**: ~1 day of work, zero URL changes, zero redirects, zero new layouts
- **Reversible**: data structure change in one file plus a small render update; trivial to roll back
- **No bookmark breakage**: every existing link, every blog post link, every Search Console click keeps working
- **No coordination needed**: doesn't touch the navbar, doesn't add a new top-level concept the marketing team needs to explain
- **Works with the scrollability fix**: collapsed groups make the sidebar shorter, so the `overflow-y-auto` behavior is mostly invisible until you expand multiple groups

#### Cons
- **Doesn't separate API audience from platform audience.** A developer hitting `/docs/api` still loads the same layout with platform docs in the sidebar. They want a focused API reference, not 19 other entries.
- **Single sidebar means single information density.** API docs typically benefit from a different layout (left nav: endpoints, right nav: code samples, collapsible request/response panels). Cramming that into the existing `DocsLayout` is awkward.
- **Group naming is forever-ish.** "Build" / "Operate" are bets that may age poorly as the product evolves. (Mitigation: groups are data, easy to rename; renaming a group has zero URL impact.)

### Approach B — Top-nav-level "API" split (Stripe/Twilio pattern)

Add a new top-nav entry between **Docs** and **Blog**:

```
Datanika  |  Product  |  Pricing  |  Docs  |  API  |  Blog  |  Sign in
```

Move all API-shaped content to `/api/*` with its own dedicated layout. `/docs/*` becomes platform-and-concepts only.

**Proposed split**:

| Stays in `/docs/` | Moves to `/api/` |
|---|---|
| Overview, Getting Started, Architecture | API Reference (was `/docs/api`) |
| Organizations & Members | API Keys (was `/docs/api-keys`) |
| Connections, Connectors, File Uploads, Uploads | (future) OpenAPI explorer |
| Transformations, Transformation Guide, Data Catalog | (future) Webhooks |
| Pipelines, Scheduling, Scheduling Guide, Runs & Monitoring | (future) Agent docs / `llms.txt` |
| Audit Log, Self-Hosting, Backup & Import | |

`/docs/` retains 17 entries (still long enough that nested groups inside `/docs/` would help — Approach B does NOT preclude Approach A inside `/docs/`).

`/api/` starts with 2 entries and a clear runway to grow without polluting platform docs.

#### Pros
- **Audience-aligned.** A developer landing on `/api/reference` sees only API-shaped things in the sidebar. A self-hoster landing on `/docs/self-hosting` doesn't see API noise.
- **Two layouts for two purposes.** API pages can use a different layout optimized for endpoint reference (left: endpoint list grouped by resource, right: code samples) without compromising the platform docs reading experience.
- **Pattern-matches the prior art.** Stripe, Twilio, Vercel, Supabase all separate `/docs/` from `/api/`. Developers know the convention; it lowers cognitive load.
- **Marketing surface.** A "API" item in the top nav is a soft signal to enterprise buyers ("they have a real API, not just a UI") even before they click.

#### Cons
- **More work.** ~3–5 days vs. 1 day for Approach A. New layout, navbar update, content moves, redirects, sidebar consistency tests for the new section, sitemap updates, internal-link audit.
- **Bookmark breakage.** `/docs/api` and `/docs/api-keys` need permanent 301 redirects. Every blog post and connector guide that links to those paths needs an update or relies on the redirect. Engineering owns the redirect work but Product needs to enumerate.
- **Coordination required.** Navbar change touches `Navbar.astro` (shared component). Need to coordinate with Growth (any in-flight nav work) and Engineering (404/redirects task).
- **Doesn't fix `/docs/` on its own.** Even after the split, `/docs/` still has 17 entries — still benefits from nested groups (Approach A). So Approach B is *Approach A + extra*, not an alternative.
- **Brittle for now.** With only 1 page in `/api/` today, the new section feels empty. Better to land it together with at least one new API doc (OpenAPI explorer, webhooks ref) so it doesn't look unfinished.

## Recommendation

**Ship Approach A this week. Plan Approach B for after the OpenAPI explorer ships.**

Reasoning:

1. **Approach A is mostly free.** ~1 day of work, zero risk of bookmark breakage, zero coordination cost. It immediately solves the "I can't scan the sidebar" problem the user originally reported. It's the highest-value-per-hour move on the table right now.

2. **Approach B is the right end state but premature today.** With only one API doc page (`/docs/api`), the new `/api/` section would be a ghost town. Stripe's `/api/` is famous *because* it's huge and self-contained. Datanika's would look unfinished.

3. **Approach A ⊂ Approach B.** If we ship Approach A now, then later ship Approach B, the work isn't wasted: the 17 entries that stay in `/docs/` after the split still benefit from the same nested-group structure. Nothing has to be rebuilt.

4. **Buys time to grow API docs first.** The right trigger to ship Approach B is when Engineering finishes the OpenAPI auto-generation work and we have 5–10 API pages. Then `/api/` launches with content and the split feels deliberate, not aspirational.

**Decision needed from user**: confirm A → ship this week, OR override and pick B (with caveats above).

## Migration plan (Approach A — recommended)

### Files to change

| File | Change |
|---|---|
| [src/layouts/DocsLayout.astro](../../src/layouts/DocsLayout.astro) | Replace flat `sections` array with grouped structure; render as collapsible `<details>` elements (no JS framework dependency) |
| [tests/docs-sidebar.test.ts](../../tests/docs-sidebar.test.ts) | Update `EXPECTED_SIDEBAR` to a grouped structure; keep "every page has all 20 links" assertion; add a "groups exist and contain expected entries" assertion |
| [src/pages/docs/index.astro](../../src/pages/docs/index.astro) | Optionally restructure the index page itself to mirror the groups (not required) |

**No URL changes. No redirects needed. No sitemap regeneration needed.**

### Sidebar render approach (technical)

Use native `<details>` / `<summary>` elements — no Alpine, no Vue islands, no custom JS:

```html
<aside class="hidden w-56 shrink-0 md:block">
  <nav class="sticky top-24 max-h-[calc(100vh-7rem)] space-y-2 overflow-y-auto pr-2">
    {groups.map((group) => (
      <details open={group.includesCurrent} class="group">
        <summary class="cursor-pointer text-xs font-semibold uppercase text-slate-500 hover:text-slate-300">
          {group.label}
        </summary>
        <div class="mt-1 space-y-1">
          {group.items.map((s) => (
            <a href={s.href} class:list={...}>{s.label}</a>
          ))}
        </div>
      </details>
    ))}
  </nav>
</aside>
```

`<details open>` handles expand/collapse natively. Persisting state across pages can be a tiny inline `<script>` that reads/writes `localStorage` on `toggle` events — ~10 lines, no framework.

### Test updates

The existing tests check that every built doc page has every sidebar link. Keep that — it's still the right contract. Add:

- A new `EXPECTED_GROUPS` constant listing the groups and which entries belong to each
- An assertion that every group's `<summary>` text appears in every doc page
- An assertion that the active page's group has `open` in the rendered HTML

Existing assertions to keep as-is:
- "every built doc page has all 20 sidebar links"
- "every page links to the Connectors group"
- "the new sidebar nav is sticky and independently scrollable" (added in PR #101)

### Engineering coordination

**None required.** No URLs change, no redirects, no shared component changes outside `DocsLayout.astro`.

Engineering's open work on the 404 page and redirects (worktrees/datanika-landing-engineering (`worktrees/datanika-landing-engineering (local)`)) is unrelated to this and will not conflict.

### Estimated effort

| Task | Hours |
|---|---|
| Define group structure in `DocsLayout.astro` | 0.5 |
| Render with `<details>`, style, persist state | 1.5 |
| Update `docs-sidebar.test.ts` (grouped structure + new assertions) | 1.0 |
| Visual verification across 5–6 doc pages | 0.5 |
| PR + review iteration | 1.5 |
| **Total** | **~5 hours / 1 dev-day** |

## Migration plan (Approach B — for the record)

If the user picks B instead of A, the additional work on top of A:

### Files to change

| File | Change |
|---|---|
| `src/components/Navbar.astro` | Add "API" entry between Docs and Blog |
| `src/layouts/ApiLayout.astro` (new) | New layout with API-optimized sidebar (resources grouped, code samples panel) |
| `src/pages/api/index.astro` (new) | API hub landing page |
| `src/pages/api/reference.astro` (new) | Move from `src/pages/docs/api.astro` |
| `src/pages/api/keys.astro` (new) | Move from `src/pages/docs/api-keys.astro` |
| `src/pages/docs/api.astro` | **Delete** (replaced by redirect) |
| `src/pages/docs/api-keys.astro` | **Delete** (replaced by redirect) |
| `astro.config.mjs` | Add 301 redirects: `/docs/api` → `/api/reference`, `/docs/api-keys` → `/api/keys` |
| `tests/api-sidebar.test.ts` (new) | Sidebar consistency test for the new `/api/` section |
| All blog posts + connector guides linking to `/docs/api*` | Update links (or rely on the 301) |
| `public/sitemap-index.xml` regen | Automatic via Astro build |

### Engineering coordination

- **Pings Engineering's redirects task** (worktrees/datanika-landing-engineering (`worktrees/datanika-landing-engineering (local)`)). The 2 redirects in this PR should land alongside their 404 page work to keep the "broken links" story coherent.
- **Pings Growth** for any in-flight `Navbar.astro` work to avoid merge conflicts.
- **Cloudflare cache rules**: existing rules for `/docs/*` continue to apply; `/api/*` should get the same "5 min HTML edge cache" treatment. Infra picks this up; not blocking.

### Estimated effort

| Task | Hours |
|---|---|
| Approach A (still needed for `/docs/`) | 5 |
| New `ApiLayout.astro` + style | 4 |
| Move pages, update internal links | 2 |
| Navbar entry + responsive mobile menu | 1 |
| Redirect rules in `astro.config.mjs` | 0.5 |
| New `tests/api-sidebar.test.ts` | 1.5 |
| Update sitemap, OG metadata, JSON-LD breadcrumbs | 1 |
| Visual verification + cross-link audit | 2 |
| PR + review iteration | 2 |
| **Total (Approach B alone, on top of A)** | **~14 hours / 2 dev-days** |
| **Combined A + B** | **~19 hours / 2.5 dev-days** |

## Decision matrix

| Criterion | Approach A | Approach B |
|---|---|---|
| Effort | 1 dev-day | 2.5 dev-days |
| URL changes | None | 2 redirects |
| Coordination | None | Engineering, Growth |
| Solves the user's reported problem | ✅ | ✅ |
| Audience-aligned (devs vs. ops) | ⚠ Partial | ✅ |
| Future-proof for OpenAPI explorer | ⚠ Cramped | ✅ Roomy |
| Reversible | ✅ Easy | ⚠ Hard (URLs moved) |
| Risk | Low | Medium |
| Wasted work if we ship A then B | Zero | — |

## Open questions for the user

1. **A or B?** Recommendation is A this week, B after OpenAPI lands. Confirm or override.
2. **If A**: are the proposed groups (Getting Started / Connect / Build / Run & Schedule / Operate / API & Reference) the right mental model, or should I reshape them?
3. **If A**: should "Architecture" stay under Getting Started, or move to a new "Reference" group with API Reference?
4. **If B**: confirm we want to wait for OpenAPI explorer before shipping, or ship the empty `/api/` shell now and fill it later?
5. **Either way**: should the Connectors entry stay as a single sidebar item (current state) or be the parent of a sub-list of every connector (32 children)? My recommendation: stay as a single item — the connector index page already lists them all, and 32 sub-entries would re-create the original problem.
