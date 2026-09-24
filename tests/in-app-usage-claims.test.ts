import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, sep } from "path";

/**
 * Guardrail: a page that points a reader at the in-app usage screen for a **byte figure** must
 * qualify what they will find there (landing#663, landing#688, datanika-core#1513).
 *
 * ## 🔁 REPOINTED 2026-09-24 — the premise changed, the defect class did not
 *
 * This guard used to assert that no page sends a reader into the app for a byte figure *at all*,
 * because no screen showed one. Its own flip condition said to delete the conditional in the PR
 * that makes it false. **`WORKFLOW_RULES` §5a is the stronger rule — a guard whose instance goes
 * stale is repointed at the invariant, never deleted** — and there is an invariant here, because
 * the new screen fails in the same direction as the old absence:
 *
 * - **Before:** an unconditional promise about a screen that did not exist.
 * - **Now:** an unconditional promise about a screen that is **data-conditional**.
 *   `_volume_dimension()` is gated on `DashboardState.has_volume_data` and the card on
 *   `has_any_usage_data` — data conditions, not the `datanika_dual_mode_ux_enabled` flag. An org
 *   that has not run a pipeline still sees nothing.
 *
 * Same sentence shape, same reader, same disappointment. So the rule keeps its shape — *mention
 * the screen in a byte context ⇒ carry a qualifier* — and only the qualifier moved.
 *
 * ## What shipped, and the limit of the evidence it rests on
 *
 * core `master` `8a1c21c7` + cloud `master` `995a8c50`, deployed 2026-09-24, verified by Infra on
 * the **serving container** with both halves together (`datanika-core#1513`, AC9 comment):
 * 12 `bytes_*` attributes on `DashboardState`; `datanika_cloud` resolving inside the image;
 * all nine locales substituting `quota.volume_usage` / `volume_overage` / `volume_quota_reached_body`
 * with `missing=0` and matching placeholder sets.
 *
 * ⚠️ **Infra scoped what it did NOT do, and the copy is written to that scope:** it did not render
 * the dashboard in a browser for an org with real byte usage — a token and import scan cannot prove
 * reachability for a given org. **So the copy points at the screen's existence and its data
 * condition, never at a figure a particular reader will see.**
 *
 * ## 🚦 Next flip condition — name it, so this does not rot a second time
 *
 * If QA or Product renders the dimension for an org with real byte usage **and** the card stops
 * being data-conditional, the qualifier requirement below is the thing to re-decide — in the PR
 * that makes it false, with the retired-claims test extended by one entry rather than emptied.
 *
 * ## Why this asserts a PRESENCE and not an absence
 *
 * The corrected copy has to NAME the panel in order to qualify it. A ban on the phrase would go red
 * on the fix and green on a page that simply stops discussing cost, which is worse than the original
 * defect: a reader sizing a bill would get no warning at all. The one place an *absence* is asserted
 * — the retired claims — carries a control proving the dated notes still contain them, because a
 * correction that stops naming what it retracts is a gutted note, not a clean page.
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
 * A dated correction or update, as the posts write it. Removed before the rules below run: a
 * footnote must not be able to rescue a body that still gives a bare instruction, and — the other
 * direction, which is why `Update` joined `Correction` here — a dated note recording that a claim
 * *used to* be true must not trip the retired-claims assertion. A note has to name the claim it
 * retracts; that is the whole job of a note.
 */
const DATED_NOTE = /^\s*(?:Correction|Update), \d{4}-\d{2}-\d{2}\./;

function withoutDatedNotes(html: string): string {
  return html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/g, (whole, inner: string) =>
    DATED_NOTE.test(pageText(inner)) ? " " : whole,
  );
}

interface Page {
  route: string;
  /** Page text with dated notes removed — what the rules below quantify over. */
  body: string;
  /** Page text with the dated notes still in it. */
  full: string;
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
        const html = readFileSync(p, "utf-8");
        out.push({ route, body: pageText(withoutDatedNotes(html)), full: pageText(html) });
      }
    }
  };
  walk(DIST);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * The app's usage screen, named in a context where a reader is sizing bytes. Both branches are
 * fed a real published sample by the control below — an alternation branch nothing exercises is a
 * dead pattern, and a dead pattern contributes a zero that reads like safety.
 *
 * ⚠️ **`Plan Usage` is the app's own label, and it is not ours to reword.** The first draft of
 * this change called it "the dashboard's usage card"; `phantom-nav-instructions.test.ts` refused
 * it, correctly — that file exists to stop us naming surfaces that do not exist, and renaming a
 * real one is the same defect written politely.
 */
const SCREEN_MENTION = /\bPlan Usage\b|\bcheck\s+(?:\*\*)?Usage(?:\*\*)?\b/i;

/**
 * The qualifier the screen's data condition requires. Two spellings, so a rewording of one sentence
 * does not red-light correct copy — the property is *"the page says what makes the figure appear"*,
 * not either sentence.
 */
const QUALIFIER =
  /appears once a pipeline has written volume data|nothing to read there before your first run/i;

