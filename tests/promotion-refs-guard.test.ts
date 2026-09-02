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
    const block = source.slice(at, source.indexOf("\n    if not lines", at));
    expect(block).toContain('issue.get("state") == "closed"');
  });
});

describe("promotion_refs.py — it can report failure (landing#455)", () => {
  it("refuses to exit 0 on an empty derivation over a real promotion", () => {
    // Reporting success on every run WAS the defect. Proven by execution, not only here:
    // run against three real reference-free commits with the source-PR lookup unreachable,
    // the script prints ::error:: and exits 1.
    expect(source).toContain("if not refs and not tracking:");
    expect(source).toMatch(/if len\(commits\) >= 3:/);
    expect(source).toContain("::error::");
    const at = source.indexOf("if not refs and not tracking:");
    const block = source.slice(at, at + 1200);
    expect(block).toMatch(/return 1/);
  });

  it("keeps the threshold conservative — a 1- or 2-commit hotfix must not go red", () => {
    const at = source.indexOf("if not refs and not tracking:");
    const block = source.slice(at, at + 1400);
    expect(block).toMatch(/return 0/);
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
