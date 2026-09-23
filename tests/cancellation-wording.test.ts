import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

/**
 * What cancelling a run does must read the same on every page that says it (datanika-core#657).
 *
 * `SPEC_RUN_CANCELLATION` AC10 and AC12 put two sentences on three surfaces — the in-app Cancel
 * dialog, the API's cancel response, and the docs — *worded the same*. Core keeps the wording once,
 * in `datanika/services/run_cancellation.py` (`CANCEL_EFFECT`, `CANCEL_BILLING`), and its own
 * suite holds the dialog and the API to it. This repository cannot import that file, so the text
 * is restated ONCE below and both docs pages are held to it.
 *
 * 🔑 These are the 2a sentences, not the spec's original D3 (spec D3a). D3 described a mid-flight
 * stop — "cancelling stops further loading" — which core cannot do: a run already inside its engine
 * call runs to the end. The page used to say the opposite in the pessimistic direction ("it does not
 * stop the work yet"), which stopped being true on 2026-09-17 for a run that has not started.
 *
 * ⚠️ A cross-file agreement test, like `wait-contract-agreement.test.ts`: it cannot see production
 * or core. If core's wording changes, change it there first, then here — this test failing on the
 * landing side is the reminder, not the source of truth.
 *
 * Read from the BUILT pages, so a sentence that only survives inside an HTML comment does not count.
 */

// ⚠️ The last clause names NO object, and putting one back is a regression (core#657 spec D3b,
// Product 2026-09-23). This text is shown for every run, and core's `Run.target_type` is
// `upload | transformation | pipeline` — it used to say "re-running an UPLOAD that appends", so
// two of the three read an example about an object they are not running, and a dbt user could
// read the upload-specific clause as an exemption when an `incremental` model appends too.
const EFFECT =
  "A run that has not started its work yet stops before anything is read or written. " +
  "Work already in progress cannot be interrupted: it runs to the end, and the run is then " +
  "marked cancelled. Data already written to your destination stays there, so a re-run that " +
  "appends loads those rows again.";

const BILLING = "You are billed for what was processed before the run stopped.";

const DIST = resolve(__dirname, "../dist");

/** Visible text of an HTML string: comments, scripts and tags removed, whitespace collapsed. */
function textOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/ ([.,:;])/g, "$1");
}

function visibleText(page: string): string {
  const file = resolve(DIST, page);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return textOf(readFileSync(file, "utf-8"));
}

const PAGES = ["docs/runs/index.html", "api/reference/index.html"];

describe("what cancelling does is worded the same on every page that says it", () => {
  it.each(PAGES)("%s carries the effect sentence word for word", (page) => {
    expect(visibleText(page)).toContain(EFFECT);
  });

  it.each(PAGES)("%s carries the billing sentence word for word", (page) => {
    expect(visibleText(page)).toContain(BILLING);
  });

  it("the agent page says a run already working is not interrupted", () => {
    expect(visibleText("docs/ai-agents/index.html")).toContain(
      "Cancelling does not interrupt work already in progress",
    );
  });

  it("control: a sentence that survives only in a comment does not count", () => {
    // The anti-vacuity half, run through the SAME helper the page tests use. If `textOf` stopped
    // removing comments, the page tests would be satisfied by the explanatory comments beside the
    // sentences rather than by the sentences a reader sees.
    expect(textOf(`<p>shown</p><!-- ${EFFECT} -->`)).not.toContain(EFFECT);
    expect(textOf(`<p><strong>${EFFECT}</strong></p>`)).toContain(EFFECT);
  });
});

/**
 * The in-app Cancel control shipped (datanika-core#1504 + #1510, on core `master`), and these
 * pages described a product that no longer exists: "Today this is API-only. There is no Stop
 * button in the app yet."
 *
 * 🔑 Asserted as the PRESENCE of what is true, never the absence of the sentence that was wrong
 * (`WORKFLOW_RULES` §4). "The page must not say API-only" is satisfied by deleting the section,
 * and it would go red on a correct page that explained why it *used* to be API-only.
 *
 * Every string below was read from core `master` rather than from a handoff: `i18n/en.json`
 * (`runs.cancel_title`, `runs.cancel_confirm`, `runs.cancel_keep`, `runs.stopping`) and
 * `datanika/ui/pages/runs.py` (`AuthState.can_edit` gates the affordance; the dialog names the
 * run as `#<id>  <target name>`).
 *
 * ⚠️ Same limitation as the block above and it is the point: this cannot see core or production.
 * If the control changes, change it in core first and then here.
 */
describe("the docs describe the Cancel control that actually shipped", () => {
  const RUNS = () => visibleText("docs/runs/index.html");

  it("the statuses table carries cancelling, not just cancelled", () => {
    // `cancelling` appears in prose on this page already, so a bare substring match would have
    // passed before the row existed. Require the row's own description.
    expect(RUNS()).toContain("A stop was requested");
    expect(RUNS()).toContain("cancelled");
  });

  it.each(["Stop this run?", "Stop this run", "Keep running", "Stopping…"])(
    "/docs/runs names the control's own words: %s",
    (phrase) => {
      expect(RUNS()).toContain(phrase);
    },
  );

  it("/docs/runs says who may stop a run, and that the app can do it", () => {
    expect(RUNS()).toContain("Runs");
    expect(RUNS()).toMatch(/editor/i);
  });

  it("/api/reference says the cancel response carries a notice", () => {
    expect(visibleText("api/reference/index.html")).toContain("notice");
  });

  it("control: these phrases are not already in an unrelated page", () => {
    // Guards against a match that would pass anywhere. `Stopping…` carries a real ellipsis
    // (U+2026); a page written with three dots would silently fail to match, and this is where
    // that shows up rather than in a confusing page assertion.
    expect("Stopping...").not.toContain("Stopping…");
    expect(visibleText("docs/getting-started/index.html")).not.toContain("Stop this run?");
  });
});