/**
 * The two qualifiers core#1513 retired. Both were true until the 2026-09-24 deploy and are false
 * now, so they belong only inside a dated note.
 *
 * ⚠️ **Tense-tolerant on purpose.** The dated notes put the claim in the past — *"that panel
 * counted model runs"* — and a present-tense-only matcher would read those notes as clean, which
 * would make the control below report zero and the absence test vacuous. The licence to say this
 * comes from the note's date, not from its grammar.
 */
const RETIRED =
  /count(?:s|ed) model runs, not bytes|no screen in the app show(?:s|ed) (?:your |a )?byte count/i;

/** The original unqualified instruction, live until 2026-09-22 — what this guard was built for. */
const DEFECT_COPY = [
  "Check Usage for your own figures.",
  "Check your own numbers in the dashboard's Plan Usage panel.",
];

/** Exactly as published from 2026-09-22 until this flip — the population that must now be refused. */
const RETIRED_COPY = [
  "Don't take that on trust, and don't look for the answer in the app: its Plan Usage panel " +
    "counts model runs, not bytes. Size it from your data instead — the meter counts what an " +
    "upload writes after normalization.",
  "Don't look for the answer in the app: its Plan Usage panel counts model runs, not bytes. " +
    "Size it from your data instead — the meter counts what an upload writes after normalization.",
];

/** Exactly as published by this change — the population that must now be accepted. */
const RESTORED_COPY = [
  "Don't take that on trust: since 2026-09-24 the dashboard's Plan Usage panel carries a bytes " +
    "processed dimension against your plan's included volume. It appears once a pipeline has " +
    "written volume data, so there is nothing to read there before your first run.",
  "Since 2026-09-24 the dashboard's Plan Usage panel carries a bytes processed dimension against " +
    "your plan's included volume; it appears once a pipeline has written volume data, so there " +
    "is nothing to read there before your first run.",
];

describe("copy about the in-app byte figure (landing#688, datanika-core#1513)", () => {
  it("has a built site to read", () => {
    expect(existsSync(DIST), "run `npm run build` first").toBe(true);
    expect(builtPages().length).toBeGreaterThan(100);
  });

  it("the matchers answer all three generations of this copy DIFFERENTLY", () => {
    // Driving a guard with one population only proves it can say something. Three populations,
    // answered differently, is what proves it discriminates (coordinator rule 10).
    for (const s of DEFECT_COPY) {
      // The original defect: names the screen, qualifies nothing, and asserts nothing retired.
      expect(SCREEN_MENTION.test(s), `defect copy not selected: ${s}`).toBe(true);
      expect(QUALIFIER.test(s), `defect copy wrongly reads as qualified: ${s}`).toBe(false);
      expect(RETIRED.test(s), `defect copy wrongly reads as a retired claim: ${s}`).toBe(false);
    }
    for (const s of RETIRED_COPY) {
      expect(SCREEN_MENTION.test(s), `retired copy not selected: ${s}`).toBe(true);
      expect(QUALIFIER.test(s), `retired copy wrongly reads as qualified: ${s}`).toBe(false);
      expect(RETIRED.test(s), `retired matcher blind to its own subject: ${s}`).toBe(true);
    }
    for (const s of RESTORED_COPY) {
      expect(SCREEN_MENTION.test(s), `restored copy not selected: ${s}`).toBe(true);
      expect(QUALIFIER.test(s), `restored copy not recognised as qualified: ${s}`).toBe(true);
      expect(RETIRED.test(s), `restored copy wrongly reads as retired: ${s}`).toBe(false);
    }
  });

  it("the condition actually selects pages (anti-vacuity)", () => {
    const mentioning = builtPages().filter((p) => SCREEN_MENTION.test(p.body)).map((p) => p.route);
    // Zero would make the rule below vacuously true across the whole site and prove nothing.
    expect(mentioning.length, `expected the byte-cost posts; got ${mentioning.join(", ")}`)
      .toBeGreaterThanOrEqual(2);
  });

  it("every page that names the usage screen says what makes the byte figure appear", () => {
    const bad = builtPages()
      .filter((p) => SCREEN_MENTION.test(p.body) && !QUALIFIER.test(p.body))
      .map((p) => {
        const m = p.body.match(SCREEN_MENTION)!;
        const at = p.body.indexOf(m[0]);
        return `${p.route}: "…${p.body.slice(Math.max(0, at - 90), at + 110)}…"`;
      });
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("no page still publishes a claim core#1513 retired, outside a dated note", () => {
    const bad = builtPages()
      .filter((p) => RETIRED.test(p.body))
      .map((p) => {
        const at = p.body.search(RETIRED);
        return `${p.route}: "…${p.body.slice(Math.max(0, at - 90), at + 110)}…"`;
      });
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("the dated notes still name the claim they retract (control for the test above)", () => {
    // Without this, the assertion above is satisfied by a note that stopped saying what was wrong —
    // which is worse than the stale claim, because the reader gets no account of the change at all.
    // It also proves `withoutDatedNotes` is doing the stripping rather than the text being absent.
    const inNotes = builtPages().filter((p) => RETIRED.test(p.full) && !RETIRED.test(p.body));
    expect(
      inNotes.map((p) => p.route),
      "no built page carries a retired claim inside a dated note — either the corrections were " +
        "gutted, or the note format changed and DATED_NOTE no longer matches it",
    ).toHaveLength(2);
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
