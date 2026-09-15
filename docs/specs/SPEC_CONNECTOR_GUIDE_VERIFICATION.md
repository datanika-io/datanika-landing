# Spec — What a *verified* connector guide is

> **Author**: Product, 2026-09-10 · **Status**: contract
> **Amended**: 2026-09-11 (§2.3, `verification-blocked`) · 2026-09-15 (§2.4, where a walk may happen)
> **Answers**: the question left unowned when Growth measured `verified_date` staleness at 34/37 and
> correctly declined to "fix" it by bumping dates.

---

## 0. The question, and why it is a contract question rather than a cleanup

`src/content.config.ts` declares `verified_by` and `verified_date` on all 37 connector guides.
Growth's comment at that declaration diagnoses the field precisely — it *"records WHEN SOMEONE FIRST
LOOKED"*, it is not rendered to any reader, and it goes stale **through diligence**, because every
correct fix edits the guide body and leaves the field alone.

All of that is right. What none of it can settle is the question underneath: **34 of 37 cannot be
judged without a rule for what the field is supposed to assert.** A staleness count is a defect count
only if you already know what "verified" means. Nobody had written that down, so this does.

---

## 1. The measurement that reframes the problem

Re-derived on `origin/dev` (`f8554cb`), by content:

| | |
|---|---|
| connector guides | **37** |
| carrying a non-null `verified_date` | **36** |
| carrying a **first-run** screenshot (the artifact proving data landed) | **8** |
| of those 8, how many are dated | **8 of 8** |
| dated but with **no** first-run artifact | **28** |
| carrying a README provenance record | **35** |
| carrying an add-connection screenshot | **36** |

🔑 **The staleness is the less interesting half. The field is set on 36 of 37 guides — it
distinguishes almost nothing.** A property true of every item in a corpus carries no information
about any item. And the eight guides with real evidence of a walk are a **strict subset** of the
dated ones, which is what you would expect if the date is filled in *when the guide is authored*
rather than when it is verified.

So the honest reading is not *"34 guides have decayed"*. It is: **the field marks that a guide
exists, and it has been read as marking that a guide was checked.**

⚠️ **This does NOT establish that those 28 were never walked.** Absence of a screenshot is not
evidence of absence of a verification — some may have been checked by someone who captured nothing.
What it establishes is that **for 28 guides the assertion has no surviving evidence**, which is a
different and smaller claim, and the only one the data supports.

---

## 2. The contract

> **A connector guide is *verified* when a named person has followed it against a running Datanika,
> created a real connection to that source, completed a run, and recorded what they saw.**

Nothing else. In particular:

- **The evidence is the record, not the date.** `public/docs/connectors/<slug>/README.md` is the
  provenance artifact — it names the org, the run, what was on screen, and anything the walk exposed.
  `verified_date` is a **pointer to** that record. A date with no record behind it asserts a
  verification nobody can inspect.
- **`verified_by` names who or what did the walk**, and `draft-pending-verification` means no one has.
  That is an honest state, not a defect.

### 2.1 What is explicitly NOT part of "verified", and why folding it in would be worse

Every check below is already automated, and **none of them may be counted as part of a human
verification**:

| check | guard |
|---|---|
| documented config fields exist in the product | `scripts/check-config-field-parity.py` |
| navigation instructions reference real UI | `tests/phantom-nav-instructions.test.ts` |
| screenshots are present for the corpus | `tests/connector-screenshot-coverage.test.ts` |
| the connector is actually offered | `tests/connector-availability.test.ts`, `tests/connectors.test.ts` |
| counts in prose match the corpus | `tests/connector-count-prose.test.ts`, `connector-count-dist.test.ts` |

🚨 **A human check that duplicates a CI check is worse than no check at all.** It costs the same and
it makes the field appear to cover ground that a machine already covers better and continuously —
so a reader seeing a recent date infers field parity was confirmed, when parity is confirmed on
*every commit* and the date says nothing about it. **`verified` is the residue: the part no test can
reach, because it needs real credentials and a real run.**

