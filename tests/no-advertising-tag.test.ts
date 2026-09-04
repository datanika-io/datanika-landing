/**
 * landing#481 — a page may not assert "no advertising cookies" while shipping an
 * advertising tag.
 *
 * What happened: `/privacy` section 8 said, in print, *"We do not use tracking
 * cookies, analytics cookies, or third-party advertising cookies"* while
 * `Layout.astro` loaded `googletagmanager.com/gtag/js?id=AW-…` unconditionally.
 * Because the layout is shared, that was true of 101 of 165 built pages —
 * including `/privacy` itself, the page making the claim. It was live.
 *
 * Why nothing caught it. `legal-pages-facts.test.ts` holds `/privacy` and
 * `/trust` consistent with **each other**; `legal-pages-commercial-claims.test.ts`
 * reads `<main>` only, deliberately, so navbar and footer chrome cannot satisfy an
 * assertion. Both are correct and both are structurally blind here, because the
 * contradicting evidence was in `<head>`. Same shape as landing#343 one level out:
 * **a guard scoped to a region of the page is blind to every other region.**
 *
 * So this file is scoped to the whole built document, and it asserts the
 * invariant rather than the phrasing: for every built page, the claim and an
 * advertising tag must not co-occur — plus the stronger form that actually holds
 * today, which is that no built page ships one at all.
 *
 * ⚠️ Do not narrow this to a Google-specific string. The point is the class of
 * change, not the vendor: any tag that would make section 8 false has to be
 * caught, and the legal pages have to move in the same commit.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative } from "path";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const SRC = resolve(ROOT, "src");

/**
 * The COMPLETE set of third-party origins this site may load a script from.
 *
 * An allowlist rather than a blocklist, because a blocklist only catches vendors
 * someone thought to enumerate — and the next tracker added here will be one
 * nobody listed. Both entries are cookie-free, which is what makes section 8 true
 * as written; adding a third entry is a legal-page change, not a build change.
 */
const ALLOWED_SCRIPT_ORIGINS = new Set([
  "plausible.datanika.io",
  "static.cloudflareinsights.com",
]);

