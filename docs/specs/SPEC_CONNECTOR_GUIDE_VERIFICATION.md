# Spec — What a *verified* connector guide is

> **Author**: Product, 2026-09-10 · **Status**: contract
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
| `false` | `draft-pending-verification` | **published, not walked.** The content passed editorial review; nobody has driven it. **Legitimate.** |
| `false` | a named verifier + date + README | published and walked. |

**Publishing asserts the content is right; it does not assert anyone drove it.** The bar for
`draft: false` is editorial review plus the CI guards in §2.1 — which is a real bar, and it is why a
published-but-unverified guide is not a lie. The field is not rendered to readers, so no reader is
ever shown a verification claim either way.

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

🚨 **The guard that must NOT be written** is the one Growth already declined: anything that forces
`verified_date` to track the file's last edit. It makes the cheapest path to green a date bump, which
asserts a verification that did not happen. **The field must be expensive to set and cheap to leave
null** — that asymmetry is the whole design.
