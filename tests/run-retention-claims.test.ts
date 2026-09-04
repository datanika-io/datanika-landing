/**
 * landing#475 — a page describing the run-retention sweep must say it was removed.
 *
 * `/privacy` and `/trust` state that we run **no** time-based purge of run logs.
 * `blog/temp-file-cleanup` documented `purge_old_runs` at 90 days, plus a
 * `MAINTENANCE_RUN_RETENTION_DAYS` env var. Both were live at once and neither
 * guard could see it: `legal-pages-facts.test.ts` has a hardcoded two-page
 * `PAGES` list, and nothing anywhere reads `src/content/blog/` for a claim about
 * data handling.
 *
 * 🔑 **The generalisable half, and the reason this file is scoped to the whole
 * build:** a guard scoped to the pages we think of as *legal* cannot see a
 * factual claim published somewhere we think of as *marketing*. A blog post
 * making a specific, checkable assertion about data retention is a
 * representation whether or not it sits under `/privacy` — and it is the surface
 * that carries the most of them.
 *
 * core#1000 then shipped **option B: remove the sweep** (2026-09-03). Verified on
 * `origin/master`, by content rather than by the issue closing:
 * `maintenance_tasks.py` is 3,976 bytes with **0** `purge_old_runs` references,
 * and `maintenance_run_retention_days` is gone from `config.py`. So the legal
 * pages became exactly right and the post became exactly wrong.
 *
 * ⚠️ This file does **not** ban the old text. A dated post's body is a historical
 * record, and the correction deliberately leaves the original rows standing — a
 * post that quietly edits its own numbers is not worth reading. What it requires
 * is that the text be **accompanied by the dated note**. Banning the tokens
 * outright would force the silent rewrite this project has decided against, and
 * would fail on correct copy — the recorded trap about a ban firing inside its
 * own negation.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative } from "path";
import { inlineText, RENDERINGS, BLOCK_SEPARATED } from "./helpers/rendered-text";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/** Tokens that describe the removed sweep. Code identifiers, not prose. */
const SWEEP_TOKENS = [/\bpurge_old_runs\b/, /\bMAINTENANCE_RUN_RETENTION_DAYS\b/, /\bmaintenance_run_retention_days\b/];

/** The dated correction that must accompany them. */
const REMOVAL_NOTE = /no longer exists/i;
const REMOVAL_DATE = /removed from Datanika on 3 September 2026/i;

/**
 * A retention period stated as CURRENT policy. Hoisted to module scope for
 * landing#505: it was declared twice inside two `it()` bodies, so the pattern the
 * sweep used and the pattern the "guards a dead regex" control exercised were
 * two separate objects that only happened to be identical. Editing one would
 * have left the other asserting the old shape while still reporting green.
 */
const CURRENT_CLAIM =
  /run (?:history|logs|records)[^.<]{0,40}(?:are|is) (?:purged|deleted|removed)[^.<]{0,30}\b\d+ days/i;

/**
 * Does this page present a retention period as current policy, read the way a
 * reader reads it?
 *
 * Module-level so the sweep and its arming controls exercise the **same
 * function**. A control that re-applies `CURRENT_CLAIM` beside the sweep proves
 * the pattern works and says nothing about whether the sweep still calls
 * `inlineText` — so dropping that call would leave the control green.
 */
function claimsCurrentRetention(html: string): boolean {
  return CURRENT_CLAIM.test(html) || CURRENT_CLAIM.test(inlineText(html));
}

/** What the legal pages say, and must keep saying, or this guard is pointless. */
const LEGAL_CLAIM = /do not currently run a time-based purge of run logs/i;
const LEGAL_PAGES = ["privacy/index.html", "trust/index.html"];

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (extname(entry) === ".html") out.push(full);
  }
  return out;
}

