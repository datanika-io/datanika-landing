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

**A guard's scope is a path set as much as a phrasing.** `legal-pages-facts.test.ts` was written for
#343, when `/privacy` and `/trust` named the wrong hosting provider. It holds those two pages
consistent with each other and stops retired claims returning *there* — and it was entirely blind to
two blog posts still describing production as running on Hetzner in Nuremberg six weeks after it
moved, both of which were then syndicated to dev.to (#467). The rule already recorded here is *"a
guard matching one phrasing is blind to the second spelling"*; this is the same defect one level up,
where the blind spot is the walk rather than the pattern. **When a fact about us changes, ask which
surfaces assert it — not which pages you remember writing.**

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

**A guard scoped to the document cannot see a row deleted from the table inside it.** The `/dpa`
guard asserted that every sub-processor named on `/trust` also appears on `/dpa`, scoped to the
page's text. Deleting the **Resend row from Annex III** left the whole suite green, because "Resend"
also appears five times in the transfer clause and the measures annex. So a legal document whose
operative list had lost an entry read as correct. The recorded rule *a count that includes site
chrome measures the chrome* is the same defect with louder noise; here the noise was the page's own
on-topic prose, which is far harder to notice. **Scope the assertion to the artifact that is
operative, not to the document containing it — and pin a control that exactly one such artifact
exists**, or the extraction silently starts reading the wrong one the day a second table is added.

**A banned-word rule fires inside its own negation, and on a compliance page the negation is the
sentence you most need to write.** A bare ban on `ISO ?27001[- ]certified` matched `/dpa`'s own
honest line — *"we are not SOC 2 audited and not ISO 27001 certified"* — and failed the correct copy
on the first run. This is the recorded *"a banned-word rule needs the context, not just the word"*
rule reappearing in the place it costs most. **Anchor every ban to the affirmative form, then pin
both controls: one asserting it fires on a real affirmative claim, one asserting it does *not* fire
on the honest negation.** A guard that fails on correct copy gets deleted rather than narrowed.

**Adding a legal page should break the legal-page guard, and if it doesn't, the derivation is
decorative.** `/dpa` was picked up automatically by `legal-pages-commercial-claims.test.ts` — which
selects policy documents by an intrinsic property (a dated revision marker inside `<main>`) rather
than a path list — and the coverage test went red on arrival demanding page-specific assertions.
That red is the feature. **When you add a page to a derived set, the correct experience is a failure
telling you what the set expects of it.**

**A `git restore` of a file you have uncommitted edits in destroys them, silently.** The mutation
harness pattern — mutate the real artifact, prove the guard fails, restore — is only safe on a
**committed** file, because the restore comes from `HEAD` and not from your work. Run it on a file
still carrying your unpushed edits and the "restore" is a revert to something older than the change
you are testing. **Commit first, then mutate, then restore.** The tell is that the suite goes green
again and your feature is quietly gone.

## Claims and evidence

**A count of word hits is a flag, not a finding.** `open-core-plugin` was carried in the handoff as
"23 pricing hits — read it before it goes anywhere". Reading it: one architectural table row (`Usage
ledger + hourly overage sync`), one correct `Free / Pro / Enterprise` mention, and two links to
`/pricing`. No rate, no unenforced claim — the 23 was a broad `pricing|price|plan|tier|paid|free|cloud`
sweep. Same lesson as the dev.to anchor count that would not reproduce under any method: **state the
method with the number, or the next reader inherits a figure they cannot check and must either trust
it or redo the work.**

**"We checked and found nothing" decays into "there is nothing" unless you write down the date and
the scope.** The backlink inventory recorded *"the directory lane is ~exhausted"*, which was true of
the targets then in hand. A fresh sweep four days later found thirteen candidates, two of them
filable that afternoon against lists with no eligibility gate at all. A negative result is a
measurement and ages like one. **Put the date and the set you searched into the conclusion**, or the
next reader inherits a permanent no and stops looking.

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
so the reflex "the page is wrong, correct the page" is backwards for a promise we intend to keep —
*"Unlimited schedules"* stays and Engineering makes it true (Product, landing#396). Correct the page
only when the claim is one we have decided **not** to build. Those are different judgements and they
came out opposite ways on the same issue in the same hour.

🚨 **"Route it to a human" is not a safe default for an unfulfillable claim — it fails less
visibly.** *"Extra seats at $25/mo each"* had the right price and described a checkout that exists in
no form. My replacement, *"contact us to add them"*, was **also untrue**: `seats_included` is a
**plan** column shared by every org on the slug and `Subscription` has no allowance column, so there
is no operator action behind a contact request either (cloud#150). The first version is discovered by
anyone who reads the code; the second is discovered only when a real buyer asks and the founder has
nothing to do. **A promise routed to a human is still a promise — check that the human has an
action.** What shipped is the removal: the page states the included seats and offers nothing more.

**Before citing a schema convention as a reason, grep for the reader.** I argued that
`max_schedules` should become NULL because *"`max_api_keys` already establishes NULL = uncapped and
cloud reads it that way"*. **`max_api_keys` has zero readers in `datanika-cloud`** — the convention
is true of no code — and `check_schedule_quota` has no `None` guard, so NULLing first is
`int >= None`, a TypeError on the first schedule a paid customer creates (cloud#151). I had read the
claim in a handoff and repeated it as a property of the code; it was a property of a *sentence*. The
standing rule says a published claim must be bound to what production **enforces**. A *routing* claim
must be bound to what the code **reads**, and the reader ships before the migration.

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

**A dated post's body is a historical record; its metadata is not.** When a fact inside an old post
goes stale, a dated update note is the honest fix for the *body* — readers are entitled to see what
we actually published, and a cost post that quietly edits its own numbers is not worth reading. It
does nothing for `<meta name="description">`, `og:description`, `twitter:description` and the JSON-LD,
which are generated from frontmatter and travel into every social card and structured-data reader
**without the note attached**. In #467 the false host was in four generated tags and one markdown
line. **The body may stay wrong-and-dated; the metadata has to become true.**

**A scheduled post's lane reopens on a build, not on a date.** `publishedAt` is evaluated when the
site is built, so a post dated today 404s until the day's rebuild runs — and that rebuild is a cron
measured between 4h49m and 7h48m late, which once stopped firing entirely for 71 days (#387,
core#691). Our syndication gate requires the canonical to return 200, so **"not built yet" and "not
publishable" fail identically.** Before concluding a post is blocked, check that the rebuild has had
an `event=schedule` run today — a `workflow_dispatch` proves nothing about the schedule.

**No feature gating on integrations.** Every connector on every plan, including Free; we gate on
scale, not capability. This is a pricing principle, and it has already been contradicted once inside
our own backlog — a "premium connectors" add-on line, culled 2026-08-31.

**The gate for updating a published copy is the INVERSE of the gate for publishing a new one.**
Gate 5 refuses to syndicate text production does not serve. Correct for a new post. Applied unchanged
to an *update* it is actively harmful: it refuses to fix an article that is **staler** than
production, which is the only reason an update path exists at all. `devto_update.py` therefore
defaults its source to `origin/main` — what production actually serves — and makes pushing the
worktree an explicit, delta-printed acknowledgement. **A safety check copied into the opposite
operation can enforce the harm it was written to prevent.**

**An acknowledgement flag must gate the send, not the dry run.** The first version of
`--from-worktree` refused without `--i-know-it-is-ahead` even with no `--post`, which is a catch-22:
reading the delta is how you earn the acknowledgement, and the dry run is what prints it. A gate that
blocks the inspection makes the acknowledgement a formality typed blind.

**A published copy's URL slug does not follow its title.** Retitling a dev.to article leaves the slug
untouched — Forem derives it at creation. Good for link stability, and it means an update tool must
locate an article by **`canonical_url`, never by slug**: the slug is derived from the very field the
tool exists to change. Generalise it — **never key a lookup on the thing you are about to mutate.**

**Probe a route's existence unauthenticated: `401` means it exists, `404` means it does not.** This
settles "can the API do X?" in one call, with zero risk of a mutation, and it needs a positive
control to be worth anything. Used to establish that dev.to has no profile-write endpoint —
`GET /api/users/me` and `POST /api/articles` answered 401 while four candidate write routes answered
404 — which turned an assumption into a measurement and correctly moved the task to a human.

**A 404 is not an availability answer, and one endpoint is not a namespace.** On Forem, users and
organizations share `dev.to/<slug>`, so a user-lookup 404 says nothing about an organization holding
the handle. Check every namespace that can occupy the name, each against a control known to exist —
and know what is still unresolved afterwards: a reserved word and a suspended account both 404 from
outside, and both are enforced only at write time. **The residual doubt is part of the finding.**

## Removing a claim's subject, not just its wording

**When a published claim is false, ask whether the cheapest fix is deleting the thing that makes it
false.** `/privacy` §8 said we set no third-party advertising cookies while `Layout.astro` loaded the
Google Ads tag on 101 of 165 built pages. The reflex is to amend §8. The right move was to remove the
tag: the Ads account is **suspended**, so the tag recorded nothing, and amending would have traded a
real differentiator for a measurement we were not getting. **Removing the tag made the page true with
no legal wording changed at all** (#481). This does not contradict *"which one moves is a decision,
not a default"* — it is the third option that rule's two branches leave out: sometimes neither the
page nor the product moves, and the *unused thing between them* goes.

**Re-derive a status that decides something, even when a note already states it.** The suspension was
on file from 2026-08-31. Read again through the API on 2026-09-04, `customer.status` returned
`SUSPENDED` and lifetime spend was **byte-identical** to the earlier reading — which also proves
nothing served in between. A remembered status is a claim; a re-read one is a measurement, and this
one cost a single script run. It also found a **better instrument**: advertiser *verification* state
is browser-only, but `customer.status` is API-readable and discriminates against `ENABLED`.

**A promise routed to an escape hatch is still a promise.** The recorded rule says *"route it to a
human" is not a safe default — check the human has an action*. `/docs/connectors/kafka` did the same
thing one level lower: it admitted the form has no credential fields, then routed users to **Use raw
JSON config** to supply `security_protocol` and the `sasl_*` keys. Those keys are absent from the
runner's accepted-key set, so they are splatted into `pipeline.run()` and raise `TypeError` — the
advice **crashes the run** rather than failing to help, and it was printed under the exact
troubleshooting symptom that sends a user to it (#486). **Check the escape hatch has an action too.**

**The same fiction can ship three times in three surfaces, and closing an issue about one of them can
create the next.** `security_protocol` was removed from `connectors.ts` as fictional in landing#198
KF-1; core's schema carried dead `sasl_username`/`sasl_password` (core#157 CORE-8); and **the setup
guide written to close landing#198's own KF-3 put the fiction back as an escape hatch**, live for four
and a half months. When you close a "this field does not exist" issue, grep for the field in whatever
that issue also asked you to *write*.

## Guards, continued

**A check that asserts a feature exists will fail the correct removal of that feature.** The landing
deploy asserted, on the built output, that `data-gtag-send-to` appeared on at least one page — a good
guard, written for a real silent failure. Removing the ad tag would have made it **exit 1 on every
deploy**, landing merged-but-unshipped. The other direction is worse: had it passed, it would have
been a green check certifying a tag that no longer exists. **Before deleting a feature, grep CI for
assertions about it — and delete the assertion in the same commit.**

**A workflow step id lives in two places, and only one of them is the step.** Deleting the step left
its id in the failure-alert chain, where a missing step resolves to an empty outcome — so the alert
would have reported *"unknown"* for whatever really failed. Caught by an existing guard, not by
review. **Anything that enumerates steps is part of the step's definition.**

**Feed every pattern its own sample, in the test.** A marker written
`googletagmanager\.com/(?:gtag|gtm)\.js` matches neither real form: the loader path is `/gtag/js`
(**slash**) and the GTM container is `/gtm.js` (**dot**). It contributed a zero to a sweep of a build
that had 101 hits, and a zero from a dead pattern is indistinguishable from safety. The
"every marker matches its own sample" control caught it on the first run and is now the cheapest
control we have — one line per pattern, and it fails loudly.

**Prefer an allowlist of origins to a blocklist of vendors.** `tests/no-advertising-tag.test.ts`
asserts the complete set of third-party script origins the site may load. A blocklist only catches
vendors somebody enumerated, and the next tracker added will be one nobody listed. Proven by
mutation: an unrelated pixel from a host no marker names trips the allowlist and nothing else.

**A control must answer one question.** The false-positive control read the whole
`/connectors/google-analytics` page, so it also went red whenever the site genuinely shipped a tag —
making *"a marker is over-broad"* indistinguishable from *"there is a real tag here"*, the one
distinction it existed to draw. Rescoped to the extracted catalogue references, it stays green under
a real violation and fires only on an over-broad marker. Same shape as the `/dpa` Annex III finding:
**scope the assertion to the artifact that is operative, not to the document containing it.**

**Ban the affirmative form; pin the negation as a control — and pin that the negation still exists.**
Corrected copy usually has to *name* the thing it is disowning: the Kafka guide must say
`security_protocol` in order to say it does not work. So the ban is anchored to the JSON payload form
(`"security_protocol":`), and two controls sit beside it — one asserting the page still names the key
in prose, one asserting the honest statement is still published. Without the second, a page that
simply **stops discussing** authentication passes, which is worse than the original defect: a
Confluent user would get no warning at all.

## Measuring your own tools

🚨 **`grep -c $'\\r'` inside a `$( )` can degrade to an empty pattern, and an empty pattern matches
every line.** A CRLF audit reported `lines=115 crlf=115` on four files. It was **vacuous** — one of
those files was pure LF, which only a byte-level read showed. This is `grep -F ""` matching
everything, the exact trap the landing deploy workflow guards against in its own comment, arriving
through ANSI-C quoting instead. **Measure line endings with `git ls-files --eol` or a byte count,
never with a grep whose pattern is a control character.**

**Line endings in the working tree are not the line endings in the commit.** `git ls-files --eol`
reports `i/lf w/crlf` on this repo: the index is LF and git normalises on `git add`, so a mixed-ending
working file produces a clean, content-only diff. Check `git diff --stat` for a whole-file rewrite
rather than trying to match the working copy's endings byte for byte.

**An HTML comment in an `.astro` file ships; `{/* … */}` does not.** Already recorded for `/trust` and
`why-cheaper`. Third instance: a note explaining *why* the ad tag is absent, written as `<!-- -->` in
`Layout.astro`, would have gone into the `<head>` of every built page. Converted to an expression
comment and **asserted absent from `dist/`** — the source diff looks identical either way.

**A control that is sometimes slow is not a control, because a timeout reads as a violation.** The
false-positive control in `no-advertising-tag.test.ts` built
`new RegExp(".{0,60}" + name + ".{0,60}", "g")` and ran it over ~165 full HTML documents. It took
**5116 ms** against vitest's 5000 ms default — already borderline — and tipped over once 67 test files
ran in parallel, failing as a **timeout** in the same red as a real finding. `indexOf` + `slice` took
it to 465 ms with identical windows and an identical assertion. **Time your guards on the tree they
will actually run on, and treat a run near the limit as already broken.**

**A guard can pass on every branch it was written on and fail only on the MERGED tree.** Three guards
shipped in one session, each green on its own branch off `dev`; the first run of all three together
went red. Each half was internally consistent and they were mutually blind — the same shape as the
connector-count drift, one level up. **Before calling a multi-branch session done, rebase onto the
tree that will exist after the others land and run the suite there.** It is also the only way to get
a real total: adding branch counts together predicted 1833 and measuring it produced 1833, but only
one of those was evidence.

**Rewriting a control's extraction can leave it fast and dead.** Changing the window-collection from a
regex to `indexOf` preserved the assertion on paper. What proved it still worked was injecting an
over-broad marker — a bare `/google-analytics/i` hostname, which matches our own catalogue URLs — and
watching that control, and only it, go red. **A performance fix to a test is a change to the test.**

**A branch in the merge queue cannot be pushed to.** `remote rejected … (protected branch hook
declined)`, with *"Branches that are queued for merging cannot be updated."* So a fix discovered while
a PR is mid-queue either waits for that PR to land or goes on its own branch. Prefer its own branch
when the fix is to something **already on `dev`**, since it is then blocking every PR in the repo and
should not be hostage to unrelated content.

**`removed_from_merge_queue` fires on a SUCCESSFUL merge too, so it is not an ejection signal.**
`CLAUDE.md` records that the REST timeline carries no reason for that event and only GraphQL's
`RemovedFromMergeQueueEvent.reason` does — true, and it leaves the trap open: PR #490's timeline read
`added_to_merge_queue 06:35:22Z` then `removed_from_merge_queue 06:40:48Z`, which looks exactly like
the ejection the merge-queue runbook warns about. It had **merged**. **Settle it against
`git log origin/dev` and the file contents, never against the timeline or the PR JSON** — and note
that acting on the wrong reading would mean re-pushing the branch, which a queued branch rejects
anyway.

## Guards, continued — the disclosure batch (2026-09-04)

**Astro publishes template comments, so a guard reading the whole document can be satisfied by
the tag it exists to demand a disclosure for.** `Layout.astro` wraps the Cloudflare beacon in
`<!-- Cloudflare Web Analytics … -->`. A needle looking for that phrase to prove the legal pages
disclose the beacon therefore matched **on all 101 layout pages**, including the pre-change ones —
measured against the live `/privacy` and `/trust` before publishing, which is the only reason it
was caught. The file even says so about itself, one block below the beacon. **Scope every claim
assertion to `<main>`**, and note the general form: *the thing you are demanding a disclosure of is
often present in the page as a token, and a token is not a disclosure.*

**`<main>` is still too wide for a claim that lives in a list.** After the above fix, dropping
*"cookie-free web analytics"* from the Cloudflare sub-processor row on `/trust`, and again on
`/privacy`, left the guard **green both times** — satisfied by the same words in a Change log entry
and a transfers clause, both written in the same commit. `SPEC_SUBPROCESSOR_REGISTER` G1 records the
identical finding from the DPA annex (*"Resend"* appears five more times in prose). **Name the
element that carries the claim** — a `<tr>`, an `<li>`, a numbered `<section>` — select it by
content, and **assert the match count is exactly 1**: zero means the anchor rotted and the assertion
was vacuous, two means a green tells you nothing about which. Taking `[0]` hides both.

**The defences stack, and each is only visible once the previous is fixed.** Page → region →
`(recipient, function)`. Product hit the third level the same day: a recipient with two entries
supplies its own name to a name-matched assertion, so region-scoping does not save you when the
duplicate is *inside* the region and legitimate. Do not stop at the first one that goes red.

**An anchor that rots turns a guard vacuous rather than red, because `slice(at, -1)` takes the rest
of the file.** `skips already-closed issues in the candidate list` anchored on `"\n    if not
lines"`; a change made that condition multi-line, `indexOf` returned `-1`, and the assertion passed
by matching a *different* loop further down. Green, measuring nothing. **Assert every `indexOf`
anchor was found**, and add a negative control proving the slice is the region you meant and not a
superset containing it. Same family as `grep -c` printing `0` for a failed command.

**A guard that pins the old code goes red on the correct change — that is it working, not
breaking.** Two assertions pinned `if not refs and not tracking:` verbatim and failed when the
condition correctly gained a third clause. Identical in shape to the deploy step that asserted the
Google Ads tag was **present**, where a correct removal would have failed every deploy. **Update
deliberately; never widen to make the red go away.** And when one condition is spelled out in five
places, put it in a constant — the drift is what made two of the five silently vacuous rather than
loudly red.

## Claims and evidence, continued

**Re-reading is not re-deriving, and only one of them finds a false sentence.** The DPA annex was
carefully derived on 2026-09-03 and read over several times. Re-deriving every row before
publication — one day later — found `Annex III`'s footnote asserting *"Our website analytics are
self-hosted"*: true of Plausible, false of the Cloudflare beacon, which that page loads like every
other. **Before publishing a legal page, re-run each derivation rather than re-reading the
conclusion.** The cost was about twenty minutes and the artifact was the one where being wrong is
most expensive.

**A derivation nobody in your lane can run is not a derivation.** The annex's Resend row cited
`SMTP_HOST` in the running container, and Growth has no SSH to the app box. Replaced with
`send.datanika.io` TXT → `v=spf1 include:amazonses.com ~all` plus a present `resend._domainkey`,
which evidences the Amazon SES onward leg — the part the row actually claims. **Write the derivation
the next reader can execute, not the one you happened to use.**

**When a measurement is available, publish the number rather than the adjective.** A Change log
entry saying a measurement *"had been running without being named here"* is true and vague in the
direction that flatters us. It was **143 days** (`ab71c35`, 2026-04-14, the only commit that has
ever introduced that origin). *"We did not name it"* and *"we did not name it for five months"*
support different judgements, and only one of them is evidence.

**Prove a negative with a positive control on the same bytes.** *"The beacon sets no cookies"* rests
on `document.cookie` → 0, `localStorage` → 0, the string `cookie` in any case → 0 in a 30,294-byte
file. Those zeros are equally consistent with having fetched an error page. The control is
`function` → 56, `sendBeacon` → 3, `cfBeacon` → 3 in the same bytes.

## Measuring your own tools, continued

**Commit before you mutate, or the restore destroys your work.** The mutation loop
`mutate → build → test → git restore --staged --worktree -- <path>` is correct **only if the file is
committed**; run against uncommitted edits it restores to `HEAD` and silently discards them. It cost
five re-applied edits on `dpa.astro`. The `sha256` check in the harness is what reported `DAMAGED`
rather than a cheerful `RESTORED` — **make the harness assert the restore, not just perform it.**

**`gh pr update-branch` being refused is confirmation the PR is queued, not a failure.** A PR reading
`mergeStateStatus: BEHIND` with auto-merge armed **had already entered the queue**; the nudge came
back *"Branches that are queued for merging cannot be updated."* `BEHIND` is not a reason to
intervene on a queued repo — the queue rebases before testing. Read the queue with the GraphQL
`mergeQueue(branch:"dev")` query before touching anything.

**Structural facts about the build that will mislead the next person:** only **5 of the 101** pages
carrying `Layout.astro` have a `<main>` element (68 of all 165 do — the docs pages have one and no
beacon), and the beacon is on **101 of 165**, not all of them. A `<main>`-scoped guard therefore
covers far fewer pages than the page count suggests, and an anti-vacuity control has to be picked
from a very short list.
