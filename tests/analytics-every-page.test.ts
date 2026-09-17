/**
 * landing#612: every page a visitor can land on loads Plausible, exactly once.
 *
 * What happened. The tag was written into `Layout.astro` alone. `DocsLayout` and
 * `ApiLayout` do not render `Layout`, so every page built on them (the docs, the
 * connector setup guides, the API section) loaded no analytics. Measured on the
 * build of `dev` at de4bd29: 62 of the 172 pages that are not redirect stubs,
 * while the three pages QA used as a control carried the tag. Those are the pages
 * written to be found by search, and a guide nobody visits and a guide nobody can
 * measure both read as zero in the dashboard.
 *
 * So this reads `dist/`, the artifact a visitor receives, and asserts the
 * invariant rather than a list of layouts: a fourth layout that forgets the tag
 * fails here without anyone remembering this file exists.
 *
 * Exactly once, not at least once. Two tags on a page double-count its views.
 *
 * The only pages exempt are the stubs Astro emits for `redirects` in
 * `astro.config.mjs`. They forward before a script could run, and the page they
 * forward to records the visit. The exemption is derived from that config rather
 * than listed here, so it cannot quietly grow to cover a real page.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative, sep } from "path";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const COMPONENT_PATH = "src/components/PlausibleScript.astro";

/** Any `<script>` whose `src` is on the Plausible host. The instrument this file is built on. */
const PLAUSIBLE_TAG_RE = /<script\b[^>]*\ssrc=["'](?:https?:)?\/\/plausible\.datanika\.io\/[^"']*["'][^>]*>/gi;

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`));
  return m ? m[1] : null;
}

function hasBooleanAttr(tag: string, name: string): boolean {
  return new RegExp(`\\s${name}(?=[\\s>/])`).test(tag);
}

function tagsIn(html: string): string[] {
  return html.match(PLAUSIBLE_TAG_RE) ?? [];
}

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (extname(entry) === ".html") out.push(full);
  }
  return out;
}

const rel = (file: string) => relative(DIST, file).split(sep).join("/");

/** The tag every page must carry, read from the one file that writes it. */
const componentSource = readFileSync(resolve(ROOT, COMPONENT_PATH), "utf-8");
const componentTags = tagsIn(componentSource);
const canonical = componentTags.length === 1
  ? { src: attr(componentTags[0], "src"), domain: attr(componentTags[0], "data-domain") }
  : { src: null, domain: null };

/** Source paths of the configured redirects, e.g. `/docs/api`. */
function configuredRedirects(): string[] {
  const config = readFileSync(resolve(ROOT, "astro.config.mjs"), "utf-8");
  const block = config.match(/\bredirects:\s*\{([\s\S]*?)\n\s*\},/);
  if (!block) return [];
  return [...block[1].matchAll(/^\s*["'](\/[^"']+)["']\s*:/gm)].map((m) => m[1]);
}

describe("every built page loads Plausible exactly once (landing#612)", () => {
  const pages = existsSync(DIST) ? walkHtml(DIST) : [];
  const html = new Map<string, string>();
  for (const p of pages) html.set(rel(p), readFileSync(p, "utf-8"));

  const redirects = configuredRedirects();
  const stubs = new Set(redirects.map((from) => `${from.replace(/^\//, "")}/index.html`));

  // ---------------------------------------------------------------- controls

  it("dist/ exists and holds a plausible number of pages", () => {
    // A walk that finds nothing reports no violations, which reads like full coverage.
    expect(pages.length, "run `npm run build` first").toBeGreaterThan(100);
  });

  it("the instrument matches the component's own tag, and not the other analytics script", () => {
    expect(componentTags.length, `${COMPONENT_PATH} should hold exactly one Plausible tag`).toBe(1);
    // A different analytics script on the same page must not be counted as this one.
    const beacon =
      '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "x"}\'></script>';
    expect(tagsIn(beacon)).toEqual([]);
    // Nor may a data attribute that merely ends in "src" be read as the src.
    expect(tagsIn('<script data-src="https://plausible.datanika.io/js/script.js"></script>')).toEqual([]);
  });

  it("the component's tag records to the datanika.io site", () => {
    // Plausible files a pageview under the site named in data-domain. A value that
    // names no registered site records nothing and raises no error anywhere, and
    // every page would still carry a tag, so the sweep below would stay green.
    expect(canonical.src).toMatch(/^https:\/\/plausible\.datanika\.io\/js\/script[\w.-]*\.js$/);
    expect(canonical.domain).toBe("datanika.io");
    expect(hasBooleanAttr(componentTags[0] ?? "", "defer"), "the tag should not block rendering").toBe(true);
  });

  it("the redirect exemption is derived from astro.config.mjs and covers only stubs", () => {
    // If the parse found nothing, stubs would fail the sweep loudly, which is safe.
    // The dangerous direction is an exemption that swallows a real page, so every
    // exempt path must exist and must actually be a meta-refresh stub.
    expect(redirects.length, "no redirects parsed from astro.config.mjs").toBeGreaterThan(0);
    for (const stub of stubs) {
      const page = html.get(stub);
      expect(page, `configured redirect has no stub at dist/${stub}`).toBeDefined();
      expect(page ?? "", `dist/${stub} is exempt but is not a redirect stub`).toMatch(/http-equiv=["']refresh["']/i);
    }
  });

  // -------------------------------------------------------------- assertions

  it.each([
    // Carried the tag before landing#612: the control the three below are compared with.
    "index.html",
    // The three pages QA measured at 0 on production.
    "docs/index.html",
    "docs/ai-agents/index.html",
    "docs/connectors/postgresql/index.html",
    // Same gap, different layout.
    "api/index.html",
  ])("dist/%s loads it exactly once", (page) => {
    const doc = html.get(page);
    expect(doc, `dist/${page} was not built`).toBeDefined();
    expect(tagsIn(doc ?? "").length).toBe(1);
  });

  it("every page that is not a redirect stub loads the component's tag once, in <head>", () => {
    const violations: string[] = [];
    let checked = 0;
    for (const [page, doc] of html) {
      if (stubs.has(page)) continue;
      checked += 1;
      const tags = tagsIn(doc);
      if (tags.length !== 1) {
        violations.push(`${page}: ${tags.length} Plausible tags`);
        continue;
      }
      const [tag] = tags;
      if (attr(tag, "src") !== canonical.src) violations.push(`${page}: src ${attr(tag, "src")}`);
      if (attr(tag, "data-domain") !== canonical.domain) {
        violations.push(`${page}: data-domain ${attr(tag, "data-domain")}`);
      }
      const head = doc.indexOf("</head>");
      if (head === -1 || doc.indexOf(tag) > head) violations.push(`${page}: tag is not inside <head>`);
    }
    expect(checked, "the sweep checked no pages").toBeGreaterThan(100);
    expect(
      violations,
      `${violations.length} built page(s) would record no pageview, or record it twice. ` +
        `A layout that renders a <head> must render <PlausibleScript />:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