/** `<script src="https://host/…">`, protocol-relative `//host/…` included. */
const SCRIPT_SRC_RE = /<script[^>]*\ssrc=["'](?:https?:)?\/\/([^/"'?#]+)/gi;

/**
 * Executable advertising markers, each anchored to a form only CODE can take.
 *
 * 🚨 Never match a bare hostname here. `google-analytics` as a plain substring
 * appears on 8 built pages today and every one of them is our own
 * `/connectors/google-analytics` URL — a hostname match would fail on our own
 * catalogue. Measured before this file was written, not assumed. The negative
 * control at the bottom pins exactly that.
 *
 * `sample` is not documentation: each one is fed to its own regex below, so a
 * marker that has rotted into matching nothing fails loudly instead of
 * contributing a reassuring zero.
 */
const AD_MARKERS: { name: string; re: RegExp; sample: string }[] = [
  {
    name: "Google gtag/GTM loader",
    // /gtag/js is a SLASH; /gtm.js is a DOT. `(?:gtag|gtm)\.js` matched neither,
    // and the sweep it fed reported zero hits on a build that had 101 of them.
    re: /googletagmanager\.com\/(?:gtag\/js|gtm\.js)/i,
    sample: '<script async src="https://www.googletagmanager.com/gtag/js?id=AW-18081528527"></script>',
  },
  {
    name: "gtag() call",
    re: /\bgtag\s*\(/,
    sample: "gtag('config', 'AW-18081528527');",
  },
  {
    name: "GTM dataLayer",
    re: /\bdataLayer\s*(?:=|\.push)/,
    sample: "window.dataLayer = window.dataLayer || [];",
  },
  {
    name: "Google Ads conversion ID",
    re: /\bAW-\d{6,}\b/,
    sample: "send_to: 'AW-18081528527/AbCdEf'",
  },
  {
    name: "GA4 measurement ID, quoted as a config value",
    re: /["']G-[A-Z0-9]{8,}["']/,
    sample: "gtag('config', 'G-ABCDEFGHIJ');",
  },
  {
    name: "Universal Analytics loader",
    re: /google-analytics\.com\/(?:analytics|ga|gtag)\.js/i,
    sample: '<script src="https://www.google-analytics.com/analytics.js"></script>',
  },
  {
    name: "Google remarketing / display network",
    re: /googleadservices\.com|googlesyndication\.com|doubleclick\.net/i,
    sample: '<script src="https://www.googleadservices.com/pagead/conversion.js"></script>',
  },
  {
    name: "Meta Pixel",
    re: /connect\.facebook\.net|\bfbq\s*\(/i,
    sample: "fbq('track', 'PageView');",
  },
  {
    name: "LinkedIn Insight Tag",
    re: /snap\.licdn\.com|_linkedin_partner_id/i,
    sample: "_linkedin_partner_id = \"1234567\";",
  },
  {
    name: "Microsoft/Bing UET",
    re: /bat\.bing\.com/i,
    sample: '<script src="https://bat.bing.com/bat.js"></script>',
  },
  {
    name: "X/Twitter pixel",
    re: /static\.ads-twitter\.com|analytics\.twitter\.com/i,
    sample: '<script src="https://static.ads-twitter.com/uwt.js"></script>',
  },
  {
    name: "TikTok pixel",
    re: /analytics\.tiktok\.com/i,
    sample: '<script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>',
  },
  {
    name: "Reddit pixel",
    re: /redditstatic\.com\/ads/i,
    sample: '<script src="https://www.redditstatic.com/ads/pixel.js"></script>',
  },
];

/**
 * The two published sentences this file protects, as they appear in the built
 * HTML. Both are asserted to still exist — a claim that quietly disappears would
 * make every co-occurrence assertion below vacuously true.
 */
const CLAIMS = [
  {
    page: "privacy/index.html",
    text: "third-party advertising",
    quote:
      'We do not use tracking cookies, analytics cookies, or third-party advertising cookies.',
  },
  {
    page: "trust/index.html",
    text: "No third-party tracking",
    quote: '/trust sub-processor table, Analytics row: "No third-party tracking."',
  },
];

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (extname(entry) === ".html") out.push(full);
  }
  return out;
}

function originsIn(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(SCRIPT_SRC_RE)) out.push(m[1].toLowerCase());
  return out;
}

describe("no built page ships an advertising tag (landing#481)", () => {
  const pages = existsSync(DIST) ? walkHtml(DIST) : [];
  const read = new Map<string, string>();
  for (const p of pages) read.set(p, readFileSync(p, "utf-8"));

  // ---------------------------------------------------------------- controls

  it("dist/ exists and holds a plausible number of pages", () => {
    // A walk that finds nothing reports zero violations, which reads exactly
    // like a clean sweep. Landing builds ~162 routes.
    expect(pages.length, "run `npm run build` first").toBeGreaterThan(100);
  });

  it("every marker still matches its own sample (guards a marker that matches nothing)", () => {
    // A regex that has rotted contributes a zero indistinguishable from safety.
    const dead = AD_MARKERS.filter((m) => !m.re.test(m.sample)).map((m) => m.name);
    expect(dead, `these markers no longer match their own sample: ${dead.join(", ")}`).toEqual([]);
  });

  it("the script-origin extractor actually finds the origins we do load", () => {
    // If SCRIPT_SRC_RE stopped matching, "no disallowed origin" would pass on a
    // page full of them. Both allowlisted origins are on every page carrying the
    // shared layout, so a low count here means the extractor is broken.
    const counts = new Map<string, number>();
    for (const html of read.values()) {
      for (const o of new Set(originsIn(html))) counts.set(o, (counts.get(o) ?? 0) + 1);
    }
    for (const allowed of ALLOWED_SCRIPT_ORIGINS) {
      expect(
        counts.get(allowed) ?? 0,
        `extractor found ${allowed} on ${counts.get(allowed) ?? 0} pages — it should be on most of them`,
      ).toBeGreaterThan(50);
    }
  });

  it.each(CLAIMS)("the claim on /$page is still published (guards a vacuous assertion)", (claim) => {
    // If the sentence is deleted or reworded, the co-occurrence assertions below
    // become true of nothing. That must fail here, loudly, rather than pass there,
    // silently — and it also catches the "amend the page instead" path being taken
    // without this file being revisited.
    const file = resolve(DIST, claim.page);
    expect(existsSync(file), `${claim.page} is not in dist/`).toBe(true);
    expect(
      readFileSync(file, "utf-8"),
      `${claim.page} no longer contains "${claim.text}" — ${claim.quote}`,
    ).toContain(claim.text);
  });

  // -------------------------------------------------------------- assertions

  it("loads scripts only from the allowlisted origins", () => {
    const violations: string[] = [];
    for (const [file, html] of read) {
      for (const origin of new Set(originsIn(html))) {
        if (!ALLOWED_SCRIPT_ORIGINS.has(origin)) {
          violations.push(`${relative(ROOT, file)} -> ${origin}`);
        }
      }
    }
    expect(
      violations,
      "A third-party script origin appeared that is not on the allowlist. If it is an " +
        "advertising or analytics vendor, /privacy section 8 and the /trust Analytics row " +
        "must change in the SAME commit — see landing#481. If it is genuinely cookie-free " +
        "and disclosed, add it to ALLOWED_SCRIPT_ORIGINS with the reason.\n" +
        violations.join("\n"),
    ).toEqual([]);
  });

  it("contains no advertising-tag code, on any page", () => {
    const violations: string[] = [];
    for (const [file, html] of read) {
      for (const marker of AD_MARKERS) {
        if (marker.re.test(html)) violations.push(`${relative(ROOT, file)} -> ${marker.name}`);
      }
    }
    expect(violations, `advertising code found in the build:\n${violations.join("\n")}`).toEqual([]);
  });

  it.each(CLAIMS)("/$page does not both make its claim and ship a tag", (claim) => {
    // Stated separately from the sweep above so the failure names the legal page.
    // It also survives a future decision to allow a tag on marketing pages only:
    // the pages that make the claim would still have to be clean.
    const file = resolve(DIST, claim.page);
    if (!existsSync(file)) return; // the control above already failed
    const html = readFileSync(file, "utf-8");
    if (!html.includes(claim.text)) return; // ditto
    const hits = AD_MARKERS.filter((m) => m.re.test(html)).map((m) => m.name);
    expect(
      hits,
      `${claim.page} publishes "${claim.text}" and ships ${hits.join(", ")} on the same page`,
    ).toEqual([]);
  });

  it("no marker matches our own catalogue references (false-positive control)", () => {
    // The false positive this file was designed around: `google-analytics` as a
    // bare substring is on 8 built pages and every one of them is our own
    // /connectors/google-analytics URL. A marker loosened to a hostname would
    // fail on correct copy, and a guard that cries wolf gets deleted rather than
    // narrowed.
    //
    // ⚠️ Scoped to the REFERENCES, not to the pages containing them. An earlier
    // version read the whole built page, which meant it also went red whenever
    // the site genuinely shipped a tag — proven by the mutation harness, where it
    // failed alongside the real violations. That made "a marker is over-broad"
    // indistinguishable from "there is a real tag here", which is the one
    // distinction this control exists to draw.
    //
    // ⚠️ indexOf, not a regex. The first version built
    // `new RegExp(".{0,60}" + name + ".{0,60}", "g")` and ran it over every one
    // of ~165 full HTML documents. That backtracks, took 5116 ms in isolation,
    // and TIMED OUT once 67 test files ran in parallel - failing in a way that
    // reads exactly like the violation it exists to detect. A control that is
    // sometimes slow is not a control.
    const NAMES = ["google-analytics", "google-ads", "facebook-ads"];
    const PAD = 60;
    const windows: string[] = [];
    for (const html of read.values()) {
      for (const name of NAMES) {
        let at = html.indexOf(name);
        while (at !== -1) {
          windows.push(html.slice(Math.max(0, at - PAD), at + name.length + PAD));
          at = html.indexOf(name, at + name.length);
        }
      }
    }
    expect(
      windows.length,
      "no catalogue reference was extracted — the control would pass on anything",
    ).toBeGreaterThan(10);
    const hits = new Set<string>();
    for (const w of windows) {
      for (const marker of AD_MARKERS) if (marker.re.test(w)) hits.add(`${marker.name} <- ${w}`);
    }
    expect(
      [...hits],
      `a marker is matching our own connector copy:\n${[...hits].join("\n")}`,
    ).toEqual([]);
  });
});

describe("the shared layout carries no advertising tag (source side)", () => {
  // dist/ is what we published and is blind to nothing, so it is the primary
  // assertion. This one exists because it names the file to edit, in one line,
  // instead of listing 101 built pages.
  const layout = readFileSync(resolve(SRC, "layouts/Layout.astro"), "utf-8");

  it("Layout.astro loads no gtag/GTM script", () => {
    expect(layout).not.toMatch(/googletagmanager\.com/i);
    expect(layout).not.toMatch(/\bAW-\d{6,}\b/);
  });

  it("Layout.astro still loads the two analytics scripts we do disclose", () => {
    // Without this, deleting Plausible would make the assertion above pass for
    // the wrong reason.
    expect(layout).toContain("plausible.datanika.io/js/script");
    expect(layout).toContain("static.cloudflareinsights.com/beacon");
  });
});
