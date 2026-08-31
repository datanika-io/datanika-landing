# Rules earned from incidents — Growth

Each line below cost a real defect. None is a work item; do not convert one into an issue.

**Why this file is in git.** These were carried in `plans/growth/PLAN_MARKETING.md` (deleted
2026-08-31, #372) and in `plans/growth/current_state.md`, which `WORKFLOW_RULES` §11 requires be
**rewritten from scratch every session**. A rule that only lives in a file designed to be replaced is
one careless rewrite from gone — and `plans/` has no reflog, which is how `SEO_KEYWORDS.md` was lost.
`current_state.md` links here; the text lives here.

---

## Numbers and the things they describe

**Bind a number to the fact it derives from.** A copied number is a claim with no owner. Every drift
incident on this site has the same shape — the derived half survives and the hand-written half rots:

- Landing's connector count was internally consistent across 16 call sites and bound to *nothing
  external*, so it sat at **35 for five weeks** after core reversed the Google Ads withdrawal
  (landing#294). Core's count was guarded against its own enum. Both internally consistent, mutually
  blind.
- The pricing JSON-LD's connector count is derived from the data file and has never drifted. The plan
  descriptions in the same object were copied from `Pricing.astro` and still describe **V1
  runs-based pricing four months after the V2 cutover** (#373).
- `/docs/getting-started` renders a derived total and a hardcoded source/destination split five words
  apart, in one arithmetically impossible sentence (#376). The guard reads the bound half and not the
  other.

**A number in a migration is not a number in a table.** `plans.max_parallel_runs` was reported as
`enterprise-monthly = 20` on the strength of the migration that sets it. Production holds **5**: that
`UPDATE` runs before the paid rows exist, matches zero rows on a database built from scratch, and the
rows are then created through an ORM that cannot see the column, taking the `server_default`. Ask the
running artifact.

**A number in the database is a commitment the moment it is enforced.** The publication date is not
the risk date; the enforcement date is.

**Print the denominator on any zero.** "0 clicks" means nothing until you say 0 of 5,182 impressions,
81% of them at position 31 or worse. A bare zero reads as a broken instrument or a dead property, and
it is usually neither.

**Impressions are not search volume.** They are bounded by our own ranking and are structurally blind
to any keyword we have no page for. Good for the pages that exist, useless for discovering pages that
should.

**Count dofollow separately from landed.** The two were conflated for five weeks, and the one link
recorded as "the high-value dofollow backlink" turned out to be `rel="nofollow"`. GitHub renders every
external README link nofollow; the HTML *mirrors* of those lists do not. **The question about a
curated list is not "how many stars?" but "does it have an HTML mirror on its own domain?"**

**And the mirror must link *your* domain — an HTML mirror is necessary, not sufficient.**
`project-awesome.org` mirrors `awesome-data-engineering` with no `noindex`, `Allow: /`, 117 external
anchors and **zero nofollow** — and **117 of 117 resolve to `github.com`**. It renders no project
homepages at all, so it passes authority to our repo and never to `datanika.io`. Ask both questions.
The corollary is about copy, not measurement: **where a list's convention permits either, the entry
links `datanika.io`, not the GitHub repo** — a repo-linked entry cannot build the site's authority by
any path, because GitHub is nofollow and the mirrors resolve back to GitHub.

**`rel="noopener noreferrer"` is dofollow.** Only `nofollow`, `ugc` and `sponsored` are link-equity
hints; `noopener`/`noreferrer` are window and Referer-header controls. Reading them as nofollow
discards real links. In the other direction, **a page-wide nofollow count of `0` is not a verdict** —
a client-rendered page has no anchors to count, so record the external-anchor count beside every
nofollow count or the two failure modes look identical.

## Guards

**A guard that names an instance goes red on the correct change.** `tests/connectors.test.ts` once
asserted that `google-ads` was withdrawn. When core reversed the withdrawal — the *right* change — the
test failed, and it would never have noticed a reversal it was not told about. A guard should assert
the invariant (a slug is never in the data file *and* the redirect map), never the instance.

**A guard that names a file goes blind when the claim changes file.** Extracting the pricing tiers
out of `Pricing.astro` into `src/data/pricing-tiers.ts` moved the Enterprise feature bullet out from
under `compliance-claims.test.ts`'s SOC 2 assertion — a refactor that made the copy *safer* and the
guard *weaker* in one commit. Nothing about the diff looked like a compliance change. It was caught
only because that test pins **a distinctive rendered sentence per file** as a control, so the file
going quiet was itself a failure. Two consequences: pin a control sentence beside every
count-is-zero sweep, and when you move copy, grep the test suite for the old path before you move it.

**A cron beats a PR check when the thing that breaks you lives in another repo.**
`connector-count-parity.yml` is deliberately a daily cron, not a required check: the change that broke
us landed in `datanika-core`, so PR-time in `datanika-landing` could never have caught it. The cost is
that you must then prove the cron *fires* — `event == schedule`, never a `workflow_dispatch`, which
produces a green run indistinguishable from a working schedule.

**Show every new guard red before trusting it.** Against the real pre-fix copy, not a synthetic
mutation: `rate-limit-claims` 8/26, `pricing-copy-rules` 2/6, `saas-endpoint-lists` 5/5,
`compliance-claims` 9 failures naming all three files. A test written after the fix and never seen
failing proves only that it compiles.

**A green build says nothing about a scheduled post.** A future `publishedAt` is excluded from the
build output entirely, so an error surfaces on publish day, in production. Backdate, build, confirm
`dist/blog/<slug>/index.html`, then restore the date — with `git restore` for a tracked file, and by
editing for a new untracked one.

**A banned-word rule needs the context, not just the word.** A naive §4.3 regex flagged "Plenty of
teams should still pick managed" and the verb in "would rather not run infrastructure." Narrow to the
quantitative use, keep an ALLOWED list with reasons, and test that no exemption has gone stale.

## Claims and evidence

**An issue naming one instance of a false claim is a sample, not an inventory.** Four times in one
month: Hetzner in six statements across two pages when the issue named the host; SOC 2 in four files
across four pages when the decision named two; email-verification on three pages including
`/docs/getting-started`, which the issue did not mention; and Fivetran dollar figures on three
surfaces when #325 fixed one. **Grep for the number, not for the topic** — a grep for "rate limit" on
`/api/keys` returns prose and a pointer; a grep for the number returns the whole table.

**Write the assertion in the direction you believe, not the convenient one.** The claim that
`/api/keys` carried no tier numbers is what found the fifth surface. An assertion you expect to pass
is worth writing precisely when you are wrong.

**An unverifiable claim gets removed, not reworded into a different guess.** The Stripe post's
metering sentence is simply absent now. 3–5x on a customer's bill is the wrong place to hedge.

**A spec's silence is a finding, not a gap to fill.** `rate_limit_rpm` appeared in no pricing spec.
The correct output was the observation, not an invented number.

**Correcting one claim can make a neighbouring false one easier to draw.** Fixing the host on
`/privacy` would have left a *fresh* false EU-transfer sentence in place of a stale host. Deleting the
stale `core#625` caveat from the MongoDB guide would have left a phantom form field standing
unqualified. Read the paragraph, not the sentence.

**A parameter with a `None` default and no producer is a feature that does not exist.** Four
instances: `rate_limit_rpm` unenforced for four months, `send_verification_email_task` with zero
callers, `client_ip.py` with no caller, and `predicted_bytes` — which `/features/volume-pricing/`
sells as a headline differentiator (#375).

**Never publish a capability claim written from a spec.** The MongoDB pages documented a
`connection_string` field and an `Auth Source` control the shipped form never had, because the docs
were written from `CONFIG_SCHEMAS` and the Reflex form is a separate hand-maintained list. "The schema
has it" was never evidence a user could reach it.

**A delegated research result is a lead, not evidence.** A subagent fabricated `CONTRIBUTING.md`
quotes for six backlink targets. Re-read the live file before every submission — `gh` posts under the
founder's real identity.

**Some maintainers ban AI-authored submissions, so read the CONTRIBUTING for that too — not just for
traction and age gates.** `ripienaar/free-for-dev` (~95k★) closes AI-written PRs *"without reviewing
it or discussing it"*; `awesome-selfhosted-data` warns that machine-generated contributions which
miss a guideline *"will result in a ban"* — on the highest-value backlink we have queued. This does
not change whether we submit, it changes **who**. And it forbids the obvious workaround: handing a
human AI-written text to paste is the same violation with an extra step, so the handoff carries facts
and the target's own requirements, never copy.

**Ask what your evidence records.** GitHub code search returns 0 for a model that exists in the
private cloud repo, and misses two of three `before_execute` call sites in core. A zero from an
instrument that also returns zero for a known-present control records nothing.

## Publishing

**Date-relative copy couples a post to its publish date.** "Until today…" had to be reworded when a
post moved two days. Grep new posts for `today` / `this week` / `just shipped` before scheduling.

**Check inbound internal links before scheduling a post.** It is the first constraint, ahead of
editorial preference: `mongodb-authentication-failed-authsource` could not move off 2026-08-30 because
a live connector guide links to it twice, and hiding it would have 404'd both.

**Astro strips frontmatter comments; it does not strip template comments.** An internal warning
written as an HTML comment in a `.astro` template shipped the founder's verbatim reasoning into
`dist/trust/index.html`. The source sweep was green while that was true — only reading the *built
output* caught it.

**No feature gating on integrations.** Every connector on every plan, including Free; we gate on
scale, not capability. This is a pricing principle, and it has already been contradicted once inside
our own backlog — a "premium connectors" add-on line, culled 2026-08-31.