This also fixes the decay problem Growth identified. Defined as the residue, the field **does not go
stale when the guide's prose is edited** — a copy fix changes nothing about whether someone once
completed a run. It goes stale only when *the product's connection flow for that source* changes,
which is a much rarer event and a judgeable one.

### 2.2 Publication and verification are independent axes

Both are legitimate; they answer different questions.

| `draft` | `verified_by` | means |
|---|---|---|
| `true` | anything | not published. No claim to any reader. |
| `false` | `draft-pending-verification` | **published, reachable, not yet walked.** The content passed editorial review; nobody has driven it *yet*. **Legitimate** — this is the queue. |
| `false` | `verification-blocked` | **published, and NOT walkable at all** until a named blocker lifts. Not the queue. |
| `false` | a named verifier + date + README | published and walked. |

### 2.3 · 🆕 `verification-blocked` — added 2026-09-11, because one value was meaning two things

**Growth's finding, on [landing#395], from doing the work rather than from review.** `s3` and
`openapi` both sat at `draft-pending-verification` and were indistinguishable on a board, while being
in genuinely different states:

- **`openapi`** is *not yet* walked — and is the **cheapest capture in the corpus** (an OpenAPI spec
  needs no vendor account). It is the queue, and `draft-pending-verification` describes it exactly.
