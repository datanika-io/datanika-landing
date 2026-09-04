# SPEC — Sub-processor register

> **Status**: contract, awaiting the founder's posture decision on [landing PR #480] §6.
> **Owner**: Product. **Consumers**: Growth (the three published surfaces), Engineering/Infra (the
> change trigger in `datanika-core`).
> **Origin**: [core#676] finding 4b, [cloud#163], [landing PR #480] item 2.
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

## 3. The framing the founder's decision actually needs

[landing PR #480] presents item 2 as *accept §6 as written, or soften it to "we will post changes
here."* **Softening §6 does not remove the commitment**, and the reason is measurable:

> `src/pages/trust.astro:347`, **live in production today**:
> *"We notify customers of subprocessor changes at least 30 days in advance."*

The DPA does not create that obligation. It makes an already-published one contractual. So the real
choice is:

- **(A) Build the mechanism** — §§4–10 below, Stage 0 + Stage 1.
- **(B) Soften `/dpa` §6 *and* `/trust`**, together, in one change. Stage 0 only.

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
(inbound mail delivery; optional identity provider) and so does GitHub. Each carries its own `scope`,
`purpose` and `dataCategories`.

**Rationale**: §2's finding. Merging functions lets the least-alarming one define the row, and the
merge is invisible in review because the row still reads as accurate.

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

Every entry carries `status`, `announcedOn` and `effectiveFrom`.

| status | meaning |
|---|---|
| `announced` | published, **not yet processing**. `effectiveFrom` is in the future |
| `active` | processing today |
| `withdrawn` | no longer processing; retained with `withdrawnOn` so the change log is derivable |

**The invariant:**

> For every entry whose `announcedOn` is on or after `REGISTER_EPOCH`:
> **`effectiveFrom - announcedOn >= 30 days`.**

🚨 **The consequence is a constraint on deploy order, not on copy, and it is the whole point.**
A recipient may not begin processing before its `effectiveFrom`. So **the register must be
publishable ahead of the change.** Today the `/trust` change log is *retrospective* — its only entry
reads *"this list was corrected … we are recording it now rather than quietly editing the table."*
That is a **disclosure**. A 30-day advance notice is a different object, and no artifact we have can
hold one.

⚠️ **`REGISTER_EPOCH` exists so the guard is neither retroactively broken nor retroactively
satisfiable.** Existing entries predate any notice period; they are `active` with `announcedOn` set to
the date they were actually first disclosed (derivable from `/trust`'s change log) and are exempt by
the `>= EPOCH` clause. **There is deliberately no per-entry exemption flag** — an opt-out field is a
field that gets set. The only way to evade the invariant is to backdate `announcedOn`, which is a
false statement in a file whose entire purpose is derivation.
*(This is `PRODUCT_RULES` §13's date-floor lesson from [core#735], applied before it bites.)*

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

Those changes happen in **`datanika-core`**, not in landing. So the trigger lives there:

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
| **G1** | Each surface's rendered set equals the `scope` selection from the register. No page holds a literal list | landing tests |
| **G2** | Every entry has a non-empty `derivation`, `announcedOn` and `effectiveFrom` | landing tests |
| **G3** | The 30-day invariant (D4), applied only to entries with `announcedOn >= REGISTER_EPOCH` | landing tests |
| **G4** | No two entries share a `(recipient, function)` key; a recipient with two functions has two entries | landing tests |
| **G5** | Every source-derived candidate is either declared or excluded-with-a-reason | `datanika-core/tests/test_deploy/` |

🚨 **Anti-vacuity is part of the contract, not a nicety.** Each guard ships with a proof it can fail,
and the proof must be a mutation of **the real artifact**, not a synthetic fixture:

- **G1** — delete one entry from the register; every surface that should render it goes red. ⚠️ Scope
  the assertion to the **rendered list region**, never to the page. [landing PR #480] measured exactly
  this: deleting the Resend row from Annex III left the suite **green**, because *"Resend"* appears
  five more times in prose. A document whose operative list had lost an entry read as correct.
- **G3** — a synthetic entry with `announcedOn = today` and `effectiveFrom = today + 29` must go red;
  at `+30` it must go green. **Both directions**, or the guard is pinned to a constant.
- **G5** — add a fake image to `docker-compose.yml`; the test names it. Remove it; green.

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

| stage | contents | required under |
|---|---|---|
| **0** | D1, D2, D3, D5 · G1, G2, G4. The register exists, the three surfaces agree, every claim carries its derivation | **(A) and (B)** — `/trust` already publishes the promise, and the lists already disagree |
| **1** | D4, D6 · G3, G5. The 30-day invariant, `announced` status, the deploy-order constraint, the core trigger | **(A) only** |
| **2** | D7's addressable audience | neither, yet. **Blocked by: first paying subscription** |

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

1. `src/data/subprocessors.ts` exists and is the **only** place any surface reads a sub-processor list
   from. A search for a hard-coded recipient name outside that file and its tests returns nothing in
   the rendered list regions.
2. Every entry has a non-empty `derivation` that a reader can re-run.
3. `/privacy`, `/trust` and `/dpa` each render a set **derived from `scope`**. Deleting one entry goes
   red on every surface that should have shown it, with the assertion scoped to the list region.
4. Under option (A) only: an entry may be `announced` with a future `effectiveFrom`, the 30-day
   invariant holds against `REGISTER_EPOCH`, and it is proven red at +29 and green at +30.
5. Under option (A) only: `datanika-core` fails a test when a new external recipient appears in
   compose, the backup script, the deploy env or a workflow and is in neither list, and the message
   carries the full obligation from D6.
6. No page's legal wording is changed by the work implementing this spec. If a sentence becomes
   untrue once the scopes are explicit, that is **filed**, not fixed in the same PR.

[core#676]: https://github.com/datanika-io/datanika-core/issues/676
[core#735]: https://github.com/datanika-io/datanika-core/issues/735
[core#1000]: https://github.com/datanika-io/datanika-core/issues/1000
[core#1009]: https://github.com/datanika-io/datanika-core/issues/1009
[cloud#128]: https://github.com/datanika-io/datanika-cloud/issues/128
[cloud#163]: https://github.com/datanika-io/datanika-cloud/issues/163
[landing#343]: https://github.com/datanika-io/datanika-landing/issues/343
[landing#373]: https://github.com/datanika-io/datanika-landing/issues/373
[landing PR #480]: https://github.com/datanika-io/datanika-landing/pull/480
