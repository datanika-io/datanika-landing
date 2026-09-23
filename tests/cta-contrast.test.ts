/**
 * Text on a gradient: the contrast class axe structurally cannot report (landing#665).
 *
 * axe's `color-contrast` rule resolves ONE background colour and compares. A gradient
 * has no resolved colour, so axe marks the node `incomplete` or skips it — it does not
 * fail it. [landing#611] swept all 171 built pages and closed clean while the primary
 * CTA on the home page failed AA across 100% of its width, best point 4.23:1 and worst
 * 2.43:1. **A clean sweep is a statement about what the instrument can see**, and the
 * most prominent control on the marketing site sat in that instrument's blind spot.
 *
 * So this file does not ask axe. It samples the interpolation and asserts the WORST
 * point, which is the only number that means anything for a gradient.
 *
 * Two things it deliberately does NOT do:
 *
 *  - It does not name `.btn-primary`. The rule set is DERIVED from the built stylesheet
 *    (every rule that declares both a gradient background and a text colour), because a
 *    guard that names an instance is blind to the next one. That is not hypothetical
 *    here: the issue named one class, and deriving the set found two more — the
 *    "Most Popular" and step-number badges, at 1.81:1, worse than the CTA and in
 *    `text-xs` where there is no large-text exemption.
 *  - It does not skip a stop it cannot parse. A reducer that returns nothing for a shape
 *    it does not understand hands that shape to its caller as clean. An unparseable
 *    gradient is a failure, loudly.
 *
 * Controls, because a passing check is not evidence until you have seen it fail AND
 * seen that it can see:
 *   C1  the arithmetic reproduces the WCAG boundary pairs (#000/#fff = 21.00,
 *       #767676/#fff = 4.54) before any site number is read;
 *   C2  anti-vacuity — the derivation must select at least two rules, or a broken
 *       selector reports "0 violations" exactly like a clean site;
 *   C3  🔑 the analyser must SAY NO. The real pre-fix declaration (`color:#fff` on the
 *       brand gradient) is fed back through the same function and must be reported as a
 *       failure at 2.43:1. Without C3 this file would keep passing if the parser ever
 *       stopped finding the colour and silently compared white to white.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/** The page background every one of these sits on (body{background-color}). */
const PAGE_BG = "#0a0a0f";
const AA_NORMAL = 4.5;
const SAMPLES = 101;