- **`s3`** is *not walkable*. Core withdrew the connector ([core#863]), so a connection **cannot be
  created**; the guide carries a reader-facing *"Temporarily unavailable"* notice and stays published
  deliberately, per `tests/connector-availability.test.ts`. Calling that "pending" says a verification
  is coming, and none is until the connector returns.

🔑 **The rule for what earns a value, so this vocabulary does not grow a fourth member next month:
the field encodes REACHABILITY, because reachability is what the denominator turns on.** §5 reports
`evidenced / reachable` (today **8 / 30**), so `verified_by` has to answer exactly the question the
metric asks and nothing else.

⚠️ **A blocker's *kind* is a reason, and reasons live in the README** — §2's contract already says the
field is a pointer and `public/docs/connectors/<slug>/README.md` is the record. A paid-warehouse
blocker and a withdrawn-connector blocker are both `verification-blocked`; putting that distinction in
the field starts a taxonomy that needs a new member the first time someone is blocked a new way.

🚨 **`verification-blocked` is only valid with a README that names the blocker AND what would lift
it.** Without that it becomes a dumping ground, indistinguishable from neglect — which is precisely
how `verified_date` stopped meaning anything. **Expensive to set, cheap to leave pending**: the same
asymmetry §6 protects for the date.

**And it carries its own un-defer trigger, which must have a reader** (the [core#735] lesson): `s3`
moves `verification-blocked` → `draft-pending-verification` **when [core#863] closes**, and the
denominator goes 30 → 31 in the same change. That trigger has a reader because someone must close
#863. A blocker whose lifting nothing would notice should be said to be indefinite, in those words.

⚠️ **§6's witness table extends with it.** That table asserts *positively* that a
`draft: false` + `draft-pending-verification` guide is **not** flagged, so a later tidy-up cannot
quietly make it an error. **`verification-blocked` needs the same positive assertion**, or the first
cleanup pass "fixes" the new value back into the old one.

**Publishing asserts the content is right; it does not assert anyone drove it.** The bar for
`draft: false` is editorial review plus the CI guards in §2.1 — which is a real bar, and it is why a
published-but-unverified guide is not a lie. The field is not rendered to readers, so no reader is
ever shown a verification claim either way.

### 2.4 · 🆕 Where the walk happens — decided 2026-09-15

**The question** (raised on [landing#395], 2026-09-11): does a walk against a **local stack** count,
or only a real `app.datanika.io` session — which is what every existing README records?

> **Decision: a local stack counts, on the same footing as production — when it runs the revision
> production serves, configured for the deployment the guide step addresses, and the README records
> both.** Production walks stay valid and the recorded ones stand as they are. **`verified_by` does
> not change**: where a walk happened moves no guide in or out of the denominator, so under §2.3's
> rule it is a *reason*, and reasons live in the README.

#### Why

1. **The contract never named production.** §2 says *"against a running Datanika"*. What the field
   asserts is the residue no CI check reaches — a real connection, a real run, rows in the
   destination — and those are properties of the **code and configuration that ran**, not of the
   hostname that served them.
2. **A production-only rule makes Tier 1 unwalkable by construction.** Tier 1's premise, set on
   2026-09-10, is that `datanika-examples` puts MySQL, MSSQL and MongoDB a `docker compose up` away.
   Those containers are reachable from a stack on the same machine and **not from the production
   host**. A production-only convention would contradict the tiering it exists to serve.
3. **The production precedent never exercised what only production can.** The first-run captures on
   record read a demo database inside production's own Postgres container, files sent through the
   upload widget, or public vendor APIs. None exercised the egress-IP allowlisting a customer's
   database may sit behind. *"Captured from a real `app.datanika.io` session"* records where a walk
   happened — not a property the verification depended on.
4. **A production capture is a production mutation**: connections, uploads and runs in a shared org
   with a finite connection quota, and a vendor credential typed into production. A local stack
   produces the same evidence with none of that.

#### What a local stack can get wrong, and the condition that closes each

| difference | how it would manufacture a verification | condition |
|---|---|---|
| **revision** | a stack built from unpromoted code walks a flow no user has. The 2026-08-31 capture had to establish that the Data preview was on `master` and not only on `dev` before relying on it | build **core and cloud from `origin/master`** — or show, when the verification is recorded, that the walked SHA is an ancestor of it (`git merge-base --is-ancestor <sha> origin/master`, after a fresh fetch). Record the SHAs |
| **configuration** | a setting that changes connector behaviour can default permissively in code: a stock stack saves a local-file-path connection that production refuses at save (core's `SPEC_LOCAL_FILE_CONNECTIONS` D4) | configure the stack **for the deployment the step addresses** — for a Datanika Cloud step, the settings core's `deploy/server/export-prod-settings.sh` grades, at the values it requires; for a step the guide itself scopes to self-hosting (the `sqlite` guide, DuckDB as a destination, the directory-watcher branches of `json` and `parquet`), stock self-hosted defaults. Record which |
| **network** | a local stack reaches a source from the walker's machine, not from Datanika Cloud's egress | a prerequisite only Cloud's network can exercise — allowlisting Datanika's egress IPs — is recorded as **not exercised**. It does not withhold the verification: no walk on record exercised it either |
| **edition** | quotas and billing differ between editions | build the **cloud** edition (the default of core's `scripts/build-from-worktree.sh`) and record it. No guide step depends on a plan limit today; the record keeps that checkable if one ever does |

#### What the README records

In addition to what §2 already requires — who walked it, when, the connection and the run, and the
rows that landed, checked **in the destination**:

| field | production walk | local-stack walk |
|---|---|---|
| **Environment** | `app.datanika.io` | `local stack` |
| **Core revision** | the `master` SHA serving at the time | the SHA built, and the ancestor check's result |
| **Cloud revision** | as above | the SHA built, or `core edition` |
| **Configuration** | `production` | `production-graded` or `self-hosted defaults`, plus any deviation |
| **Guide revision** | the landing commit whose text was followed | the same |
| **Not exercised** | any step the walk could not reach | the same, including egress-IP allowlisting |

Records written before this section are **not** re-opened for the fields they lack (§4: the rule is
forward-facing).

⚠️ **A local-stack screenshot is publishable.** Its caption and alt text must not name
`app.datanika.io`, and core's `docs/PRODUCT_RULES.md` §4 credential gate applies unchanged — a local
browser autofills a credential field exactly as it does against production.

#### What this makes moot, and what it does not

- **No tier needs production access to be captured.** Tier 1 cannot use it (point 2); Tier 2 needs a
  vendor credential, not a host; Tier 3 is decided. So no capture plan is blocked on a permission to
  read production, and none is blocked on the prod-verify org's connection quota.
- **It does not decide whether production may be read for any other purpose.** That question keeps
  its owner; it simply stops sitting on the path of guide work.

---

## 3. The `openapi` sign-off, resolved

`openapi` is `draft: false` with `verified_by: draft-pending-verification` and `verified_date: null`,
and Growth flagged it rather than changing it. Correct call, and under §2.2 **the combination is not
a defect** — it is the middle row of that table, stated honestly. Its date is `null`, so it is not
one of the stale 36; it is the one guide making no verification claim at all.

⚠️ **What *is* a defect is separate and belongs to [landing#395]:** `openapi` is the **only** guide
with no add-connection screenshot, and one of two with no README (`google-ads` is the other, and it
has both a date and a screenshot). It is also the **cheapest possible capture** — an OpenAPI spec
needs no vendor account — which makes it the obvious next one.

---

## 4. What to do about the 28

**Do not bump them.** Growth is right and this spec affirms it: bumping on a content edit trades a
stale record for a false one, and makes the cheapest path to green an assertion that nobody verified
anything.

**Do not mass-clear them either.** §1 establishes that the 28 lack *evidence*, not that they lack
*verification*, and clearing 28 dates on that inference would replace one unfounded claim with
another — in the opposite direction, and less reversibly.

**The rule is forward-facing:**

1. **`verified_date` may only be set in the same change that adds the evidence** — a README entry
   naming what was walked, and the first-run screenshot where the source permits one.
2. **A guide whose README records no walk should have `verified_date: null`**, and moving one from a
   date to `null` is a *correction*, not a regression. Say so in the commit.
3. **The reported number is the evidenced count, not the dated count.** Today that is **8 of 37**.

---

## 5. The metric that replaces "34 of 37 stale"

**Report `evidenced / total` — today `8 / 37`** — derived from the presence of a first-run artifact
plus a README verification section, never from the date field.

It is a smaller and much less flattering number than 36/37, and that is the point: it is the first
number in this corpus that has ever meant what its name says.

⚠️ **The denominator excludes `verification-blocked` guides, not merely "hard" ones.** A guide is out of `reachable` when its README names a blocker — never because capturing it looked expensive.

⚠️ **It has a known ceiling.** Some sources cannot be walked without a paid vendor account, so 37/37
is not a target and chasing it would push someone toward faking evidence. **A guide that cannot be
walked should say so in its README and keep `verified_date: null`** — an honest permanent null, which
is exactly the vocabulary [core#1170] established for the product itself: *refusing to guess is not a
failure, and it must not be recorded as one.*

---

## 6. The witness (`PRODUCT_RULES` §16)

Each claim above, and what asserts it:

| claim | entry point | witness |
|---|---|---|
| a dated guide has evidence behind it | the corpus, in CI | for every guide with non-null `verified_date`, its README exists and contains a verification section. ⚠️ **Anti-vacuity: assert the corpus is non-empty and that at least one guide is found in each state**, or the check passes on an empty glob |
| the evidenced count is what gets reported | the reporting script | the number is derived from artifacts, and **a guide with a date and no artifact does not raise it** |
| publication does not require verification | the schema | a `draft: false` + `draft-pending-verification` guide is **not** flagged — asserted positively so a later "tidy-up" cannot quietly make it an error |
| a walk says where it ran, and on what (§2.4) | the README of a guide whose `verified_date` is set after 2026-09-15 | it names **Environment**, **Core revision** and **Configuration**. ⚠️ **Not mechanised here**: CI in this repository cannot resolve a core SHA, so the ancestor check is made by whoever reviews the change that sets the date — for a guide leaving `draft-pending-verification`, that is QA's sign-off |

🚨 **The guard that must NOT be written** is the one Growth already declined: anything that forces
`verified_date` to track the file's last edit. It makes the cheapest path to green a date bump, which
asserts a verification that did not happen. **The field must be expensive to set and cheap to leave
null** — that asymmetry is the whole design.
