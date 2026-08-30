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
