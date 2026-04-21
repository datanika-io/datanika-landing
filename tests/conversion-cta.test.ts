import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, join } from "path";

// Regression coverage for #109 — every Start free / Get started / Try
// free / Get Started Free CTA on the site must use <ConversionCTA>, not
// a plain <a>, so the Google Ads conversion event fires on click.
//
// We test at the source level (not the built dist) so the test runs
// without depending on a particular build environment or env-var
// fixture. The catch-future-drift sweep walks every .astro source file
// under src/ and finds any "btn-primary" anchor pointing at
// app.datanika.io that is NOT a ConversionCTA — those are missing
// conversion tracking and should be wrapped.
//
// Body-text mentions of /signup or app.datanika.io (in docs prose,
// terms, footer notes) are NOT CTAs and are correctly excluded by the
// btn-primary class filter.

const SRC = resolve(__dirname, "../src");

function walkAstroFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkAstroFiles(full));
    } else if (name.endsWith(".astro")) {
      out.push(full);
    }
  }
  return out;
}

// A "conversion CTA" is a visual button (btn-primary) whose href points
// at the signup app. We don't include /signup body-text links or the
// btn-secondary "View on GitHub" / "View docs" buttons.
const CTA_REGEX =
  /<a[^>]*\bhref=["']https?:\/\/app\.datanika\.io[^"']*["'][^>]*\bclass(?:\:list)?=["'][^"']*\bbtn-primary\b[^"']*["'][^>]*>/g;

describe("ConversionCTA component", () => {
  const ctaPath = resolve(SRC, "components/ConversionCTA.astro");

  it("exists", () => {
    expect(existsSync(ctaPath)).toBe(true);
  });

  const source = readFileSync(ctaPath, "utf-8");

  it("reads PUBLIC_GOOGLE_ADS_CONVERSION_LABEL from import.meta.env", () => {
    expect(source).toContain("import.meta.env.PUBLIC_GOOGLE_ADS_CONVERSION_LABEL");
  });

  it("emits a gtag conversion event on click when label is set", () => {
    // gtag fires from the component's inline <script> block (post-#212
    // sendBeacon refactor) rather than an onclick attribute — the check
    // is the same either way.
    expect(source).toMatch(/gtag\(['"]event['"],\s*['"]conversion['"]/);
  });

  it("uses the AW-18081528527 account ID prefix", () => {
    expect(source).toContain("AW-18081528527");
  });

  it("falls back to plain anchor when label is unset (no data-gtag-send-to attribute)", () => {
    // Post-#212 pattern: data-gtag-send-to={sendTo || undefined} on the
    // rendered <a>. Astro omits attributes whose value is undefined, so
    // when PUBLIC_GOOGLE_ADS_CONVERSION_LABEL is unset the anchor has no
    // send-to and the script's sendGtag() short-circuits. No JS error.
    expect(source).toMatch(/sendTo\s*\|\|\s*undefined/);
  });

  it("uses navigator.sendBeacon for Plausible events (race-free vs XHR — #212)", () => {
    // sendBeacon survives navigation; Plausible's own script.tagged-events.js
    // used XHR+setTimeout which could lose events on click-then-navigate.
    expect(source).toContain("navigator.sendBeacon");
    expect(source).toContain("plausible.datanika.io/api/event");
  });

  it("blocks Plausible's own auto-handler via stopImmediatePropagation", () => {
    // Our capture-phase listener must stop the bubble/target chain so
    // Plausible's script.tagged-events.js click handler does not also
    // fire and double-count the event.
    expect(source).toContain("stopImmediatePropagation");
  });

  it("passes through arbitrary props via {...rest}", () => {
    expect(source).toContain("...rest");
  });

  it("renders children via <slot />", () => {
    expect(source).toContain("<slot />");
  });
});

describe("Conversion CTA usage — every signup CTA must use ConversionCTA", () => {
  // Files that are ALLOWED to contain a btn-primary <a> pointing at
  // app.datanika.io because they ARE the ConversionCTA component itself.
  const ALLOWED_PLAIN_ANCHOR_FILES = new Set<string>([
    join(SRC, "components/ConversionCTA.astro"),
  ]);

  const allFiles = walkAstroFiles(SRC);

  it.each(allFiles)("%s does not have a plain <a> Start-free CTA", (file) => {
    if (ALLOWED_PLAIN_ANCHOR_FILES.has(file)) return;
    const text = readFileSync(file, "utf-8");
    const matches = text.match(CTA_REGEX);
    if (!matches) return;
    // Found at least one btn-primary anchor pointing at the app —
    // these MUST be wrapped in ConversionCTA. The CTA_REGEX matches
    // bare <a>, not ConversionCTA, so any match is a regression.
    expect(matches, `Plain <a> CTA found in ${file}: ${matches.join("\n")}`).toBeNull();
  });

  // Positive coverage — files we know should have at least one
  // ConversionCTA usage. If someone deletes a CTA, this catches it.
  const REQUIRED_CTA_FILES = [
    "components/Hero.astro",
    "components/CtaBanner.astro",
    "components/Navbar.astro",
    "components/Pricing.astro",
    "pages/use-cases/[slug].astro",
    "pages/use-cases/index.astro",
    "pages/connectors/[slug].astro",
    "pages/connectors/index.astro",
    "pages/compare/airbyte.astro",
    "pages/compare/fivetran.astro",
    "pages/compare/hevo.astro",
    "pages/compare/stitch.astro",
    "pages/ai-agents.astro",
  ];

  it.each(REQUIRED_CTA_FILES)("%s imports and uses ConversionCTA", (relPath) => {
    const text = readFileSync(resolve(SRC, relPath), "utf-8");
    expect(text).toContain('import ConversionCTA from');
    expect(text).toContain("<ConversionCTA");
  });
});
