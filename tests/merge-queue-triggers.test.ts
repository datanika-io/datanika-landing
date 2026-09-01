import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * A merge queue on `dev` only works if the workflows reporting its required checks
 * listen for the `merge_group` event. If one does not, GitHub never starts a run for
 * a queue entry, the required check is never reported, and the entry sits until the
 * queue's `check_response_timeout_minutes` expires and is ejected. Nothing is red.
 * The PR simply stops progressing — which is strictly worse than the `strict`-mode
 * livelock the queue exists to remove, because a human clears that one in seconds.
 *
 * So this guard is derived from the workflows, not from a list of check names:
 *
 *   any workflow that can report a check on a pull request into `dev`
 *   must also trigger on `merge_group`
 *
 * That is deliberately wider than "the required checks". A required check has to be
 * reportable on a PR to be selectable as required at all, so covering every PR-to-`dev`
 * workflow covers every check that could ever become required — without a manifest of
 * check names that would silently rot the first time branch protection changed. The
 * cost of being wide is runner minutes on a queue entry; the cost of being narrow is a
 * branch that stops merging.
 *
 * ⚠️ Two limits, stated rather than papered over:
 *
 *  1. It does not inspect job-level `if:` conditions. A required job carrying
 *     `if: github.event_name == 'pull_request'` would skip on a merge group and report
 *     nothing, and this guard would still pass. Core has legitimate event-filtered jobs
 *     (`deploy-staging` and friends are `push` + `refs/heads/dev` on purpose), so a
 *     blanket rule there would be wrong; the honest boundary is here.
 *  2. The `cancel-in-progress` assertion is textual — it checks the guarding conjunct
 *     is present, not that the surrounding expression as a whole is sound.
 *
 * Re-derive the real required-check list any time this matters:
 *   gh api repos/datanika-io/datanika-landing/branches/dev/protection \
 *     -q '[.required_status_checks.checks[].context]'
 *
 * Measured on this repo 2026-09-01, when the queue was switched on, because two of these
 * facts are not what you would guess and one of them changes what the guard is FOR:
 *
 *  - GitHub reads workflow triggers from the merge-group ref's OWN tree, not from the base
 *    branch. The PR that added the trigger bootstrapped itself through the queue: run
 *    33523211167, event `merge_group`, branch `gh-readonly-queue/dev/pr-440-8d93a238`.
 *    `build` reported on the merge-group commit `bac02c24`, and that same commit became
 *    `dev`'s head — so the thing that was tested is exactly the thing that merged.
 *
 *  - The merge-group ref is suffixed with the BASE sha, not the PR head. Two entries for
 *    the same PR against an unchanged base therefore share a `github.ref`, which is why
 *    the `cancel-in-progress` assertion below is load-bearing rather than the belt-and-
 *    braces this file originally called it.
 *
 *  - A queued PR reports `autoMergeRequest: null`. The queue entry is visible ONLY via
 *    `repository.mergeQueue(branch:).entries` in GraphQL, and `gh pr merge --auto` exits
 *    **0 with a warning** whether or not it enqueued anything. A script that reads either
 *    of those as its outcome signal will report a queued PR as un-queued.
 *
 * (core#904)
 */

const WORKFLOW_DIR = resolve(__dirname, "..", ".github", "workflows");

type Workflow = { name: string; raw: string };

function loadWorkflows(): Workflow[] {
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((name) => ({
      name,
      raw: readFileSync(resolve(WORKFLOW_DIR, name), "utf8"),
    }));
}

/**
 * Drop whole-line comments before any matching.
 *
 * This is load-bearing, not tidiness. `ci.yml` explains the merge-queue reasoning in
 * comments, so the literal string `merge_group` appears in this repo's prose several
 * times. A guard matching raw text would be satisfied by its own explanation — green
 * for a workflow that had lost the actual trigger. The mutation control at the bottom
 * of this file exists to prove that cannot happen.
 */
function stripComments(yaml: string): string {
  return yaml
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

/** The top-level `on:` block: from `on:` to the next column-0 key. */
function topLevelBlock(yaml: string, key: string): string {
  const lines = stripComments(yaml).split("\n");
  const start = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (start === -1) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[A-Za-z_]/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** A two-space-indented sub-block of `on:`, e.g. `pull_request:`. */
function subBlock(onBlock: string, key: string): string | null {
  const lines = onBlock.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^\\s{2}${key}:`).test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s{0,2}\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function branchFilter(block: string): string[] | null {
  const inline = block.match(/branches:\s*\[([^\]]*)\]/);
  if (inline) {
    return inline[1]
      .split(",")
      .map((b) => b.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  if (/^\s*branches:\s*$/m.test(block)) {
    return [...block.matchAll(/^\s*-\s*["']?([\w./*-]+)["']?\s*$/gm)].map((m) => m[1]);
  }
  return null;
}

/** Can this workflow report a status check on a pull request into `dev`? */
function reportsOnPullRequestToDev(wf: Workflow): boolean {
  const on = topLevelBlock(wf.raw, "on");
  const pr = subBlock(on, "pull_request");
  if (pr === null) return false;
  const branches = branchFilter(pr);
  // No `branches:` filter means every base branch, `dev` included.
  return branches === null || branches.includes("dev");
}

function declaresMergeGroup(wf: Workflow): boolean {
  return subBlock(topLevelBlock(wf.raw, "on"), "merge_group") !== null;
}

/**
 * True when a merge-group run of this workflow can be cancelled by a later one.
 *
 * Absent `cancel-in-progress` defaults to false. A bare `true` cancels everything,
 * merge groups included. An expression must carry the `!= 'merge_group'` conjunct.
 */
function cancelsMergeGroupRuns(wf: Workflow): boolean {
  const conc = topLevelBlock(wf.raw, "concurrency");
  const value = conc.match(/^\s*cancel-in-progress:\s*(.+?)\s*$/m);
  if (!value) return false;
  const v = value[1];
  if (/^false$/i.test(v)) return false;
  if (/^true$/i.test(v)) return true;
  return !/github\.event_name\s*!=\s*["']merge_group["']/.test(v);
}

const workflows = loadWorkflows();
const queued = workflows.filter(reportsOnPullRequestToDev);

describe("merge-queue triggers", () => {
  it("actually found workflows to check", () => {
    // A rename of `.github/workflows`, or a filter typo, would otherwise leave every
    // assertion below iterating an empty array and reporting green. An under-populated
    // run has to fail.
    expect(workflows.length).toBeGreaterThan(0);
    expect(queued.length).toBeGreaterThan(0);
    expect(queued.map((w) => w.name)).toContain("ci.yml");
  });

  it("every workflow that reports a check on a PR into dev listens for merge_group", () => {
    const missing = queued.filter((w) => !declaresMergeGroup(w)).map((w) => w.name);
    expect(missing).toEqual([]);
  });

  it("never cancels a merge-group run", () => {
    // A cancelled run is an ABSENT verdict. On a pull request that is free — the answer
    // gets recomputed on the new head. On a queue entry nothing recomputes it: the queue
    // waits out its timeout and ejects the PR.
    const cancels = queued.filter(cancelsMergeGroupRuns).map((w) => w.name);
    expect(cancels).toEqual([]);
  });

  it("still cancels superseded pull_request runs", () => {
    // The opposite error: answering the merge-group problem by disabling cancellation
    // altogether would put every superseded PR run on the runner queue. `ci.yml` is the
    // repo's only PR workflow, so assert the property where it lives.
    const ci = workflows.find((w) => w.name === "ci.yml")!;
    const conc = topLevelBlock(ci.raw, "concurrency");
    expect(conc).toMatch(/cancel-in-progress:/);
    expect(conc).not.toMatch(/cancel-in-progress:\s*false\s*$/m);
  });
});

describe("the guard itself fails on the mutations it exists to catch", () => {
  // Mutating the REAL artifact, not a synthetic fixture written from the same mental
  // model as the checker. `ci.yml` is the file a merge queue on `dev` depends on.
  const ci = workflows.find((w) => w.name === "ci.yml")!;

  it("goes red when the merge_group trigger is deleted", () => {
    const mutant: Workflow = {
      name: "ci.yml",
      raw: ci.raw.replace(/^\s{2}merge_group:.*$(\r?\n\s{4}.*$)*/m, ""),
    };
    expect(mutant.raw).not.toEqual(ci.raw);
    expect(reportsOnPullRequestToDev(mutant)).toBe(true);
    expect(declaresMergeGroup(mutant)).toBe(false);
  });

  it("is not satisfied by comments that merely mention merge_group", () => {
    // The sharp control. After deleting the trigger the file still contains the string
    // `merge_group` in its own explanatory comments, so a raw-text guard would stay
    // green here. This asserts both halves: the string survives, and the guard is red.
    const mutant: Workflow = {
      name: "ci.yml",
      raw: ci.raw.replace(/^\s{2}merge_group:.*$(\r?\n\s{4}.*$)*/m, ""),
    };
    expect(mutant.raw).toContain("merge_group");
    expect(declaresMergeGroup(mutant)).toBe(false);
  });

  it("goes red on a bare `cancel-in-progress: true`", () => {
    const mutant: Workflow = {
      name: "ci.yml",
      raw: ci.raw.replace(/cancel-in-progress:.*$/m, "cancel-in-progress: true"),
    };
    expect(mutant.raw).not.toEqual(ci.raw);
    expect(cancelsMergeGroupRuns(mutant)).toBe(true);
  });

  it("goes red on an inverted expression that cancels only merge groups", () => {
    // `== 'merge_group'` reads plausibly and does the opposite. The conjunct the guard
    // requires is `!=`, so this must not pass.
    const mutant: Workflow = {
      name: "ci.yml",
      raw: ci.raw.replace(
        /cancel-in-progress:.*$/m,
        "cancel-in-progress: ${{ github.event_name == 'merge_group' }}",
      ),
    };
    expect(cancelsMergeGroupRuns(mutant)).toBe(true);
  });

  it("recognises a PR workflow with no branch filter as covering dev", () => {
    const mutant: Workflow = {
      name: "ci.yml",
      raw: ci.raw.replace(/^\s{4}branches: \[dev, main\]$/m, ""),
    };
    expect(mutant.raw).not.toEqual(ci.raw);
    expect(reportsOnPullRequestToDev(mutant)).toBe(true);
  });

  it("does not flag a PR workflow scoped to main only", () => {
    // promotion-pr-refs.yml is the live example: `pull_request` on `main`. Promotions
    // never enter a queue, so requiring merge_group there would be noise.
    const promo = workflows.find((w) => w.name === "promotion-pr-refs.yml");
    expect(promo).toBeDefined();
    expect(reportsOnPullRequestToDev(promo!)).toBe(false);
  });
});
