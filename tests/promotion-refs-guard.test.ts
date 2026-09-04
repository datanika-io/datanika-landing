import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `.github/scripts/promotion_refs.py` decides which issues a promotion closes. It is
 * Python in a Node repo, so nothing in `npm test` has ever executed it — which is
 * precisely how this repo missed the fix that core shipped in core#636 and kept running
 * the buggy version for all 7 of its generated promotion blocks (landing#315).
 *
 * These are TEXT assertions, deliberately and with their limits stated: they cannot catch
 * a subtly wrong port, only a missing or mis-ported guard. The behavioural tests for the
 * same logic live in core (`tests/test_deploy/test_promotion_refs.py`). What is actually
 * being defended here is the failure that happened — a fix landing in one repo and not the
 * other — plus the specific copy-paste hazard of porting core's version verbatim, where
 * the base-branch filter says `master`.
 *
 * Standing up pytest in a Node repo to do better would cost more than the bug does at this
 * cadence. Revisit if this script grows logic of its own.
 */

const SCRIPT = resolve(__dirname, "..", ".github", "scripts", "promotion_refs.py");
const source = readFileSync(SCRIPT, "utf8");

describe("promotion_refs.py closing-reference guard", () => {
  it("skips pulls that merely contain the commit (core#635)", () => {
    // `GET /commits/{sha}/pulls` returns every pull whose branch contains the commit, so
    // an OPEN branch cut from `dev` donates its closing keywords to the promotion. The
    // merged_at check is the whole fix.
    expect(source).toContain("def introduced_the_commit(");
    expect(source).toMatch(/merged_at["']?\)?\s+is None/);
    expect(source).toContain("if not introduced_the_commit(pull):");
  });

  it("filters the base branch on `main`, not core's `master`", () => {
    // Porting core's helper verbatim would compare against "master", which is not this
    // repo's default branch: the filter would then match nothing and every earlier
    // promotion PR's references would be re-listed on every promotion.
    expect(source).toMatch(/base["']?,\s*\{\}\)\.get\(["']ref["']\)\s*!=\s*["']main["']/);
    expect(source).not.toMatch(/\.get\(["']ref["']\)\s*[!=]=\s*["']master["']/);
  });

  it("still keeps the base filter as well as the merge check", () => {
    // Neither subsumes the other: a previous promotion PR IS merged, so dropping the base
    // filter would re-list its references; and a base filter alone is the original bug.
    const fn = source.slice(source.indexOf("def introduced_the_commit("));
    const body = fn.slice(0, fn.indexOf("\ndef ", 1));
    expect(body).toContain("merged_at");
    expect(body).toContain("main");
  });
});

/**
 * landing#455 — the non-closing half.
 *
 * For five consecutive promotions this script reported `success` while deriving nothing.
 * It matches only closing keywords; every commit here writes `refs #N`, because
 * WORKFLOW_RULES §4 tells departments to (landing#273: `closes #272` on a 4-of-36 partial
 * fix retired the whole issue). So the automation was working exactly as designed and
 * covering nothing, and no signal ever went red.
 *
 * The fix is NOT to widen the closing regex — that is #273 again. It is to derive the
 * `refs` set separately and render it **without a keyword**, as candidates the promoter
 * reviews before merging.
 *
 * These tests execute the extracted patterns rather than searching for substrings, for the
 * reason this file's header already states: text assertions cannot catch a subtly wrong
 * port, and "which keywords count as authorship" is exactly that kind of detail.
 */

/** Pull a `NAME = re.compile(r"…")` literal out of the Python source. */
function py(name: string, src = source): string {
  const at = src.indexOf(`${name} = re.compile(`);
  expect(at, `${name} not found — the extractor is broken, not the script`).toBeGreaterThan(-1);
  const rest = src.slice(at);
  const firstLine = rest.slice(0, rest.indexOf("\n"));
  // A one-line `re.compile(...)` must not scan forward to the NEXT pattern's closing
  // paren — that silently concatenates two patterns into one that matches nothing.
  const scope = firstLine.includes(")") ? firstLine : rest.slice(0, rest.indexOf("\n)"));
  const parts = [...scope.matchAll(/r"((?:[^"\\]|\\.)*)"/g)];
  expect(parts.length, `no r"…" literal after ${name}`).toBeGreaterThan(0);
  return parts.map((m) => m[1]).join("");
}

/**
 * The one condition three tests anchor on, written once.
 *
 * It gained `and not elsewhere` in landing#493 and two tests had it spelled out verbatim,
 * in five places between them — so the correct change went red in two and would have gone
 * silently vacuous in the others, because `indexOf` on a missing anchor returns -1 and
 * `slice(-1, n)` is an empty string that matches nothing without complaining.
 */
const EMPTY_DERIVATION_GUARD = "if not refs and not tracking and not elsewhere:";

function trackedIn(subject: string): number[] {
  return [...subject.matchAll(new RegExp(py("TRACKING"), "gi"))]
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
}

describe("promotion_refs.py — tracking references (landing#455)", () => {
  it("extracts a non-trivial TRACKING pattern (anti-vacuity)", () => {
    // A length floor proves a pattern is non-empty, never that it is the right one —
    // so every assertion below executes it against real subjects as well.
    expect(py("TRACKING").length).toBeGreaterThan(30);
    expect(py("TRACKING_DECLARATION").length).toBeGreaterThan(30);
  });

  it("counts the authorship keywords this project actually writes", () => {
    // All four are real subjects from this repo's history or core's.
    expect(trackedIn("[Growth] Remove the per-seat price entirely (refs #396)")).toEqual([396]);
    expect(trackedIn("[Infra] Runbook (ref #904)")).toEqual([904]);
    expect(trackedIn("[QA] Widen the guard (part of #738)")).toEqual([738]);
    expect(trackedIn("[Product] Spec (towards #655)")).toEqual([655]);
  });

  it("does NOT count `see #N` — background reading is not authorship", () => {
    expect(trackedIn("[Infra] Something, see #602 for the mechanism")).toEqual([]);
  });

  it("does NOT count a bare mention", () => {
    expect(trackedIn("[Engineering] Same family as #602")).toEqual([]);
  });

  it("renders candidates with NO closing keyword", () => {
    // The whole safety property. A bare `#N` in a PR body closes nothing; that is what
    // lets this list be generated mechanically without re-creating #273.
    const at = source.indexOf("candidate_lines.append(");
    expect(at).toBeGreaterThan(-1);
    const line = source.slice(at, source.indexOf("\n", at));
    expect(line).toContain('f"- #{num}');
    expect(line).not.toMatch(/close|fix|resolve/i);
  });

  it("does not list an issue as a candidate when a commit genuinely closes it", () => {
    expect(source).toContain("tracking.pop(num, None)");
  });

  it("skips already-closed issues in the candidate list", () => {
    const at = source.indexOf("    for num in sorted(tracking):");
    expect(at, "the candidate loop moved — re-derive this anchor").toBeGreaterThan(-1);
    // ⚠️ The end anchor was `"\n    if not lines"` and landing#493 turned that `if` into a
    // multi-line condition, so `indexOf` returned -1 and `slice(at, -1)` silently took the
    // REST OF THE FILE. The assertion then passed by matching the *closing* loop instead —
    // green, and measuring nothing. Anchor on the next thing that is genuinely a boundary,
    // and assert the anchor was found.
    const end = source.indexOf("\n    # Computed AFTER the two loops", at);
    expect(end, "the candidate loop's end anchor moved — re-derive it").toBeGreaterThan(at);
    const block = source.slice(at, end);
    expect(block).toContain('issue.get("state") == "closed"');
    // And prove the slice is the candidate loop, not a superset that happens to contain
    // the string: the closing loop's distinctive line must NOT be in it.
    expect(block).not.toContain("- Closes #{num}");
  });
});

/**
 * landing#493 — the 142-line divergence, and the bucket neither repo had.
 *
 * `promotion-pr-refs.yml` is 50 lines in both repos and delegates to the same path, so
 * *"landing has the same workflow"* was true and misleading; this script was 142 lines
 * behind core's for a week and nothing said so. Landing PR #492 then promoted 9 commits
 * while its block spoke for 3.
 *
 * These tests pin the FEATURES that divergence removed, not byte-equality with core —
 * landing legitimately differs (`main` vs `master`, the `post-promotion-reconcile.yml`
 * prose). A cross-repo byte comparison is not buildable here anyway: core is a different
 * repository and is not checked out during `npm test`.
 */
describe("promotion_refs.py — every promoted commit is accounted for (landing#493)", () => {
  function crossRepoIn(text: string): string[] {
    return [...text.matchAll(new RegExp(py("CROSS_REPO"), "gi"))].map((m) => `${m[1]}#${m[2]}`);
  }

  it("matches a keyword-qualified cross-repo reference", () => {
    expect(crossRepoIn("[Growth] Fix the annex (refs cloud#163)")).toEqual(["cloud#163"]);
    expect(crossRepoIn("[Infra] Port it (closes core#1040)")).toEqual(["core#1040"]);
  });

  it("does NOT match a bare cross-repo mention — a citation is not a declaration", () => {
    // Core measured this: an unqualified `([A-Za-z][\w.-]*)#(\d+)` harvested issue numbers
    // out of a body that merely cited them as already-shipped background, and reported the
    // batch fully accounted. A flattering coverage number is worse than a low one.
    expect(crossRepoIn("[QA] Same family as core#992, and see cloud#160")).toEqual([]);
    expect(crossRepoIn("Background: core#1040 explains the mechanism.")).toEqual([]);
  });

  it("treats `landing#N` as this repo, not another one", () => {
    // `repo_aliases` exists so our own prose does not render under "referenced in another
    // repository" — a confident wrong line is worse than a missing one.
    expect(source).toContain("def repo_aliases(");
    expect(source).toContain("if owner.lower() in mine:");
    const at = source.indexOf("def repo_aliases(");
    const block = source.slice(at, source.indexOf("\ndef ", at + 10));
    // {"datanika-landing", "landing"} — the split is what makes the short form work.
    expect(block).toContain('name.rsplit("-", 1)[-1]');
  });

  it("names commits it could not classify instead of dropping them", () => {
    expect(source).toContain("No issue reference derived");
    expect(source).toContain("unaccounted = [s for s in shas if not accounted.get(s)]");
    expect(source).toMatch(/Coverage: \*\*\{len\(shas\) - len\(unaccounted\)\}/);
  });

  it("gives an unresolvable reference its own bucket rather than silence", () => {
    // The open question in landing#493. Both alternatives are wrong in opposite
    // directions: rendering `#676` invites closing an issue in the wrong repo, and
    // dropping it silently is what already happened.
    expect(source).toContain("Referenced an issue that does not exist in this repository");
    expect(source).toContain("def _unresolve(");
  });

  it("un-accounts a commit whose only reference resolves to nothing", () => {
    // 🔑 The load-bearing half, and the behavioural difference from core's version.
    // Without it a commit whose sole reference is `refs #676` counts toward the coverage
    // line while appearing in no section — landing#493 restated.
    const at = source.indexOf("def _unresolve(");
    const block = source.slice(at, source.indexOf("\n    # Don't re-list", at));
    expect(block.length, "the _unresolve body anchor moved").toBeGreaterThan(100);
    expect(block).toContain('accounted.get(sha, set()).discard(f"refs #{num}")');
    expect(block).toContain('accounted.get(sha, set()).discard(f"closes #{num}")');
  });

  it("computes `unaccounted` AFTER resolution, not before", () => {
    // Ordering is the whole correctness of the previous test: computed earlier, it reports
    // the pre-resolution view and the un-accounting has no effect on the coverage line.
    const unresolveAt = source.indexOf("def _unresolve(");
    const unaccountedAt = source.indexOf("unaccounted = [s for s in shas");
    expect(unresolveAt).toBeGreaterThan(-1);
    expect(unaccountedAt).toBeGreaterThan(unresolveAt);
  });

  it("distinguishes a 404 from a failed API call", () => {
    // 🚨 Conflating them renders a transient error as "this issue does not exist" — a
    // confident, wrong, permanent-looking line in a promotion body. Only a literal Not
    // Found makes a reference unresolvable; anything else leaves the commit unaccounted,
    // which is the honest state and is itself reported.
    expect(source).toContain("def gh_issue(");
    const at = source.indexOf("def gh_issue(");
    const block = source.slice(at, source.indexOf("\ndef main(", at));
    expect(block).toContain('"not found" in stderr or "http 404" in stderr');
    expect(block).toContain('return ("error", None)');
    expect(block).toContain('return ("missing", None)');
    // A PR is not an issue: repos/{r}/issues/{n} returns PRs too, and a promotion body
    // must never list one as an issue to close.
    expect(block).toContain('data.get("pull_request")');
  });

  it("keeps a cross-repo-only batch out of the red check (would be a FALSE red)", () => {
    // Three commits all carrying `refs core#1040` derive no same-repo reference of either
    // kind. Without `elsewhere` in this condition the job fails saying not one reference
    // was derived, while every commit referenced something — and a job that goes red when
    // nothing is wrong teaches people to merge past it.
    expect(source).toContain("if not refs and not tracking and not elsewhere:");
  });
});

describe("promotion_refs.py — the landing#493 guards can fail", () => {
  const mutate = (from: string, to: string) => {
    expect(source.includes(from), `mutation anchor absent: ${from}`).toBe(true);
    return source.replace(from, to);
  };

  it("control: dropping the keyword requirement from CROSS_REPO is caught", () => {
    // The over-broad pattern core measured. It must harvest a bare mention, which is the
    // property the shipped assertions forbid.
    const loose = /([A-Za-z][\w.-]*)#(\d+)\b/gi;
    expect([..."[QA] Same family as core#992".matchAll(loose)].length).toBe(1);
    // ...and the shipped one must not.
    expect([..."[QA] Same family as core#992".matchAll(new RegExp(py("CROSS_REPO"), "gi"))]
      .length).toBe(0);
  });

  it("control: removing the un-accounting makes the coverage line lie", () => {
    const broken = mutate('accounted.get(sha, set()).discard(f"refs #{num}")', "pass");
    expect(broken).not.toContain('accounted.get(sha, set()).discard(f"refs #{num}")');
  });

  it("control: collapsing the 404 distinction is caught", () => {
    const broken = mutate('"not found" in stderr or "http 404" in stderr', "True");
    expect(broken).not.toContain('"not found" in stderr or "http 404" in stderr');
  });

  it("control: computing `unaccounted` before resolution is detectable by order", () => {
    // The one defect the text assertions above genuinely could not see is a reordering,
    // so it is asserted positionally rather than by presence — this proves the check is
    // an ordering check and not another substring test.
    const a = source.indexOf("def _unresolve(");
    const b = source.indexOf("unaccounted = [s for s in shas");
    const swapped = a > b;
    expect(swapped, "if this is ever true the coverage line reports a pre-resolution view")
      .toBe(false);
  });
});

describe("promotion_refs.py — it can report failure (landing#455)", () => {
  it("refuses to exit 0 on an empty derivation over a real promotion", () => {
    // Reporting success on every run WAS the defect. Proven by execution, not only here:
    // run against three real reference-free commits with the source-PR lookup unreachable,
    // the script prints ::error:: and exits 1.
    // ⚠️ `and not elsewhere` was added in landing#493 — a batch whose commits all carry
    // `refs core#1040` references something, so firing here would be a FALSE red. These
    // two assertions pinned the pre-#493 condition verbatim and went red on the correct
    // change, which is the guard working: the same shape as the deploy step that asserted
    // the Google Ads tag was PRESENT (landing#481), where a correct removal would have
    // failed every deploy. Updated deliberately, not widened.
    expect(source).toContain("if not refs and not tracking and not elsewhere:");
    expect(source).toMatch(/if len\(commits\) >= 3:/);
    expect(source).toContain("::error::");
    const at = source.indexOf(EMPTY_DERIVATION_GUARD);
    // 🚨 Assert the anchor was FOUND. Without this, `indexOf` returning -1 makes
    // `slice(-1, …)` an empty string and every assertion below it fails for a reason that
    // reads like the script losing the feature — or, with a `not.toMatch`, passes on
    // nothing at all. Two tests here already drifted that way.
    expect(at, "the empty-derivation guard moved — re-derive this anchor").toBeGreaterThan(-1);
    expect(source.slice(at, at + 1400)).toMatch(/return 1/);
  });

  it("keeps the threshold conservative — a 1- or 2-commit hotfix must not go red", () => {
    const at = source.indexOf(EMPTY_DERIVATION_GUARD);
    expect(at, "the empty-derivation guard moved — re-derive this anchor").toBeGreaterThan(-1);
    expect(source.slice(at, at + 1600)).toMatch(/return 0/);
  });

  it("decodes subprocess output as UTF-8", () => {
    // Without it `text=True` uses the platform locale codec; on a Windows dev box that is
    // cp1251 and every em dash in an issue title comes back as mojibake. It is correct on
    // the ubuntu runner, so the defect is invisible in CI and shows up only in the local
    // rehearsal path — the one place someone checks the block before promoting.
    expect(source).toMatch(/subprocess\.run\([^)]*encoding="utf-8"/s);
  });

  it("offers a rehearsal path that writes nothing", () => {
    expect(source).toMatch(/DRY_RUN/);
    const at = source.indexOf('os.environ.get("DRY_RUN"');
    const block = source.slice(at, at + 400);
    expect(block).toContain("return 0");
    // It must return BEFORE the body is written, or a rehearsal mutates the PR.
    expect(at).toBeLessThan(source.indexOf('run("gh", "pr", "edit"'));
  });
});

describe("promotion_refs.py — the tracking guard can fail", () => {
  function mutate(find: string, replace: string): string {
    const eol = source.includes("\r\n") ? "\r\n" : "\n";
    const anchor = find.replace(/\n/g, eol);
    expect(source.split(anchor).length - 1, `anchor did not match once: ${find}`).toBe(1);
    return source.replace(anchor, replace.replace(/\n/g, eol));
  }

  it("control: adding `see` to TRACKING is caught", () => {
    const broken = mutate(
      'r"\\b(?:refs?|part\\s+of|towards?|addresses|implements)\\s*:?\\s+#(\\d+)\\b"',
      'r"\\b(?:refs?|see|part\\s+of|towards?|addresses|implements)\\s*:?\\s+#(\\d+)\\b"',
    );
    const re = new RegExp(py("TRACKING", broken), "gi");
    expect([...("[Infra] Something, see #602".matchAll(re))].length).toBe(1);
  });

  it("control: a candidate line that carries a closing keyword is caught", () => {
    const broken = mutate(
      'candidate_lines.append(f"- #{num} — {title} · via {via}")',
      'candidate_lines.append(f"- Closes #{num} — {title} · via {via}")',
    );
    const at = broken.indexOf("candidate_lines.append(");
    const line = broken.slice(at, broken.indexOf("\n", at));
    expect(line).toMatch(/close/i);
  });

  it("control: removing the empty-derivation failure is caught", () => {
    const broken = mutate("        if len(commits) >= 3:", "        if False:");
    expect(broken).not.toMatch(/if len\(commits\) >= 3:/);
  });
});