describe("run-retention claims agree across the whole build (#475)", () => {
  const pages = existsSync(DIST) ? walkHtml(DIST) : [];
  const read = new Map<string, string>();
  for (const p of pages) read.set(p, readFileSync(p, "utf-8"));

  it("dist/ exists and holds a plausible number of pages", () => {
    expect(pages.length, "run `npm run build` first").toBeGreaterThan(100);
  });

  it.each(LEGAL_PAGES)("%s still states that no time-based purge runs", (page) => {
    // The anchor claim. If it is reworded, everything below is comparing against
    // nothing — and the rewording itself would be the thing to review.
    const file = resolve(DIST, page);
    expect(existsSync(file), `${page} is missing from dist/`).toBe(true);
    expect(readFileSync(file, "utf-8"), `${page} no longer carries the retention sentence`).toMatch(
      LEGAL_CLAIM,
    );
  });

  it("some page still describes the sweep (guards a vacuous sweep)", () => {
    // If nobody mentions purge_old_runs any more, the assertion below is true of
    // the empty set and would stay green through a future post reintroducing the
    // claim under a different spelling. This failing is a prompt to re-derive,
    // not necessarily a defect.
    const hits = [...read.values()].filter((h) => SWEEP_TOKENS.some((t) => t.test(h)));
    expect(
      hits.length,
      "no built page mentions the run-retention sweep at all — this guard is now watching nothing",
    ).toBeGreaterThan(0);
  });

  it("every page describing the sweep also carries the dated removal note", () => {
    const violations: string[] = [];
    for (const [file, html] of read) {
      if (!SWEEP_TOKENS.some((t) => t.test(html))) continue;
      if (!REMOVAL_NOTE.test(html) || !REMOVAL_DATE.test(html)) {
        violations.push(relative(ROOT, file));
      }
    }
    expect(
      violations,
      "These pages describe `purge_old_runs` / MAINTENANCE_RUN_RETENTION_DAYS without saying it was " +
        "removed. core#1000 shipped option B on 2026-09-03: the sweep and its setting are gone, so " +
        "the text is a historical record and needs the dated note beside it. Do NOT fix this by " +
        "deleting the original rows — a dated post that quietly restates its own facts is worse. " +
        `See #475.\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("no page presents a run-retention period as CURRENT policy", () => {
    // The forward-looking half: the legal pages own this claim, so a page saying
    // run history *is* purged after N days contradicts them outright. Scoped to
    // the affirmative present tense so the corrected historical text passes.
    //
    // 🚨 Read through `inlineText`, not off the raw bytes — landing#505. The
    // pattern's `[^.<]` bridges cannot cross a tag, so `Run history is
    // **purged** after 90 days.` matched nothing. Measured by appending exactly
    // that to a real post and rebuilding: this file stayed at `7 passed`, while
    // the same claim in plain prose (`purged after 45 days`) failed it.
    const violations = [...read.entries()]
      .filter(([, html]) => claimsCurrentRetention(html))
      .map(([f]) => relative(ROOT, f));
    expect(violations, `present-tense retention claim found:\n${violations.join("\n")}`).toEqual([]);
  });

  it("the present-tense pattern matches a real example (guards a dead regex)", () => {
    expect(CURRENT_CLAIM.test("Run history is purged after 90 days.")).toBe(true);
    expect(CURRENT_CLAIM.test("run logs are deleted automatically after 30 days")).toBe(true);
    // And must NOT fire on the corrected, historical framing.
    expect(
      CURRENT_CLAIM.test("Run history is now kept for as long as the organization exists"),
    ).toBe(false);
  });

  it("claimsCurrentRetention() survives the RENDERER, not just the raw sample", () => {
    // 🚨 This control exists because the raw-sample control above passed while
    // the dist-side assertion could not fire. A guard's self-test has to
    // exercise the shape the assertion actually meets: markdown goes through the
    // renderer before it reaches a reader, and one `**bold**` anywhere inside
    // the claim splits it. Measured on the real build (landing#505): appending
    // `Run history is **purged** after 90 days.` to a real post left this file
    // at `7 passed`, while `purged after 45 days` in plain prose failed it.
    const missed = RENDERINGS.filter(
      (r) => !claimsCurrentRetention(r.wrap("Run history is purged after 90 days.")),
    ).map((r) => r.how);
    expect(
      missed,
      "A present-tense retention claim rendered this way is invisible to the sweep above — " +
        `the exact defect landing#505 measured.\nMissed: ${missed.join(", ")}`,
    ).toEqual([]);
  });

  it("claimsCurrentRetention() does not fire across a block boundary (false-positive control)", () => {
    const fired = BLOCK_SEPARATED.map((wrap) => wrap("Run history is purged after 90 days"))
      .filter((h) => claimsCurrentRetention(h))
      .map((h) => h.slice(0, 70));
    expect(fired, `block-separated text must not read as one claim:\n${fired.join("\n")}`).toEqual(
      [],
    );
  });
});
