import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, join } from "path";

// Regression coverage for #109 — every Start free / Get started / Try
// free / Get Started Free CTA on the site must use <ConversionCTA>, not
// a plain <a>.
//
// ⚠️ That rule's ORIGINAL reason is gone: the sweep existed so the Google Ads
// conversion event would fire on every CTA, and landing#481 removed the tag
// because it contradicted /privacy section 8. The rule is kept on a different
// and still-live reason — every signup CTA goes through ONE component, which is
// the single place CTA-level measurement is attached (Plausible today) and the
// single place any future tag would go. Written down because a rule whose reason
// has silently expired is the kind that gets deleted by the next person to ask
// why it exists.
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

  // landing#481 — these four assertions used to require the Google Ads half of
  // this component. They are inverted rather than deleted, so re-adding the tag
  // fails here as well as in tests/no-advertising-tag.test.ts, and so the reason
  // it went is readable from the file that used to demand it.
  it("reads no Google Ads conversion label", () => {
    expect(source).not.toContain("PUBLIC_GOOGLE_ADS_CONVERSION_LABEL");
  });

  it("emits no gtag conversion event", () => {
    expect(source).not.toMatch(/\bgtag\s*\(/);
    expect(source).not.toContain("data-gtag-send-to");
  });

  it("carries no Google Ads account ID", () => {
    expect(source).not.toMatch(/\bAW-\d{6,}\b/);
  });

  it("still renders a plain <a> when no plausibleEvent is supplied", () => {
    // The fallback survives the removal: Astro drops an attribute whose value is
    // undefined, so a CTA without an event name is an ordinary anchor and the
    // click handler's selector does not match it — no interception, no 50 ms
    // navigation delay. Previously those anchors were intercepted anyway,
    // because the gtag attribute was always present in a production build.
    expect(source).toMatch(/data-plausible-event=\{plausibleEvent \|\| undefined\}/);
  });

  it("the click handler matches on the Plausible attribute alone", () => {
    expect(source).toContain('"a[data-plausible-event]"');
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

// ---------------------------------------------------------------------------
// A signup CTA must land on a page a SIGNED-OUT visitor can use.
//
// Measured 2026-09-05 on production: `https://app.datanika.io` is the
// authenticated dashboard. Reflex's `check_auth` runs on its `on_load`, finds
// no session, and issues `rx.redirect("/login")` — so a visitor who clicked
// "Get Started Free" was shown *"Sign in to your account"* and a password box
// for an account they do not have. 23 of the site's 24 signup CTAs pointed
// there; `compare/stitch.astro` was the only one already pointing at /signup.
//
// The rule this encodes is the class, not the instance: **the destination of a
// signup CTA must be reachable without an account.** The bare root is merely
// the way we got it wrong — `/`, `/connections`, `/pipelines` and every other
// `check_auth` page would be the same defect. So the assertion is an allowlist
// of signed-out-usable destinations, not a ban on one string.
//
// Deliberately source-level and deliberately NOT a substring ban on
// "https://app.datanika.io": /terms, /docs/self-hosting and the three
// `--url` config samples in /docs/mcp-server legitimately name the bare origin
// in prose, and a ban wide enough to catch the CTAs would also catch those.
const SIGNED_OUT_USABLE = [
  "https://app.datanika.io/signup",
  // A template deep-link is a different intent and lands on the app's own
  // template picker, which is fine to reach cold; it is built from a variable
  // (`tryTemplateHref`), so it never appears as a literal href here anyway.
  "https://app.datanika.io/pipelines/templates",
];

// Any ConversionCTA whose href is a literal app URL. Covers both the one-line
// form (`<ConversionCTA href="…"`) and the multi-line form Pricing.astro uses,
// where the href sits on its own line inside the tag.
const CTA_APP_HREF = /<ConversionCTA\b[^>]*?href=["'](https?:\/\/app\.datanika\.io[^"']*)["']/gs;

describe("Signup CTA destination — must be usable without an account", () => {
  const allFiles = walkAstroFiles(SRC);

  it.each(allFiles)("%s sends every signup CTA to a signed-out page", (file) => {
    const text = readFileSync(file, "utf-8");
    const bad: string[] = [];
    for (const m of text.matchAll(CTA_APP_HREF)) {
      const href = m[1];
      if (!SIGNED_OUT_USABLE.some((ok) => href === ok || href.startsWith(ok + "?"))) {
        bad.push(href);
      }
    }
    expect(
      bad,
      `ConversionCTA in ${file} points at a page that requires an account: ` +
        `${bad.join(", ")}. A signed-out visitor is redirected to /login there. ` +
        `Use https://app.datanika.io/signup.`,
    ).toEqual([]);
  });

  it("the site actually has signup CTAs to check (guard against a vacuous pass)", () => {
    // Without this the suite above passes just as happily on a site with no
    // CTAs at all — the failure mode the whole file exists to prevent.
    const total = allFiles
      .map((f) => [...readFileSync(f, "utf-8").matchAll(CTA_APP_HREF)].length)
      .reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(20);
  });
});
