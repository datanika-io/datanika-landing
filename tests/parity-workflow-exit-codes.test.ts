import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * A drift cron may not go red for "nothing changed today".
 *
 * ## What was wrong
 *
 * `connector-count-parity.yml` files an issue when landing and core disagree,
 * and guards against duplicates with an "already tracked in #N" branch. Both of
 * its jobs **exited 1 from that branch** — so once a drift issue existed, the job
 * was red on *every subsequent run*, forever, while doing exactly what it was
 * built to do.
 *
 * Measured on run **33631848187** (2026-09-02): `config-fields` read `failure`
 * while every step that does real work read `success`. The only red step logged
 * `Already tracked in #449; not filing again.` The job had been red on every run
 * for as long as #449 had been open.
 *
 * ## Why this is worth a guard rather than a one-line fix
 *
 * This project's documented signature defect is *a green that proves nothing*.
 * This is the same defect wearing the other colour, and it is worse in one
 * specific way: a check that is red forever trains everyone to stop reading it,
 * so a **genuine** break in the steps above — the core README fetch, the slug
 * parse, the schema download — arrives on a signal that has already been tuned
 * out. The permanent red does not just fail to inform; it destroys the channel.
 *
 * ## The line this draws
 *
 * - **"I filed a new issue" → exit 1 is correct.** Something changed today, and a
 *   red run on the repo is a standing signal that is easy to see.
 * - **"An issue already exists" → exit 0.** Nothing changed, nothing needs doing,
 *   and the open issue is already the tracking mechanism. Repeating a red every
 *   morning adds no information.
 *
 * The assertion is on the **duplicate-suppression branch only** — the `exit 1`
 * that follows a real `gh issue create` is deliberately left alone, and the
 * control below proves this test can tell the two apart.
 */

const ROOT = resolve(__dirname, "..");
const WORKFLOW = ".github/workflows/connector-count-parity.yml";
const SOURCE = readFileSync(resolve(ROOT, WORKFLOW), "utf-8");
const LINES = SOURCE.split(/\r?\n/);

/** The log line every duplicate-suppression branch prints. */
const ALREADY_TRACKED = /not filing again/;

/** How far after that line the branch's own `exit` may sit. */
const BRANCH_WINDOW = 3;

function exitAfterAlreadyTracked(): { line: number; code: string; text: string }[] {
  const found: { line: number; code: string; text: string }[] = [];
  LINES.forEach((line, i) => {
    if (!ALREADY_TRACKED.test(line)) return;
    for (let j = i + 1; j <= Math.min(i + BRANCH_WINDOW, LINES.length - 1); j++) {
      const m = LINES[j].match(/^\s*exit\s+(\d+)\s*$/);
      if (m) {
        found.push({ line: j + 1, code: m[1], text: LINES[j].trim() });
        return;
      }
    }
    found.push({ line: i + 1, code: "(none)", text: line.trim() });
  });
  return found;
}

/**
 * How many jobs in this workflow can file an issue. Derived, not hardcoded:
 * the invariant is "every issue-filing job carries both halves of the rule",
 * and a third job (`coverage`, landing#508) proved that a literal `2` turns
 * adding a job into a test edit rather than a check. Deriving keeps the
 * assertion meaningful at any job count while still failing when a job is
 * missing one half.
 */
const FILING_JOBS = (SOURCE.match(/gh issue create/g) ?? []).length;

describe("connector-count-parity.yml — duplicate suppression is not a failure", () => {
  it("every issue-filing job has a duplicate-suppression branch (positive control)", () => {
    // If a rename makes this find zero, every assertion below passes vacuously —
    // which is the failure mode the workflow itself demonstrated in the other
    // direction. The `>= 2` floor is what stops the derivation from collapsing.
    expect(
      FILING_JOBS,
      `Found ${FILING_JOBS} \`gh issue create\` calls in ${WORKFLOW}. This file ` +
        `exists because that workflow files issues; if it no longer does, delete ` +
        `this suite deliberately rather than letting it pass over nothing.`,
    ).toBeGreaterThanOrEqual(2);

    const hits = LINES.filter((l) => ALREADY_TRACKED.test(l));
    expect(
      hits.length,
      `Expected ${FILING_JOBS} "not filing again" branches in ${WORKFLOW} (one per ` +
        `issue-filing job), found ${hits.length}. A job that files issues without ` +
        `one is red for the lifetime of its issue. If the wording changed, update ` +
        `this matcher — do not delete the check.`,
    ).toBe(FILING_JOBS);
  });

  it("neither branch exits non-zero", () => {
    const bad = exitAfterAlreadyTracked().filter((f) => f.code !== "0");
    expect(
      bad,
      `A drift cron that exits non-zero on "already tracked" is red for the whole ` +
        `lifetime of the issue, so its colour stops meaning anything and a real ` +
        `break in the steps above it becomes invisible. Use exit 0 here; keep ` +
        `exit 1 after a genuine \`gh issue create\`:\n` +
        bad.map((f) => `  ${WORKFLOW}:${f.line}: ${f.text} (exit ${f.code})`).join("\n"),
    ).toEqual([]);
  });

  it("still allows exit 1 after actually filing an issue (scope control)", () => {
    // Proves the rule above is narrow. If this ever reads 0, the check has been
    // over-applied and the cron has lost its one real signal.
    const createBlocks = SOURCE.match(/gh issue create[\s\S]{0,600}?exit 1/g) ?? [];
    expect(
      createBlocks.length,
      `Expected every issue-filing job (${FILING_JOBS}) to keep \`exit 1\` after ` +
        "`gh issue create` — that red means something changed today and is the " +
        "signal worth having.",
    ).toBe(FILING_JOBS);
  });
});
