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

**Third question, and it reverses the corollary on the one PR we tested it against: does the mirror
render the entry's link at all?** Applied to the pending `awesome-data-engineering` PR, the corollary
said "amend it to `datanika.io`" — the list plainly permits either, 166 of 307 entries link off
GitHub, and the three entries directly above ours are homepage links. Amending would have been
strictly worse. `project-awesome.org` renders an entry **only if it resolves to a GitHub repo**: the
entry name is an *internal* link to `/r/<owner>-<repo>`, the sole external anchor is an "Open on
GitHub" icon the mirror synthesizes, and homepage-linked entries — Mage, SQLMesh, Prefect, SuprSend —
are **absent from the mirror entirely**. Its project detail pages render one external anchor, GitHub
again, dropping even the homepage the repo declares in GitHub's own API. So the amendment would have
traded mirror presence for nothing, and `datanika.io` was unreachable from that list either way.

**The general shape: a rule derived from one measurement can be exactly wrong on the next instance,
and the cost of checking is one `curl`.** Do not apply any rule in this section mechanically to a
submission — re-measure the specific target first.

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

**A guard's scope should be derived from the artifact, never listed by hand.** The `/terms` gap was
not a wrong assertion — `legal-pages-facts.test.ts` was correct about everything it checked. It named
two pages in a hardcoded map, so `/terms` and `/refund` were never in the net, and `/terms` carried V1
"model run overages" *and* a `Starter` plan that never existed for four months with every build green
(#410, #416). Adding `/terms` to a list of two produces a list of three and leaves `/refund` out.
`legal-pages-commercial-claims.test.ts` instead selects pages by an intrinsic property — a dated
revision marker (`Last updated` / `Change log`) inside `<main>` — which picks exactly the four policy
documents out of 160 built routes, and fails when a fifth appears that no guard covers. **Ask what
makes the members of your set members, and test for that.**

**A short word inside a longer word is a false positive waiting to happen.** `/overages?/` matches
inside **"c-overage"**, so a sweep for billing language flagged `/trust`'s sentence about `wrong_org
coverage in every service test module` — a page with nothing to do with billing. Measured: 1 window on
`/trust` before word boundaries, 0 after, `/terms` unchanged at 5. A guard that cries wolf on correct
copy gets deleted rather than fixed, so the false-positive rate is a correctness property, not a
polish item. Pin the real sentences that **must not** match as controls — here `Standard Contractual
Clauses` and `Resend (Plus Five Five, Inc.)`, both of which a bare tier-name ban would have flagged.

**A count that includes site chrome measures the chrome.** Checking that `/terms` links to `/pricing`
returns 2 matches — on **every page on the site**, because the navbar and the footer both link it. A
document-level assertion of `>= 1` therefore passes on a page that deleted the reference entirely.
Scoped to `<main>`: `/terms` 1, `/privacy` 0, `/trust` 0, `/refund` 0. **Before asserting a count, ask
what it reads on a page you know is wrong.**

**Calibrate a floor against the measured minimum, not a round number.** A "the page was actually read"
control set at 1500 characters failed on `/refund`, a legitimate 1095-character five-section policy. A
floor above the real minimum fails on healthy copy; a floor far below it passes on a broken read.
Measure the smallest true member of the set first.

**An existence check is not a parity check.** The dev.to cross-poster's gate 1 proves the canonical URL
returns 200. It does not prove the canonical *serves the text being syndicated* — landing `dev` runs
ahead of `main`, so a post edited since the last promotion would publish under a `canonical_url`
asserting two different documents are one. It bites hardest in the case you most want to syndicate: a
post carrying a **correction**, published while the canonical still serves the false claim. Now gate 5
in `devto_crosspost.py`, a `git diff` against `origin/main`, shown failing before it was trusted.

## Claims and evidence

**A count of word hits is a flag, not a finding.** `open-core-plugin` was carried in the handoff as
"23 pricing hits — read it before it goes anywhere". Reading it: one architectural table row (`Usage
ledger + hourly overage sync`), one correct `Free / Pro / Enterprise` mention, and two links to
`/pricing`. No rate, no unenforced claim — the 23 was a broad `pricing|price|plan|tier|paid|free|cloud`
sweep. Same lesson as the dev.to anchor count that would not reproduce under any method: **state the
method with the number, or the next reader inherits a figure they cannot check and must either trust
it or redo the work.**

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

**Its mirror: a constant with no *consumer* is a tier that does not exist.** `/why-cheaper/` declared
`freeIncludedGB: 10` and read it nowhere, so `datanikaBill()` could only return Pro or Enterprise —
and the preset button labelled *"10 GB · Free cap"* quoted **$79** for a volume we give away (#410).
The declaration is what makes this hard to see: the constant is right there in the pricing object,
so a reader checking "does this page know about Free?" finds the answer yes. **Grep for the reads,
not the declaration.**

**A number can be arithmetically right and still be the wrong unit — check the denominator against
the biller.** "$0.40 overage per run" was exactly 0.8 GB × $0.50, and was a charge that cannot occur:
overage is summed over the *cycle* and ceiled to whole GB, so the smallest non-zero overage is $0.50.
Nothing in the arithmetic looks wrong; only the denominator does. Same session, same shape, opposite
direction: the spec's `$0.40/GB` for Enterprise was `399 ÷ 1000` where the biller divides by `1024`.
**Ask what the biller divides by before publishing any per-unit price.**

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

**Bind a published claim to what production ENFORCES, not to what landing believes.** Twice in one
night, in two different files. `src/data/connectors.ts` marked five cloud warehouses `direction:
"both"` with prose promising extraction, while core's own test asserts they are destinations (#391).
Then #373 was framed as *JSON-LD stale, page current*, so the pricing JSON-LD was bound to the page —
and the page was the wrong half: it sells V2 bytes while production bills V1 runs, because the byte
columns on `plans` were never seeded (#396, core#713). **Binding the derived half to the local
source of truth is not "binding it to the fact"** — it converts a visible mismatch into a coherent,
machine-readable assertion of something untrue, which is strictly harder to notice and, in the JSON-LD
case, eligible for a rich result. A self-consistency guard goes **green** on all of it. The question
to ask of any number about the product is *which artifact enforces this, and have I read it?* — the
`plans` table, the connector enum, the running container. Not the file next to the copy.

**"Derived" is not a synonym for "correct" — ask *derived from what*.** The rule above says bind the
claim to what production enforces. This is its sharp edge, and it caught the person applying it,
inside the same session. Core withdrew `s3` from the picker (core#863) and its README moved 36 → 35
on its own guard, because that number is `len(ConnectionType)` minus the withdrawn set. Landing's
count was `connectors.length` — **derived, guarded, and bound to our catalogue of published pages
rather than to what a reader can create.** #444 fixed the hardcoded prose and its own body asserted
the pricing FAQ *"followed on its own"*; a `grep` of `dist/` a minute later found **sixteen call
sites still reading `connectors.length`, publishing 36 across nine built pages**, the homepage and
both JSON-LD blocks among them.

This is harder to see than a hardcoded number, not easier: a reader checking *"is this derived?"*
finds **yes** and stops. Two consequences worth keeping:

- **A guard that matches a literal `<N> foo` in source is blind by construction to every `${…}` call
  site**, because those contain no digit. `connector-count-prose.test.ts` was written to catch
  hand-typed counts and had never once been able to see a derived one. That is not a bug in the
  guard; it is a limit nobody had stated.
- **So assert on the built output too.** `dist/` is the artifact the reader receives and is blind to
  no call-site spelling. It cannot tell you *which* source file is wrong — keep the source guard for
  that — but it is the only one of the two that could have caught this.
  `tests/connector-count-dist.test.ts`, with the two vacuity controls that a `dist/` sweep needs: the
  walk must find >100 pages, and the expected value must actually be rendered somewhere, because a
  broken walk and a regex that matches nothing both report zero violations.

**A withdrawal is not a deletion, and the count has to know the difference.** When core withdraws a
connector, the page stays — it ranks, the withdrawal is temporary, and 301ing it away is landing#294
with the sign flipped. What changes is the *marketed* set. Hence `withdrawn` on the entry and
`availableConnectors` beside `connectors`: two catalogues, one of pages and one of claims, and every
published number comes from the second. The parity cron subtracts the withdrawn entries before
comparing with core, so a withdrawal no longer reports as drift and then gets "fixed" by deleting a
ranking page.

**A sentinel is not a promise.** `/pricing/`, the homepage and `/features/volume-pricing/` all say
*"Unlimited schedules"* on Pro and Enterprise. `plans.max_schedules` is **9999** on all four paid
rows and `check_schedule_quota` hard-blocks there — no overage path, no flag. Nobody will reach it,
which is exactly why it survived: an absolute word is only ever falsified by a customer hitting the
ceiling, and ours has none. **Before publishing "unlimited", "all", "any" or "never", read the
enforcing row.** The general mechanism, from core#928, is worth more than the instance: *no migration
creates the paid plan rows*, so an out-of-band creator sets whatever columns existed when it was
written and **every column a later migration adds falls to its `server_default` on paid rows**. A
number in a migration is not a number in a table, and the exposure grows with every new column.

**When the page and the product disagree, which one moves is a decision, not a default.** The
founder's 2026-08-31 pricing decision (option (c)) makes the published page the acceptance criteria,
so the reflex "the page is wrong, correct the page" is backwards here. Writing *"9,999 schedules"*
would publish an implementation accident as a product boundary and retreat from a promise one
data-only change keeps. Correct the page when the claim is **unfulfillable** (see the seat rule
below); route the row when the claim is one we intend to honour.

**A claim the product cannot complete is different in kind from a claim that is merely imprecise, and
only the first is urgent.** *"Extra seats at $25/mo each"* had the right price —
`extra_seat_price_cents` is 2500 on both Enterprise rows — and described a checkout that exists in no
form: `check_seat_quota` raises rather than bills, and `seats_included` is on the *plan*, shared by
every subscriber on it, so nothing a buyer does raises their own. The interim fix is not to delete
the price but to **name a channel a human can actually complete** — here, the contact route that is
already the tier's CTA.

**A second, hand-maintained copy of a page's facts is a drift generator, and a stale DRAFT marker
keeps it that way.** `/features/volume-pricing/` duplicates the tier table by hand rather than
deriving it from `src/data/pricing-tiers.ts`, under a comment reading *"DRAFT — Do NOT merge before
…"* that had been stale for four months. A marker saying a live file is unfinished tells the next
reader it does not need maintaining. **Either derive the duplicate or label it as a duplicate** —
never leave a lifecycle marker that the file's own deploy history contradicts.

**A guard bound to one spelling is blind to the others, and `dist/` is where you find out.** A `grep`
of `src/data/` for the seat claim returned **one** call site; a `grep` of `dist/` returned **three
pages**, because the duplicate table spells it `+$25/seat`. Same lesson as landing#443's connector
count arriving by a different route: there the guard matched a literal digit against a template
expression, here it matched one phrasing against two. **Quantify over the built output and over the
*price*, not over the sentence.**

**Restore a mutation from a commit, not from the index.** `git restore --staged --worktree -- <path>`
is the documented restore in `WORKFLOW_RULES.md` §1, and it restores from the **index** — which, if
your edits are uncommitted, holds `HEAD`. A mutation harness that "restores the original" that way
silently reverts your session's own work on every file it touches. **Commit first, then mutate**, and
make the harness assert `git hash-object` returns to the pre-mutation value — that assertion is the
only thing that reported it here.

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

⚠️ **`<script>` comments are template comments too, and they ship as production JS.** Second
instance, #410: a six-line `//` block explaining a pricing defect — *"read by NOTHING"*, *"for a
volume we give away"*, an issue number — went into `dist/why-cheaper/index.html` verbatim. Nothing
secret (the repo is public), but the defect narrative does not belong in the bundle a customer
downloads. **Put the rationale in the guard test, the issue and the PR body — none of which ship —
and leave the inline comment short and neutral.** Then `grep` your own phrasing in `dist/` before
pushing; the source diff looks identical either way.

**No feature gating on integrations.** Every connector on every plan, including Free; we gate on
scale, not capability. This is a pricing principle, and it has already been contradicted once inside
our own backlog — a "premium connectors" add-on line, culled 2026-08-31.
