# SPEC — What a connector guide may say about Test Connection

**Status**: decided (Product, 2026-09-04). Contract for [landing#502].
**Scope**: `src/content/connectors/*.md` — all 36 guides. Consumers: Growth (copy), QA (guard).
**Source of truth**: `datanika-core` `datanika/services/connection_service.py`,
`ConnectionService.test_connection_verdict` on `origin/dev`. Re-derive from that function, never
from this page's group lists — the lists are a snapshot, the dispatch is the contract.

---

## 1. The defect, stated once

[landing#502] measured 22 live guides quoting **`Test not applicable for this type`** — a message
the product emits from **no code path**, on either branch. It survives only in two source comments
that describe the behaviour [core#821] removed.

The Kafka guide had the mirror-image defect: it claimed **Test Connection** *"checks
connectivity"* for a type that never opens a broker connection ([core#1054], [PR #499]).

🔑 **These are the same defect, and treating them as two is how one of them gets fixed and the
other does not.** In both cases *the page asserts a verdict the button does not produce.* One
under-claims, one over-claims; the direction is incidental. So the rule is not "remove a stale
string" — a find-and-replace satisfies that and leaves the class intact.

> **The rule.** A connector guide may describe Test Connection **only in terms of the verdicts the
> button can actually return for that type**, and it must name which of the three it is.

Three verdicts exist since [core#821] (`test_connection` returns `bool | None`):

| verdict | rendering | meaning |
|---|---|---|
| **pass** | green | a real check was made and it succeeded |
| **fail** | red | a real check was made and it failed |
| **not tested** | neutral — **neither** green nor red | no check was attempted, **and the reason is stated** |

`_test_saas_source`'s docstring is the authority on why the third state exists, and it should be
audible in the copy: *"Failure and 'not tested' are different answers and neither may be rendered
as the other: calling an unverifiable connection failed is the same class of lie, told in the
opposite direction."*

---

## 2. 🚨 The false premise to delete everywhere: *"it's an HTTP-API source"*

**Nineteen of the 22 pages explain the old message with some form of *"X is an HTTP-API source, so
Test Connection doesn't apply."* That premise is false, and it is false on both kinds of page.**

Fourteen HTTP-API sources **are** probed over HTTP, today, with a real authenticated request.
Being HTTP is not why a type is exempt; the exempt reasons are per-type and none of them is
"HTTP". Kafka's exemption is in fact the *opposite* — it is exempt **because it is not HTTP**.

So the sentence is not merely stale. It is a wrong general rule that would re-derive the wrong
answer for any connector added next. **Delete it; do not update it.** Replace it with the specific
reason, which for every exempt type is already written in `SAAS_PROBE_EXEMPT` and needs only to be
put in the page's voice.

---

## 3. The groups are derived, not listed

`test_connection_verdict` dispatches in this order. Read it top-down; the order is load-bearing
(file types are matched **before** the `_NON_DB_TYPES` check, which is why the old path became
unreachable for them in [core#493]).

```
1.  not config              -> (False, "Configuration is empty")
2.  MONGODB                 -> _test_mongodb          real auth: server_info()
3.  _FILE_TYPES             -> _test_file_source      real listing
4.  _NON_DB_TYPES           -> _test_saas_source
        SAAS_PROBE_EXEMPT   ->   (None, <per-type reason>)
        SAAS_PROBES         ->   real authenticated GET
5.  _LOCAL_FILE_DB_TYPES    -> _test_local_file_db     real open
6.  otherwise               -> _test_sql_connection    real SELECT 1
```

**The partition is exact and closed — verified, not assumed:**
`_NON_DB_TYPES` = 25 = 4 file + 14 probed + 6 exempt + 1 mongodb (dispatched earlier), with
**zero** types falling through to `_test_saas_source`'s "no probe exists" branch. That branch's own
comment says it is unreachable while `test_no_saas_type_is_undecided` holds; the arithmetic agrees.

**So the exempt count is knowable rather than guessable, and it is 6, not 4:**

```
SAAS_PROBE_EXEMPT = rest_api · openapi · google_sheets · google_analytics · google_ads · kafka
```

⚠️ **`openapi` is a shipping `ConnectionType` (`connection.py:48`) with no guide page and no entry
in `src/data/connectors.ts`** — measured: 36 guides, `openapi` absent from both. It is therefore
*out of scope here and not fixed by this work*; filed separately so the zero is recorded rather
than mistaken for coverage. `kafka` is already correct ([PR #499]). **4 exempt pages remain.**

---

## 4. Group A — 14 types with a real credential probe

`airtable · asana · facebook-ads · freshdesk · github · hubspot · jira · notion · pipedrive ·
salesforce · shopify · slack · stripe · zendesk`

**These 14 pages currently tell the reader a working button does not work.** This is the expensive
direction: a user who believes the button is inapplicable pastes a revoked token, skips the check
that would have caught it in two seconds, and discovers it on a pipeline run.

**What is true.** One cheap authenticated GET to the vendor's own API, from a guarded session,
with a 10 s timeout. `401`/`403` → *"<name> rejected these credentials (HTTP nnn)"*. Any other
`>= 400` → the status. Unreachable → *"Could not reach the <name> API"*. A missing required field
is named before any request is made.

**🚨 What must not be over-claimed — this is where the fix can become the Kafka defect arriving
from the other side.** The probe verifies the **credential**, not the **scope**. GitHub's probe
calls `/user`; Salesforce's calls `/limits`; Slack's calls `auth.test`. A token that passes can
still lack access to the specific repo, object or channel named on the *upload*. Green means *this
credential is live and accepted*, not *this pipeline will run*.

**Canonical block.** One per page, replacing every sentence that mentions the retired message.
Fill the three slots; keep the shape.

> **Test Connection really checks this credential.** Clicking it sends one authenticated request to
> the {Vendor} API ({endpoint in plain words}). A revoked, mistyped or suspended credential comes
> back **red**, naming the status {Vendor} returned — it is no longer styled as a pass. What it
> does not check is **scope**: a credential that passes here can still lack access to the specific
> {resource noun} you name on the upload, and that surfaces on the first run.

The inline step line — currently `Click **Test Connection** (an HTTP-API source returns *"…"*),
then **Create Connection**.` — becomes:

> `4. Click **Test Connection** — it really calls the {Vendor} API — then **Create Connection**.`

⚠️ **`shopify.md` and `stripe.md` carry a longer block naming a dated production observation**
(*"verified here against a deliberately invalid token on 2026-08-31"*). That observation was true
of the old build and is now history, not behaviour. **Rewrite those two to the canonical block and
do not carry the dated sentence forward** — a page is not the place to keep a changelog of its own
former defects. The historical account belongs in `/blog/green-tests-broken-connectors/`, where it
already lives and is correct.

---

## 5. Group B — file sources: one group, **two** answers, split on the location scheme

`s3 · csv · json · parquet` — really tested since [core#493].

**What is true.** `_test_file_source` lists the location for real:
`Connected — found files matching <glob>` · `Could not read <location> — check the path and its
permissions` (for `s3`, *"…the bucket URL, permissions and credentials"*) · or an explicit
empty-match message. **A wrong path is now red.**

**🚨 The split, and why the group cannot take one answer.** `_test_file_source`'s docstring says
it, and it is the single most load-bearing sentence in this spec:

> *"Test Connection runs in the **web** process; the extract runs in **celery**; the two share
> exactly two named volumes. For a *local* `bucket_url` the guarantee does not hold — same code,
> different container. It holds for `s3://` and other remote schemes, where the URL means the same
> thing in both containers."* ([core#979] AC5)

So a green on a **local** path does not transfer to the run, and a page that says "Test Connection
now really checks the path" *without that qualifier* has just committed the Kafka defect on a
freshly corrected page.

**The qualifier is a property of the location, not of the connector type.** `csv`, `json` and
`parquet` accept either a container path or an object-store prefix, so they need it conditionally.
`s3` is remote by definition and does **not** need it — and measurably does not have it today
(`s3.md` contains zero `worker`/`container` mentions, correctly).

**B-remote — `s3.md`, unqualified:**

> **Test Connection really lists the prefix now.** It builds the same listing the loader uses and
> reports what it found — so wrong keys, a bad bucket URL or a prefix that matches nothing come
> back **red** here rather than as a silent empty load. Because the bucket URL means the same thing
> to the web app and to the worker, a pass here transfers to the run.

**B-local — `csv.md`, `json.md`, `parquet.md`, qualified:**

> **Test Connection really lists the directory now** — it reports the files it matched, and a path
> that does not exist or matches nothing comes back **red** rather than passing silently.
> ⚠️ **If you gave a path inside the container rather than an object-store URL, read the green
> narrowly.** This button looks from the **web app**; the load reads from the **worker**. They are
> separate containers, and a directory mounted into only one of them tests green and then fails
> every run. The `docker exec datanika-celery ls …` check in Step 1 is the one that answers that
> question; this button cannot.

`json.md` and `parquet.md` already carry the *"mount into **both**"* instruction, and `sqlite.md`
/`duckdb.md` already carry this exact caveat in the same words — **they are the precedent, so copy
their phrasing rather than inventing a fourth wording.** `csv.md` has the weaker form (a trailing
note on a troubleshooting fix) and should be brought up to it.

### 5a. 🚨 `csv.md` has a second defect the string count does not reveal

`csv.md:115` states, as the **Cause** in Troubleshooting:

> *"Test Connection never looked. It returns "Test not applicable for this type" for every file
> connector without touching the path, so a bad path is only discovered when the load runs."*

That is diagnostic advice built on the retired behaviour, and it is worse than the Step-4 sentence
it duplicates: it reaches a reader **who already has a failure**, and it routes them past the
button that would now name the cause. Rewrite the Cause to say the button *does* look, and that a
green from it plus a failed run is the two-container case above — which is the actual remaining
cause of this symptom.

**Generalisation, for whoever writes the guard:** the census counts *pages*, and a page can be
wrong in two places for two different reasons. Fixing the Step-4 line and stopping leaves the
Troubleshooting section asserting the same false thing to the reader most likely to act on it.
Fix by **line**, verify by **page**.

---

## 6. Group C — 4 exempt pages: the neutral third state, with its own reason

`rest-api · google-ads · google-analytics · google-sheets` (kafka already done, `openapi` has no
page).

**What is true.** `(None, <reason>)`. Not green, not red. The reason is **per type** and already
written in `SAAS_PROBE_EXEMPT` — the page must say *that* reason, not the deleted "HTTP-API
source" premise (§2).

The reasons, as the code states them, to be put in the page's voice without weakening them:

| page | why it is not tested |
|---|---|
| `rest-api` | a base URL plus arbitrary auth; the resource paths live on the **upload**, not the connection, so there is no endpoint we know is safe to call |
| `google-sheets` | the credential is a service-account JSON; verifying it means minting an OAuth token. And the step that usually fails — **sharing the sheet with the service account** — is per-upload, not per-connection |
| `google-analytics` | service-account JSON must be exchanged for an OAuth token before anything can be called, and the **property grant is separate from the key being valid** |
| `google-ads` | needs a developer token **plus** an OAuth refresh exchange |

**Canonical block** — Kafka's, which is the shape to copy:

> ⚠️ **Test Connection does not check this connection, and it will tell you so.** {per-type reason}.
> The button returns a neutral **not tested** verdict carrying that reason — deliberately neither
> green nor red, because reporting an unverified connection as working and reporting it as failed
> are the same lie told in opposite directions. **The first real verification is the first pipeline
> run**, so run it before you schedule anything.

⚠️ **Keep the useful half of what these pages already say.** `google-analytics.md` and
`google-sheets.md` name the *specific* thing that fails (Viewer access; sharing the sheet). That is
the most valuable sentence on either page and it is still true — carry it into the new block rather
than replacing it with the generic ending.

---

## 7. Group D — correct already, with **one** exception the string count could not see

`mongodb` (real auth via `server_info()`), `sqlite` + `duckdb` (real open, and already carrying the
container caveat), and the 10 SQL guides. **Zero** of these quote the retired string. They are
named here so nobody sweeps them in, and because §5's copy is borrowed from `sqlite`/`duckdb`.

🚨 **`bigquery.md` is the exception, and finding it is the point of §2 being a rule rather than a
sweep.** It carried the deleted premise from the *other side*:

> *"Unlike HTTP-API sources (Stripe, GitHub), BigQuery exposes a SQL interface that Datanika can
> validate immediately."*

**Stripe and GitHub are both really probed today** — the sentence picks, as its two examples of
untestable connectors, two of the fourteen that *are* tested. It quotes the retired string zero
times, appears in no group affected by [landing#502], and was invisible to a census that counts
that string. **Count the instruction, not the phrase** — `PRODUCT_RULES` §3, firing on the person
applying it. Rewritten in this batch to state what `_test_sql_connection` does without the false
contrast; **23 guides changed, not 22.**

One unrelated over-claim noticed while deriving this, **not in scope and not to be bundled**:
`databricks.md` says Test Connection *"verifies it can connect to the SQL endpoint and access the
catalog"*, while `_test_sql_connection` runs `SELECT 1` and reads no catalog. Same class, different
issue — file it, don't fix it here.

---

## 8. Two things that must survive this work

1. 🚨 **`/blog/green-tests-broken-connectors/` quotes the retired string in the past tense and is
   correct.** It is an account of the behaviour that was removed. **Do not edit it, and do not let
   a guard fire on it.**
2. **`verified_date` must not be bumped** by whoever makes these edits. `verified_by: product-ui`
   asserts somebody walked the UI; re-deriving against `origin/dev` is a weaker claim wearing the
   stronger claim's label ([landing#439] is about exactly this drift).

---

## 9. Guard shape — and why the obvious guard is wrong

**QA owns the guard. This section is the contract it must satisfy, not an implementation.**

🚨 **A bare token ban — `assert count("Test not applicable for this type") == 0` — is the wrong
guard, and would be wrong even after every page here is fixed.** Three legitimate occurrences of
that exact string exist and must keep existing:

- the blog post's historical account (§8.1),
- the two `connection_service.py` comments describing what was removed,
- **this spec**, which quotes the wording it retires.

That last one is not an accident of drafting; it is required. **A retirement note must quote the
wording it retires, or a future reader cannot tell which phrase was retired.** The direct
consequence — worth stating because it has already caught a Product session out — is that
**a contradiction grep over that wording can never legitimately return 0.** Anyone verifying this
work must **count the hits and read each one**, never assert a bare zero. Assert the *set*, not the
count.

**What the guard must assert instead — anchored to the affirmative instruction:**

- **G1.** No file under `src/content/connectors/` may tell a reader to *expect* the retired verdict.
  Anchor on the instruction shape (a `Test Connection` mention within N characters of the retired
  string), not on the bare token.
- **G2.** No connector guide may contain the premise deleted in §2 — an `HTTP-API source` clause
  used to explain why Test Connection does not apply — because 14 HTTP-API sources are probed.
- **G3.** Every guide whose slug is in the **derived** exempt set must contain the words `not
  tested` and must **not** claim the button checks connectivity or credentials.
- **G4.** Every guide whose slug is in the **derived** probe set must claim a real check, and must
  not deny one.
- **G5. Anti-vacuity.** The guard must be shown red by mutating a **real** guide file — not a
  synthetic fixture — and red **for the stated reason**. `tests/kafka-auth-claims.test.ts`
  documents the failure this exists to prevent: a banned payload left every `dist/`-side assertion
  green.
- 🚨 **G6. Match the page's TEXT, not its markup.** `html.replace(/<[^>]*>/g, " ")` first. A
  multi-token literal split across `<em>`/`<code>` or sitting inside a highlighted block never
  matches the built page — measured, and it is how a guard passes while asserting nothing.
- **G7.** The group membership in the guard must be **derived from `connection_service.py`**, or
  the guard is a second copy of the same list that drifted in the first place. If that file cannot
  be read from the landing repo's test run, the guard must at minimum carry the totals asserted in
  §3 (25 = 4 + 14 + 6 + 1, zero undecided) so a divergence is loud.

---

## 10. Acceptance criteria

- [ ] **AC1** — All 14 Group A pages state that Test Connection performs a real credential check,
      and none of them retains the retired string or the HTTP-API premise.
- [ ] **AC2** — All 14 Group A pages state the scope limit (§4). A page claiming the button proves
      the pipeline will run fails this AC.
- [ ] **AC3** — `s3.md` carries the unqualified B-remote copy; `csv.md`, `json.md`, `parquet.md`
      carry the qualified B-local copy naming the web/worker split.
- [ ] **AC4** — `csv.md`'s Troubleshooting **Cause** (§5a) no longer asserts that Test Connection
      never looks.
- [ ] **AC5** — The 4 Group C pages carry the neutral-verdict block with their **own** reason from
      `SAAS_PROBE_EXEMPT`, and retain the specific failure they already name (§6).
- [ ] **AC6** — `kafka.md` is unchanged; the blog post is unchanged; Group D is unchanged **except
      `bigquery.md`**, whose false contrast (§7) is removed.
- [ ] **AC7** — No `verified_date` moved.
- [ ] **AC8** — The guard exists, satisfies G1–G7, and has been shown red on a mutated real guide.
- [ ] **AC9** — Verification counts the remaining occurrences of the retired string and reads each
      one; it does not assert zero. Expected after this work: **0 under
      `src/content/connectors/`**, non-zero repo-wide.

---

## 11. Reversal condition

If a future change makes a currently-probed type exempt, or gives an exempt type a probe, **the
page must move groups in the same release as the code.** The mechanism that made this issue
possible was a code change ([core#821]) shipping without its pages, and the mechanism that hid it
for weeks was that no guard connected the two. G7 is what closes that; if G7 is ever weakened to a
hand-maintained list, this issue recurs and will look exactly like it did the first time.

[landing#502]: https://github.com/datanika-io/datanika-landing/issues/502
[landing#439]: https://github.com/datanika-io/datanika-landing/issues/439
[PR #499]: https://github.com/datanika-io/datanika-landing/pull/499
[core#493]: https://github.com/datanika-io/datanika-core/issues/493
[core#821]: https://github.com/datanika-io/datanika-core/issues/821
[core#979]: https://github.com/datanika-io/datanika-core/issues/979
[core#1054]: https://github.com/datanika-io/datanika-core/issues/1054
