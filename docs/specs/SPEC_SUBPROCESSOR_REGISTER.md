# SPEC — Sub-processor register

> **Status**: contract. 🆕 **The posture decision is made — the founder approved the DPA including its
> 30 days' notice, so §3 option (A) is the live path and Stages 0 **and** 1 are both in scope.** The
> previous revision said "awaiting the founder's posture decision"; that is no longer true.
> ⚠️ **The decision has been taken; the artifact has not shipped.** [landing PR #480] read
> `state=OPEN draft=true merged=null` when this revision was written — so the *page* is still a draft
> even though the *posture* is settled. Do not infer one from the other in either direction.
> **Owner**: Product. **Consumers**: Growth (the three published surfaces), Engineering/Infra (the
> change triggers in `datanika-core` **and** `datanika-landing` — see §9, which now has two).
> **Origin**: [core#676] finding 4b, [cloud#163], [landing PR #480] item 2.
> **Revised 2026-09-04** against its first real input — the Cloudflare Web Analytics beacon
> disclosure. **Read §2a before anything else**: that change broke three parts of the first revision,
> and the corrections are the substance of this one.
>
> 🚨 **This spec contains no legal text and proposes none.** The wording of `/dpa`, `/privacy` and
> `/trust` is Growth's surface and the founder's decision. This document specifies **the artifact and
> the mechanism a 30-day notice commitment needs in order to be keepable**, and nothing else. Where it
> touches published copy it says *what must be derivable*, never *what it must say*.

---

## 1. Why this exists

`/dpa` §6 (draft) commits to **30 days' notice before a sub-processor change**. The PR body records,
correctly, that *"no mechanism exists"* — the only route offered is an email subject line with no
subscriber list behind it.

A commitment needs somewhere for the notice to **come from**. Today the sub-processor list is a
paragraph on one page, a hand-written table on a second, and a page-local array on a third. There is
nothing that can be *changed*, so there is nothing a notice can be *derived from*.

## 2. What was measured, 2026-09-04, before writing any of this

**Three surfaces, three different lists**, counted mechanically rather than read:

| surface | entries | how it is authored | guarded? |
|---|---|---|---|
| `/privacy` §4 "Data Sharing" | **7** `<li>` | hand-written list items | no |
| `/trust` `#subprocessors` | **6** `<tr>` | hand-written table rows | superset target only |
| `/dpa` Annex III (draft) | **8** | a page-local `const subprocessors` array | ✅ subset of it is asserted |

The only guard that exists is the one Growth built in [landing PR #480]: `/trust`'s names must all
appear in `/dpa`'s annex. **Nothing constrains `/privacy` against either**, and `/privacy` §4 carries
this sentence:

> *"The same list, with each provider's purpose and data location, is on our Trust & Security page."*

**Two named companies are described differently on different pages, and in each case the page that
matters most carries the least-alarming description:**

1. **Google.** `/privacy` names it only as *"Google / GitHub — only if you use OAuth sign-in"*.
   `/dpa`'s annex names Google LLC as receiving *"data subject requests sent to info@datanika.io and
   security@datanika.io"* — unconditionally, for every data subject. **`/privacy` §7 and §12 are the
   sections that tell data subjects to email those addresses.** So the page directing people to a
   mailbox omits the operator of that mailbox from the corresponding role.
2. **GitHub.** `/privacy` gives it the same OAuth-conditional framing; `/trust` lists it
   unconditionally, holding *"our code and deployment credentials"*.

⚠️ **This is a statement about our artifacts, not a compliance conclusion**, and it is deliberately
not fixed here — see §13.

🔑 **The modelling finding this produced, and it is the reason a naive register would not have
helped:** a register keyed on **recipient** gives one row per company, and the row is written for
whichever function the author had in mind. That is exactly how Google came to be described as
OAuth-only on the page that routes erasure requests to it. **The register is therefore keyed on
`(recipient, function)`, not on recipient** — see D2.

## 2a. The first real change, run against this spec before anything was built

The founder decided to **disclose** the Cloudflare Web Analytics beacon rather than remove it. That is
the register's first live input, and it arrived before a line of the register existed — so it was used
as the test case it is.

**Measured, 2026-09-04:**

| fact | derivation |
|---|---|
| the beacon is live on every page | `src/layouts/Layout.astro:229` — a `<script defer src="https://static.cloudflareinsights.com/beacon.min.js">` in the shared layout |
| processing since **2026-04-14** | `ab71c35`, *"[Growth] Inject Cloudflare Web Analytics beacon into Layout.astro (closes #141)"* — the first commit introducing that origin |
| it appears on **none** of the three lists | `/privacy` §4 (one `<li>`), `/trust` `#subprocessors` (one `<tr>`) and `/dpa` Annex III (one array entry) each carry exactly one Cloudflare row, and **not one of them mentions analytics** |

🔑 **This is the validation of D2, by the only test that counts.** Cloudflare is already a recipient on
all three surfaces. The beacon adds a **function**, not a party: the recipient list length does not
change, and the existing Cloudflare row stays accurate for its own function. **A register keyed on
recipient would have shown no change at all** — no diff, no review, and nothing for a notice to be
derived from.

🚨 **And it broke three things in this spec.** They are corrected in place below rather than filed,
because a spec that cannot represent its own first input is not a contract yet:

1. **G1's anti-vacuity proof goes green** on the deletion it exists to catch — a second entry for the
   same recipient supplies the name the assertion looks for. Fixed in §11. This is the Resend defect
   [landing PR #480] measured, recurring one level up: the duplicate name now comes from *the register
   itself* rather than from prose, so scoping to the list region — the fix that worked there — does
   nothing here.
2. **The 30-day invariant goes red on a truthful entry.** The beacon began processing five months
   before it was disclosed; D4 could express only "announced, then processing", so the honest entry
   fails G3. Both escapes — backdating `announcedOn`, or a per-entry exemption flag — are forbidden by
   §7's own text. §7 now splits the two dates instead of choosing between those.
3. **D6 could not have seen it, by construction.** The trigger enumerates `datanika-core` artifacts;
   the beacon is a `<script src>` in `datanika-landing`. §9 gains a landing-side candidate source.

⚠️ **Read the third as the general case, not as a Cloudflare case.** A third-party script tag, a font
CDN, an embedded widget, a tag manager, a session recorder — every one lands in landing's `src/` and
would have been equally invisible.

## 3. The framing the founder's decision actually needs

[landing PR #480] presents item 2 as *accept §6 as written, or soften it to "we will post changes
here."* **Softening §6 does not remove the commitment**, and the reason is measurable:

> `src/pages/trust.astro:347`, **live in production today**:
> *"We notify customers of subprocessor changes at least 30 days in advance."*

The DPA does not create that obligation. It makes an already-published one contractual. So the real
choice is:

- **(A) Build the mechanism** — §§4–10 below, Stage 0 + Stage 1. ✅ **DECIDED — the founder approved
  the DPA including the 30 days' notice.** This section is kept as written rather than trimmed to the
  answer, because the argument below it is what makes (A) *keepable* rather than merely chosen.
- **(B) Soften `/dpa` §6 *and* `/trust`**, together, in one change. Stage 0 only. **Not taken.**

**What is not available is softening only the DPA**: that leaves the same promise live on `/trust`
with the same nothing behind it, and adds a contradiction between two published pages — the precise
failure mode [landing#343] was about.

⚠️ **Stage 0 is required under both options**, because the three lists already disagree and one page
already asserts they do not. It is not contingent on the §6 decision.

---

## 4. D1 — The register is one artifact with three consumers

**`datanika-landing/src/data/subprocessors.ts`**, a typed module. `/privacy`, `/trust` and `/dpa`
render from it; none of them holds a list of its own.

This is the pattern `src/data/pricing-tiers.ts` already exists for, and its header records why: the
hand-mirrored copy *"described V1 runs-based pricing for four months"* ([landing#373]). A legal list
is the same failure with a worse consequence.

The array Growth already wrote inside `dpa.astro` is the right shape and should be **moved**, not
retyped. Its per-row derivation comments move with it, onto the rows they describe (D3).

## 5. D2 — Keyed on `(recipient, function)`

One entry per **function a recipient performs**, not one per recipient. `Google LLC` has two entries
(inbound mail delivery; optional identity provider) and so does GitHub. **`Cloudflare, Inc.` has at
least three** — edge delivery (CDN/DDoS/DNS/TLS), inbound mail routing, and web analytics — of which
exactly one is published today. Each carries its own `scope`, `purpose` and `dataCategories`.

**Rationale**: §2's finding. Merging functions lets the least-alarming one define the row, and the
merge is invisible in review because the row still reads as accurate.

🔑 **Three independent witnesses now, and the third is the strongest because it is a decision we
recorded as correct.** `CLAUDE.md` documents Cloudflare Email Routing — the path carrying mail sent to
`security@`, `info@` and `dmarc@`, which are the addresses `/privacy` §7 and §12 tell data subjects to
use — and concludes: *"This added **no new sub-processor**, so it is not one of the `/privacy` +
`/trust` triggers."*

That reasoning is **recipient-keyed and function-blind**, and it is exactly the inference D2 exists to
prevent. It happens to be right about `CLAUDE.md`'s own trigger list, which enumerates hosts and
providers rather than functions — and [landing PR #480]'s annex already discloses that mail path in
prose, so the two artifacts disagree about whether anything was added. **Under this key, it was.**

⚠️ Do not read this as an accusation about that note. Read it as the measurement: **the recipient key
produced a defensible-looking "no change" twice inside four months** — Email Routing, then the
analytics beacon — and both times something new began touching data. That is not a pattern this
register may inherit.

### 🚨 The merge is already in the best of the three lists, and it makes §8 unimplementable as-is

Measured against [landing PR #480]'s `const subprocessors` on branch `163-article-28-dpa` — the
**most** carefully derived list we have:

| annex row | functions merged into it |
|---|---|
| `Cloudflare, Inc.` | *"CDN, DDoS protection, DNS and TLS termination … **and inbound routing of mail sent to our published contact addresses**"* — **two** |
| `Google LLC` | *"Delivery of mail … including data subject requests … **Also an identity provider, but only for users who choose Google sign-in**"* — **two**, and they have different scopes |

The Google row is the one that proves the point mechanically rather than editorially. Mail delivery is
`processor`: unconditional, every data subject, whether or not they ever touch Google. Identity
provision is `conditional`: only users who choose it. **A single row cannot carry two `scope` values**,
so D5's scope-derived rendering (§8) cannot be built on top of these rows — the split is not a
refinement of the annex, it is a **precondition** for the mechanism.

⚠️ **This is not a defect in [landing PR #480].** Prose can qualify inside a sentence, and that annex
does it carefully and accurately. It is a defect in *prose as the storage format*: the qualification
is legible to a reader and invisible to a renderer, so the moment three pages derive from it, the
merged row has to pick one scope and it will pick the wrong one for somebody. **Move the array (D1),
then split the rows (D2), then render (D5) — in that order, because the second step is what makes the
third possible.**

## 6. D3 — Derivation is a field, not a comment

Every entry carries **`derivation`**: how its `location` was established, in a form someone can re-run.
A RIPE RDAP query, `SMTP_HOST` in the running container, an observed response header — whatever it was.

**Rationale, measured**: `/privacy` and `/trust` asserted *"Greece, EU"* for the off-site backup host
— the claim carrying *"our backups stay in the EU"* — and **nothing on file derived it**. The guard
that appeared to cover it asserted only that the string `Aweb` appeared, and its stated derivation was
a grep for `REMOTE=`, which evidences the destination and not the jurisdiction ([landing PR #480]).

⚠️ **A field that may be empty is a field that will be empty.** `derivation` is required and non-empty;
G2 enforces it. Where evidence does not exist, the correct entry is a narrower claim, not a blank
derivation — `/dpa`'s three deliberate omissions (no city for Pointer, no AWS region, no legal
characterisation of Pointer) are the model.

## 7. D4 — Lifecycle, and the invariant that makes 30 days keepable

Every entry carries `status`, `announcedOn`, `processingSince` and `effectiveFrom`.

| field | meaning |
|---|---|
| `announcedOn` | the date **we published** this entry |
| `processingSince` | the date this recipient **actually began** performing this function. A fact, and `derivation` must evidence it |
| `effectiveFrom` | the date a notice **said** processing would begin. Equal to `processingSince` where no notice preceded it |

| status | meaning |
|---|---|
| `announced` | published, **not yet processing**. `processingSince` is null and `effectiveFrom` is in the future |
| `active` | processing today |
| `withdrawn` | no longer processing; retained with `withdrawnOn` so the change log is derivable |

🚨 **`processingSince` and `effectiveFrom` are separate fields because they are separate facts, and the
first version of this spec conflated them.** §2a is why: the analytics beacon has been processing since
2026-04-14 and is being disclosed on 2026-09-04. With one date, that entry cannot be written down
truthfully at all — and the two available workarounds are both explicitly forbidden three paragraphs
below. **A register that can only describe changes it was told about in advance is a register that
cannot record the ones it exists to catch.**

**The invariant, in two halves — both derived from the dates, neither reachable by a flag:**

> **G3a — prospective notice.** For every entry where `processingSince > announcedOn` (we announced
> first, then processing began): **`processingSince - announcedOn >= 30 days`**, and
> `processingSince >= effectiveFrom`.
>
> **G3b — no silent starts after the epoch.** The count of entries where
> `processingSince >= REGISTER_EPOCH` **and** `processingSince <= announcedOn` is **zero**.

G3a is the promise: we said it 30 days before it happened. G3b is the promise having teeth: after the
epoch, nothing may **begin** processing without prior notice, and an entry that did is a test failure
rather than an embarrassment.

An entry where `processingSince <= announcedOn` and `processingSince < REGISTER_EPOCH` is a
**retrospective disclosure** — legitimate, and the only shape available for something already running
when the register was built. The beacon is one. It fails neither half, because it is not a claim that
notice was given; it is a record that it was not.

🚨 **The consequence is a constraint on deploy order, not on copy, and it is the whole point.**
A recipient may not begin processing before its `effectiveFrom`. So **the register must be
publishable ahead of the change.** Today the `/trust` change log is *retrospective* — its only entry
reads *"this list was corrected … we are recording it now rather than quietly editing the table."*
That is a **disclosure**. A 30-day advance notice is a different object, and no artifact we have can
hold one.

⚠️ **`REGISTER_EPOCH` exists so the guard is neither retroactively broken nor retroactively
satisfiable, and it is keyed on `processingSince`, not on `announcedOn`.** That distinction is the
whole correction: keying the exemption on the *announcement* date makes the guard fire on any honest
late disclosure — including the beacon, whose announcement is necessarily after the epoch — while
keying it on the *processing* date asks the question that matters, which is *when did data start
flowing.* Everything already running when the register was built has `processingSince` before the
epoch and is exempt; anything that starts after it is not, no matter when we get around to saying so.

**There is deliberately no per-entry exemption flag** — an opt-out field is a field that gets set. The
only way to evade the invariant is to backdate `processingSince`, which is a false statement in a file
whose entire purpose is derivation, and which `derivation` must evidence against a commit, a header or
a config value.
*(This is `PRODUCT_RULES` §13's date-floor lesson from [core#735], applied before it bites.)*

⚠️ **`processingSince` is required and non-empty on every `active` and `withdrawn` entry**, for the
same reason `derivation` is (§6): a field that may be empty is a field that will be empty, and an empty
`processingSince` makes both halves of the invariant unevaluable while reading as compliant. G2 covers
it.

## 8. D5 — Each surface renders a *derived* subset

Entries carry `scope`, and each page renders the set its scope selects. **No page holds a hand-listed
set.**

| scope | meaning | rendered on |
|---|---|---|
| `processor` | processes customer personal data in the ordinary course | `/privacy`, `/trust`, `/dpa` |
| `conditional` | only when the customer opts in (OAuth identity providers) | `/privacy`, `/dpa`, marked conditional |
| `disclosure-only` | a recipient that is not a sub-processor (law enforcement) | `/privacy` only |

**This is what makes `/privacy`'s cross-reference sentence checkable.** Today it asserts two lists are
the same when they are two different scopes; once the scopes are explicit, either the sentence becomes
true or its inaccuracy becomes visible to a test. **Which of those happens is Growth's call, not this
spec's.**

## 9. D6 — The trigger: the change must be detected where it happens

`CLAUDE.md` already names the change classes — host · country · OS · reverse proxy · database version ·
SMTP provider · backup destination or retention · anything that gains access to the production
database. **They are remembered, not enforced.** Six weeks of a wrong hosting provider on two legal
pages is what remembering produces ([landing#343]).

🚨 **Those change classes are not the only ones, and the first revision of this spec said they were.**
§2a is the counter-example: the analytics beacon is a `<script src>` in
`datanika-landing/src/layouts/Layout.astro`. It is not a host, a country, an OS, a reverse proxy, a
database version, an SMTP provider, a backup target or anything with production-database access — so
it appears on **no** trigger list, and a guard enumerating core artifacts could not have named it if it
ran every day for five months. **It did not ship undetected because a rule was ignored; it shipped
undetected because there was no rule that covered it.**

So the trigger has **two** sources, one per repo, and each lives where its class of change happens.

### D6a — the infrastructure trigger, in `datanika-core`

1. **`datanika-core/deploy/SUBPROCESSORS.md`** — a declaration of the external recipients this
   deployment uses, and, for each source-derived candidate that is **not** one, a one-line reason.
2. **A source-derived guard** (`tests/test_deploy/`) enumerating candidates from the artifacts that
   name them — `docker-compose.yml` `image:` entries, `deploy/server/backup-offsite.sh`'s remote,
   `.env.docker` keys matching the mail/webhook/API-key shapes, `.github/workflows/**` `uses:` — and
   failing when a candidate appears in neither list.

🚨 **The exclusion list is required, and it is what makes the guard survive.** Most candidates are not
sub-processors (`postgres` is software we run, not a recipient). A guard with no place to record *"not
one, because…"* gets weakened until it stops firing. This is the allowlist shape from
`SPEC_PII_SEPARATION` §8a, for the same reason.

### D6b — the browser trigger, in `datanika-landing`

A recipient the **visitor's browser contacts** is a recipient, and it is added by editing a template
rather than by changing a server. Landing already builds `dist/` in CI, so the candidate source is
there:

**Every external origin the built site causes a browser to contact** — `<script src>`,
`<link rel="stylesheet" href>`, `<link rel="preconnect|dns-prefetch">`, `<img|iframe|source|video|
audio src>`, `@font-face` `url()`, and any `fetch`/`connect-src` origin — must be either a register
entry or in a landing-side exclusion list with a one-line reason.

🔑 **The discriminating property is "the browser contacts it on load", not "the string is an external
URL", and the difference is the whole feasibility of this guard.** Measured on `origin/dev`,
2026-09-04:

| candidate set | count |
|---|---|
| distinct external origins appearing anywhere in `src/` | **~40** — almost all `<a href>` in docs prose: Fivetran, dlthub, GitHub docs, PyPI |
| external origins loaded as **subresources** | **2**, both in `src/layouts/Layout.astro` |

An anchor is not a data flow — a reader who never clicks sends nothing. Enumerate all forty and the
guard is an unmaintainable list of documentation links that will be weakened until it stops firing
(§9's own warning about the exclusion list, arriving one step earlier). Enumerate the two and the
guard is complete, cheap, and has one exclusion:

| origin | disposition |
|---|---|
| `static.cloudflareinsights.com` | **register entry** — `(Cloudflare, Inc., web analytics)`, §2a |
| `plausible.datanika.io` | **excluded**: our own subdomain, self-hosted on Aweb, which is already a register entry for hosting. Not a third party |

⚠️ **Assert it against the built output, not against `src/`.** A component can compose a URL, and
Astro can inline or rewrite one; `dist/` is what the browser actually receives. This is the same
reason [landing#388]'s conversion-label check asserts on `dist/` rather than on the variable being set.

**This guard would have named `ab71c35` on 2026-04-14**, which is the only claim worth making for it.

**The bridge between repos is the failure message, and it is one-directional.** A cross-repo assertion
is not buildable cheaply here — separate CI, and one repo is public while the founder queue is not.
So the core guard's failure text must carry the whole obligation:

> *`<name>` is a new external recipient. Before this can ship: add it to
> `datanika-landing/src/data/subprocessors.ts` with `status: "announced"` and an `effectiveFrom` at
> least 30 days out, land that first, and do not deploy this change until that date. If it is not a
> sub-processor, record it in `deploy/SUBPROCESSORS.md` with the reason.*

⚠️ **Residual risk, stated rather than papered over:** the core-to-landing hop is manual. What changes
is that it is now triggered by **a red test at the moment of the change**, instead of by someone
recalling a list in `CLAUDE.md`. That is the improvement being claimed; it is not a closed loop, and
nobody should describe it as one.

## 10. D7 — The notice channel, and what is deliberately deferred

Three things are separable, and conflating them is what makes this look bigger than it is:

- **The register** (D1–D5) — the thing that changes. Needed now.
- **The publication** — the register rendered, plus a change log derived from `announcedOn`. Needed
  now; it is what *"we post changes here"* would rest on under option (B).
- **The addressable audience** — pushing a notice to identified customers. **Not now.**

`subscriptions` holds **0 rows**. There is no audience to push to, and building a delivery mechanism
for an empty set is how you get a mechanism nobody has ever seen work. When there is a paying
customer, the audience is a query cloud can already answer.

⚠️ **That is a blocked item, not a task** — per `CLAUDE.md`'s no-conditional-tasks rule it goes on an
issue annotated **"Blocked by: first paying subscription"**, and must not appear in any routing
message. It is named here so the deferral is a decision on the record rather than an omission.

---

## 11. Guards

| # | assertion | where |
|---|---|---|
| **G1** | Each surface's rendered set equals the `scope` selection from the register, **matched on the `(recipient, function)` pair — never on the recipient name alone**. No page holds a literal list | landing tests |
| **G2** | Every entry has a non-empty `derivation` and `announcedOn`; every `active`/`withdrawn` entry also has a non-empty `processingSince` | landing tests |
| **G3a** | Prospective notice: where `processingSince > announcedOn`, `processingSince - announcedOn >= 30 days` and `processingSince >= effectiveFrom` | landing tests |
| **G3b** | No silent starts: **zero** entries with `processingSince >= REGISTER_EPOCH` and `processingSince <= announcedOn` | landing tests |
| **G4** | No two entries share a `(recipient, function)` key; a recipient with two functions has two entries | landing tests |
| **G5a** | Every core-derived candidate is either declared or excluded-with-a-reason | `datanika-core/tests/test_deploy/` |
| **G5b** | Every external **subresource** origin in landing's built `dist/` is a register entry or excluded-with-a-reason | landing tests |

🚨 **G1's matching rule is not a detail — it is the correction §2a forced, and getting it wrong makes
the guard silently useless in exactly the case the register was built for.** A recipient with two
functions supplies its own name to the assertion: delete `(Cloudflare, Inc., web analytics)` from the
register and a name-matched test still finds *"Cloudflare, Inc."* in every rendered list region,
because the edge-delivery entry is still there. **Green, on the deletion of a sub-processor entry.**
This is [landing PR #480]'s Resend defect one level up, and the fix that worked there — scope to the
list region — does nothing here, because the duplicate is inside the region and is legitimate.

**So each surface must render something that distinguishes the function** (they already do: `/privacy`
renders a purpose in each `<li>`, `/trust` a purpose cell in each `<tr>`), and G1 must match on the
pair.

🚨 **Anti-vacuity is part of the contract, not a nicety.** Each guard ships with a proof it can fail,
and the proof must be a mutation of **the real artifact**, not a synthetic fixture:

- **G1** — delete one entry from the register; every surface that should render it goes red. ⚠️ Scope
  the assertion to the **rendered list region**, never to the page. [landing PR #480] measured exactly
  this: deleting the Resend row from Annex III left the suite **green**, because *"Resend"* appears
  five more times in prose. A document whose operative list had lost an entry read as correct.
  🚨 **The entry you delete must be the second entry of a recipient that has two** — `(Cloudflare,
  Inc., web analytics)` is the one to use. Deleting a sole-entry recipient goes red for the wrong
  reason (its name vanishes from the page) and proves nothing about the function dimension, which is
  the dimension this register exists for. A G1 proven only against a sole-entry recipient is a guard
  that has never been tested on the case it was written to catch.
- **G3a** — a synthetic entry with `announcedOn = today` and `processingSince = today + 29` must go
  red; at `+30` it must go green. **Both directions**, or the guard is pinned to a constant.
- **G3b** — a synthetic entry with `processingSince = REGISTER_EPOCH + 1 day` and
  `announcedOn = processingSince + 1 day` must go red. ⚠️ **And the beacon entry must be green in the
  same run** — same shape, `processingSince` before the epoch. A G3b that reds both is an
  epoch-blind date comparison wearing the right name, and it would forbid disclosing anything we
  discover late, which is the opposite of what it is for.
- **G5a** — add a fake image to `docker-compose.yml`; the test names it. Remove it; green.
- **G5b** — add `<script src="https://cdn.example.com/x.js">` to `Layout.astro`; the test names
  `cdn.example.com`. Remove it; green. ⚠️ Mutate the **real layout** and assert against the **built
  `dist/`** — a fixture HTML file proves the parser works and proves nothing about the site.

⚠️ **Prefer source-level assertions over runtime ones, and this is now an earned rule rather than a
preference.** In the [core#1009] work, 28 candidate sites produced **zero** reds under a runtime
mutation of the very release they were being tested against — *"green under N+1"* would have licensed
all of them, because a runtime check is green for every case nothing happens to exercise. A register
entry that no page currently renders is exactly that case.

⚠️ **A fixture fix does not always destroy a test; sometimes it hollows it.** In the same work one
site *was* a witness and **went vacuous rather than red**, because its assertion could succeed for
three reasons and only one was its subject. When any guard here is repaired, re-mutate and confirm it
goes red **for the stated reason**, not merely that it goes red.

---

## 12. Staging, mapped to the founder's two options

🆕 **(A) is decided — see the status block.** The columns below are kept because they record *why*
each stage is in scope, which is worth more than collapsing them now that only one column applies.

| stage | contents | required under |
|---|---|---|
| **0** | D1, D2, D3, D5 · G1, G2, G4. The register exists, the three surfaces agree, every claim carries its derivation. **Includes the `(Cloudflare, Inc., web analytics)` entry** (§2a) — the founder decided to disclose it, and it is a Stage 0 row, not a Stage 1 notice | **(A) and (B)** — `/trust` already publishes the promise, and the lists already disagree |
| **1** | D4, D6a, D6b · G3a, G3b, G5a, G5b. The 30-day invariant, `announced` status, the deploy-order constraint, both change triggers | **(A)**, which is the decided path |
| **2** | D7's addressable audience | neither, yet. **Blocked by: first paying subscription** |

⚠️ **The beacon entry is Stage 0 and does not wait for Stage 1**, and the distinction is the one §7
now draws: it is a **retrospective disclosure** of something already processing, not a notice of
something about to. Holding it until the 30-day machinery exists would delay a disclosure the founder
has already decided to make, in order to build a mechanism it does not use.

⚠️ **G5b belongs in Stage 1 by dependency, not by importance.** It is the cheapest guard in this spec
(two candidates, one exclusion — §9) and it is the only one that would have caught the beacon. If
Stage 1 slips, pull G5b forward on its own; it needs nothing from D4.

## 13. Out of scope, deliberately

- **All published wording.** Including `/privacy` §4's cross-reference sentence and the Google/GitHub
  role descriptions in §2. Those are Growth's surface and, on `/dpa`, the founder's. This spec makes
  them *checkable*; it does not write them.
- **The Georgia establishment question** ([landing PR #480] item 1) and **the §10 audit clause**
  (item 3). Neither is a mechanism question and neither is Product's.
- **Whether pointer.gr is characterised as a processor** ([cloud#128]). Unanswerable without an email
  from a real identity; the register records the factual relationship and stops, as `/dpa` already does.
- **Run-log retention** ([core#1000]). A different contract and a different rule — see [core#676].

## 14. Acceptance criteria

🚨 **Every criterion below is stated so that the beacon case satisfies or fails it explicitly.** That
is the point of this revision: the first version's criteria were all satisfiable by a register that
could not represent the first change it received.

1. `src/data/subprocessors.ts` exists and is the **only** place any surface reads a sub-processor list
   from. The rendered list regions are produced by iterating the register — a **structural** property,
   asserted as such. ⚠️ **Not** by searching for hard-coded recipient names: with two Cloudflare
   entries, a hand-written Cloudflare row inside a list region is indistinguishable by name from the
   legitimate rendering of the other one.
2. Every entry has a non-empty `derivation` that a reader can re-run, and every `active`/`withdrawn`
   entry has a non-empty `processingSince` its `derivation` evidences.
3. `/privacy`, `/trust` and `/dpa` each render a set **derived from `scope`**, matched on the
   `(recipient, function)` pair. **Proven red by deleting `(Cloudflare, Inc., web analytics)`** — a
   recipient that still has another entry — with the assertion scoped to the list region. A proof run
   only against a sole-entry recipient does not satisfy this criterion.
4. An entry may be `announced` with a future `effectiveFrom`; **G3a** is proven red at +29 and green at
   +30, and **G3b** is proven red on a post-epoch silent start **while the beacon entry stays green in
   the same run**.
5. `datanika-core` fails a test when a new external recipient appears in compose, the backup script,
   the deploy env or a workflow and is in neither list, and the message carries the full obligation
   from D6.
6. **`datanika-landing` fails a test when the built `dist/` loads a subresource from an external
   origin that is neither a register entry nor excluded with a reason.** Proven red by adding a fake
   `<script src>` to the real `Layout.astro`. Today the passing state is exactly two origins: the
   beacon (entry) and `plausible.datanika.io` (excluded, self-hosted on Aweb).
7. **The beacon is in the register**, as `(Cloudflare, Inc., web analytics)`, `status: "active"`,
   `processingSince: 2026-04-14` derived from `ab71c35`, and it renders on every surface its `scope`
   selects. **The Cloudflare recipient count on each published page does not change** — the pages gain
   a function, not a party — and a test that asserts otherwise is asserting the wrong thing.
8. No page's legal wording is changed by the work implementing this spec. If a sentence becomes
   untrue once the scopes are explicit, that is **filed**, not fixed in the same PR. ⚠️ The beacon's
   own published wording is **Growth's**, and it is being written separately; this spec requires only
   that the entry exists, is derived, and is rendered.

[core#676]: https://github.com/datanika-io/datanika-core/issues/676
[core#735]: https://github.com/datanika-io/datanika-core/issues/735
[core#1000]: https://github.com/datanika-io/datanika-core/issues/1000
[core#1009]: https://github.com/datanika-io/datanika-core/issues/1009
[cloud#128]: https://github.com/datanika-io/datanika-cloud/issues/128
[cloud#163]: https://github.com/datanika-io/datanika-cloud/issues/163
[landing#343]: https://github.com/datanika-io/datanika-landing/issues/343
[landing#373]: https://github.com/datanika-io/datanika-landing/issues/373
[landing#388]: https://github.com/datanika-io/datanika-landing/issues/388
[landing PR #480]: https://github.com/datanika-io/datanika-landing/pull/480