// ─────────────────────────── colour + WCAG ───────────────────────────

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // ignore alpha; see the opacity note below
  if (!/^[0-9a-f]{6}$/.test(h)) throw new Error(`unparseable colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance([r, g, b]: RGB): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrast(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Worst contrast of `fg` against any point of the gradient `stops`.
 *
 * Interpolation is sRGB, which is what a legacy `linear-gradient()` with no
 * `in <colorspace>` uses. Every gradient this site hand-writes is that form; the
 * derivation below rejects anything else rather than guessing.
 */
function worstAcrossGradient(fg: RGB, stops: RGB[]): { ratio: number; at: number } {
  let worst = { ratio: Infinity, at: 0 };
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const span = 1 / (stops.length - 1);
    const seg = Math.min(stops.length - 2, Math.floor(t / span));
    const local = (t - seg * span) / span;
    const mix = [0, 1, 2].map(
      (c) => stops[seg][c] + (stops[seg + 1][c] - stops[seg][c]) * local
    ) as RGB;
    const ratio = contrast(fg, mix);
    if (ratio < worst.ratio) worst = { ratio, at: t };
  }
  return worst;
}

// ─────────────────────── derive the rules from dist ───────────────────────

interface GradientRule {
  selector: string;
  color: string | null;
  stops: string[];
  gradientIsText: boolean;
}

/** Innermost CSS blocks only — `[^{}]*` cannot span a nested brace. */
function parseGradientRules(css: string): GradientRule[] {
  const out: GradientRule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].split(/[{}]/).pop()!.trim();
    const body = m[2];
    const grad = body.match(/linear-gradient\(([^()]*(?:\([^()]*\)[^()]*)*)\)/);
    if (!grad) continue;
    const colorDecl = body.match(/(?:^|;)\s*color:\s*([^;]+)/);
    const gradientIsText = /-webkit-text-fill-color:\s*transparent/.test(body);
    if (!colorDecl && !gradientIsText) continue; // paints no text: not this rule's business
    out.push({
      selector,
      color: colorDecl ? colorDecl[1].trim() : null,
      stops: [...grad[1].matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((s) => s[0]),
      gradientIsText,
    });
  }
  return out;
}

function loadDistCss(): string {
  if (!existsSync(DIST)) {
    throw new Error(
      "dist/ is absent. This guard reads the artifact a visitor receives, so it " +
        "must not pass by being unable to look. Run `npm run build` first."
    );
  }
  const dir = resolve(DIST, "_astro");
  const files = readdirSync(dir).filter((f) => f.endsWith(".css"));
  expect(files.length, "no stylesheet in dist/_astro").toBeGreaterThan(0);
  return files.map((f) => readFileSync(resolve(dir, f), "utf8")).join("\n");
}

// ─────────────────────────────── the guard ───────────────────────────────

describe("text on a gradient clears WCAG AA at every point", () => {
  const css = loadDistCss();
  const rules = parseGradientRules(css);
  const painted = rules.filter((r) => r.color && !r.gradientIsText);

  it("C1 the arithmetic reproduces the WCAG boundary pairs", () => {
    expect(contrast(hexToRgb("#000"), hexToRgb("#fff"))).toBeCloseTo(21.0, 2);
    expect(contrast(hexToRgb("#767676"), hexToRgb("#fff"))).toBeCloseTo(4.54, 2);
    expect(contrast(hexToRgb("#fff"), hexToRgb("#fff"))).toBeCloseTo(1.0, 2);
  });

  it("C2 the derivation selects a real set (anti-vacuity)", () => {
    // A selector that matches nothing reports zero violations exactly like a clean
    // site. Two is the measured floor: .btn-primary and .badge-gradient.
    expect(
      painted.length,
      `derived only ${painted.length} text-on-gradient rules from dist/ — ` +
        `the parser has stopped seeing them, so a pass below means nothing`
    ).toBeGreaterThanOrEqual(2);
  });

  it("C3 the analyser reports a KNOWN failure as a failure", () => {
    // The exact pre-fix declaration. If this ever comes back green, the analyser has
    // gone blind and every other assertion in this file is void.
    const preFix = worstAcrossGradient(hexToRgb("#ffffff"), [
      hexToRgb("#8b5cf6"),
      hexToRgb("#06b6d4"),
    ]);
    expect(preFix.ratio).toBeLessThan(AA_NORMAL);
    expect(preFix.ratio).toBeCloseTo(2.43, 1);
    // ...and the fix's own value, so the two are pinned apart rather than only "below".
    const fixed = worstAcrossGradient(hexToRgb(PAGE_BG), [
      hexToRgb("#8b5cf6"),
      hexToRgb("#06b6d4"),
    ]);
    expect(fixed.ratio).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(fixed.ratio).toBeCloseTo(4.66, 1);
  });

  it("every gradient stop in a text-painting rule is parseable", () => {
    for (const r of painted) {
      // Not a skip. An unreadable stop is a rule this guard cannot judge, and a rule
      // it cannot judge must not be reported as clean.
      expect(
        r.stops.length,
        `${r.selector}: gradient stops are not plain hex (${r.stops.length} found). ` +
          `Teach this guard the new form — do not let it pass unexamined.`
      ).toBeGreaterThanOrEqual(2);
      expect(() => r.stops.map(hexToRgb), `${r.selector}: unparseable stop`).not.toThrow();
      expect(() => hexToRgb(r.color!), `${r.selector}: unparseable color`).not.toThrow();
    }
  });

  it("no rule paints text below 4.5:1 anywhere along its gradient", () => {
    const report: string[] = [];
    for (const r of painted) {
      const w = worstAcrossGradient(hexToRgb(r.color!), r.stops.map(hexToRgb));
      report.push(
        `${r.selector}  color:${r.color}  worst ${w.ratio.toFixed(2)}:1 at ${(w.at * 100).toFixed(0)}%`
      );
      expect(
        w.ratio,
        `${r.selector} paints ${r.color} on a gradient whose worst point is ` +
          `${w.ratio.toFixed(2)}:1 (at ${(w.at * 100).toFixed(0)}% along it). ` +
          `AA needs ${AA_NORMAL}:1. axe cannot see this — that is why the guard exists.`
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
    // Printed so a green run says WHICH rules were judged, not merely that none failed.
    console.log("  text-on-gradient rules judged:\n    " + report.join("\n    "));
  });

  it("a gradient used AS text clears AA against the page background", () => {
    // .gradient-text is the mirror case: the gradient is the ink, #0a0a0f is the paper.
    // Different criterion, same arithmetic — and it passes at 4.66:1, so it is recorded
    // as measured rather than assumed.
    const asText = rules.filter((r) => r.gradientIsText);
    expect(asText.length, "no gradient-as-text rule found — parser drift").toBeGreaterThanOrEqual(1);
    for (const r of asText) {
      const w = worstAcrossGradient(hexToRgb(PAGE_BG), r.stops.map(hexToRgb));
      expect(
        w.ratio,
        `${r.selector} is ink at ${w.ratio.toFixed(2)}:1 on ${PAGE_BG}`
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("the built stylesheet carries no white-on-brand-gradient rule", () => {
    // The specific regression, pinned affirmatively: the brand gradient must never
    // again be declared with a near-white label. Anchored to the gradient, so it
    // cannot be satisfied by prose or by deleting the rule (C2 catches deletion).
    for (const r of painted) {
      const isBrand = r.stops.join(",").toLowerCase().includes("#8b5cf6");
      if (!isBrand) continue;
      const lum = luminance(hexToRgb(r.color!));
      expect(
        lum,
        `${r.selector} labels the brand gradient with ${r.color}, which is light ` +
          `(luminance ${lum.toFixed(3)}). Both ends of that gradient are light too.`
      ).toBeLessThan(0.2);
    }
  });
});
