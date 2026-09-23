import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, sep } from "path";

/**
 * Guardrail: no built page tells a reader to look up their **byte usage** on a screen in the
 * app, because no screen shows one (landing#663, datanika-core#1513).
 *
 * ## What was false, twice
 *
 * - `stripe-revenue-dashboard-dbt` told readers to "check your byte usage in the dashboard's
 *   Plan Usage panel" (corrected in landing#661, 2026-09-22).
 * - `customer-360-hubspot-stripe` said "Check **Usage** for your own figures" — live on
 *   production from 2026-09-07 until landing#663. Found by applying the pre-send rule the
 *   first correction earned, not by a guard: there wasn't one.
 *
 * Measured with `plans/growth/scripts/app_bundle_keys.py` against the served app.datanika.io
 * index chunk `_index-C76wYKRO.js` on 2026-09-23 — the dashboard IS the index route:
 *   dashboard.*        14 of 15 referenced   <- positive control: the page is really there
 *   dashboard.usage_*   3 of 3  referenced   <- the Usage card IS rendered
 *   quota.volume_*      0 of 5  referenced   <- and carries no GB/volume figure
 *   esm dictionary    761 of 761             <- so the route-chunk reading is the meaningful one
 *   fabricated key      0 resources          <- negative control
 *
 * ## 🚦 Flip condition — delete the disclaimer requirement in the PR that makes it false
 *
 * When core#1513 ships a screen that shows byte usage, this guard refuses the corrected copy.
 * Delete the conditional in the same PR that restores the instruction. **Failing there is the
 * point**: a checklist item would rot, and a guard that outlives its premise refuses true copy.
 *
 * ## Why this asserts a PRESENCE and not an absence
 *
 * The corrected copy has to NAME the panel in order to disown it — *"its **Plan Usage** panel
 * counts model runs, not bytes"*. A ban on the phrase would therefore go red on the fix and
 * green on a page that simply stops discussing cost, which is worse than the original defect:
 * a reader sizing a bill would get no warning at all. So the rule is conditional —
 * **mention the screen in a byte context ⇒ carry the disclaimer** — and the anti-vacuity
 * control below asserts the condition actually selects pages.
 */

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/** A built page's text the way a browser shows it: tags to a space, whitespace collapsed. */
function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#36;/g, "$")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

/**
 * A dated correction, as the posts write it. Removed before the conditional runs: a footnote
 * must not be able to rescue a body that still gives the instruction, and the correction has
 * to name the claim it retracts.
 */
const CORRECTION = /^\s*Correction, \d{4}-\d{2}-\d{2}\./;

function withoutCorrections(html: string): string {
  return html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/g, (whole, inner: string) =>
    CORRECTION.test(pageText(inner)) ? " " : whole,
  );
}

interface Page {
  route: string;
  body: string;
}

function builtPages(): Page[] {
  const out: Page[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = resolve(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry === "index.html") {
        const rel = p.slice(DIST.length + 1).split(sep).join("/");
        const route = "/" + rel.replace(/index\.html$/, "").replace(/\/$/, "");
        out.push({ route, body: pageText(withoutCorrections(readFileSync(p, "utf-8"))) });
      }
    }
  };
  walk(DIST);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/** The app's usage screen, named in a context where a reader is sizing bytes. */
const SCREEN_MENTION = /\bPlan Usage\b|\bcheck\s+(?:\*\*)?Usage(?:\*\*)?\b/i;

/** Either honest form. Both are published today; neither is a phrase a defect would contain. */
const DISCLAIMER = /counts model runs, not bytes|no screen in the app shows (?:your|a) byte count/i;

/** The two defect spellings, and the two corrected ones, exactly as they were/are published. */
const PRE_FIX = [
  "Check Usage for your own figures.",
  "Check your own numbers in the dashboard's Plan Usage panel.",
];
const POST_FIX = [
  "Don't look for the answer in the app: its Plan Usage panel counts model runs, not bytes. " +
    "Size it from your data instead — the meter counts what an upload writes after normalization.",
  "That card counts model runs, not bytes, and no screen in the app shows a byte count today.",
];

describe("no page sends a reader into the app for a byte figure (landing#663)", () => {
  it("has a built site to read", () => {
    expect(existsSync(DIST), "run `npm run build` first").toBe(true);
    expect(builtPages().length).toBeGreaterThan(100);
  });

  it("the matcher catches both defect spellings and clears both corrected ones", () => {
    for (const s of PRE_FIX) {
      expect(SCREEN_MENTION.test(s), `pre-fix not selected: ${s}`).toBe(true);
      expect(DISCLAIMER.test(s), `pre-fix wrongly reads as disclaimed: ${s}`).toBe(false);
    }
    for (const s of POST_FIX) {
      expect(DISCLAIMER.test(s), `corrected copy not recognised: ${s}`).toBe(true);
    }
    // The corrected copy still NAMES the panel — which is exactly why this guard is a
    // conditional and not a ban. Pin that, so nobody "simplifies" it into one.
    expect(SCREEN_MENTION.test(POST_FIX[0])).toBe(true);
  });

  it("the condition actually selects pages (anti-vacuity)", () => {
    const mentioning = builtPages().filter((p) => SCREEN_MENTION.test(p.body)).map((p) => p.route);
    // Zero would make the rule below vacuously true across the whole site and prove nothing.
    expect(mentioning.length, `expected the byte-cost posts; got ${mentioning.join(", ")}`)
      .toBeGreaterThanOrEqual(2);
  });

  it("every page that names the usage screen also says it does not show bytes", () => {
    const bad = builtPages()
      .filter((p) => SCREEN_MENTION.test(p.body) && !DISCLAIMER.test(p.body))
      .map((p) => {
        const m = p.body.match(SCREEN_MENTION)!;
        const at = p.body.indexOf(m[0]);
        return `${p.route}: "…${p.body.slice(Math.max(0, at - 90), at + 110)}…"`;
      });
    expect(bad, bad.join("\n")).toEqual([]);
  });

  /**
   * Second claim, same family: #410 fixed `datanikaBill()` to return Free at or below 10 GB
   * and fixed the preset label, but the prose describing the calculator kept saying it picks
   * "Pro or Enterprise" — wrong at the bottom of the range the same sentence states.
   */
  it("copy describing the calculator's tier pick names Free", () => {
    const pages = new Map(builtPages().map((p) => [p.route, p]));
    for (const route of ["/why-cheaper", "/blog/pricing-v2-math-and-why"]) {
      const page = pages.get(route);
      expect(page, `${route} did not build`).toBeTruthy();
      expect(page!.body, `${route} describes the tier pick without naming Free`)
        .toContain("Free up to 10 GB");
    }
  });
});
