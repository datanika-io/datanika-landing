import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("post-04 saas-12-euros", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/saas-12-euros/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("12 a Month");
  });

  it("mentions Hetzner CPX31 cost", () => {
    expect(html).toContain("11.49");
  });

  it("mentions all-in total honestly", () => {
    expect(html).toContain("14.20");
  });

  it("mentions amortized domain costs", () => {
    expect(html).toContain("amortized");
  });

  it("mentions Paddle 5% + $0.50", () => {
    expect(html).toContain("5%");
  });

  it("links to self-hosting guide", () => {
    expect(html).toContain('href="/docs/self-hosting"');
  });

  it("links to open-core-plugin post", () => {
    expect(html).toContain("/blog/open-core-plugin");
  });

  it("links to pricing", () => {
    expect(html).toContain('href="/pricing"');
  });
});

describe("blog index lists post-04", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/index.html");
  });

  it("lists saas-12-euros post", () => {
    expect(html).toContain("12 a Month");
  });
});

/**
 * #467 — the headline number went false on 2026-07-16 (Iron -> Gold upgrade) and nobody
 * noticed for seven weeks, because nothing bound "EUR 12" to a date or to a bill.
 *
 * The founder's fix was to DATE the title rather than restate it, on the argument that a
 * date-bound claim cannot go stale. That argument is only true while the date is actually
 * there, so these assert it mechanically in the four places a machine reads the headline.
 *
 * Deliberately NOT asserted here: the April table's figures (EUR 11.49 / 11.69 / 14.20).
 * Those are a dated historical record the post promises in print not to restate, and a
 * guard over them would go red on the correct change.
 */
describe("post-04 headline is date-bound (#467)", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/saas-12-euros/index.html");
  });

  const QUALIFIER = "(April 2026)";

  it("past-tenses the cost claim in the visible title", () => {
    expect(html).toMatch(/<title>[^<]*Ran on [^<]*12 a Month/);
  });

  for (const tag of ["og:title", "twitter:title"] as const) {
    it(`date-stamps ${tag}`, () => {
      const m = html.match(
        new RegExp(`<meta[^>]+(?:property|name)="${tag}"[^>]+content="([^"]*)"`),
      );
      expect(m, `${tag} not found in built output`).toBeTruthy();
      expect(m![1]).toContain(QUALIFIER);
    });
  }

  it("date-stamps the JSON-LD headline", () => {
    const blocks = [
      ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ].map((m) => m[1]);
    expect(blocks.length, "no JSON-LD block in built output").toBeGreaterThan(0);
    const headlines = blocks
      .map((b) => {
        try {
          return JSON.parse(b);
        } catch {
          return null;
        }
      })
      .filter((o): o is Record<string, unknown> => !!o)
      .map((o) => o.headline)
      .filter((h): h is string => typeof h === "string");
    expect(headlines.length, "no ld+json headline found").toBeGreaterThan(0);
    for (const h of headlines) expect(h).toContain(QUALIFIER);
  });

  it("names the current figure with its provenance, not just what we no longer pay", () => {
    expect(html).toContain("22.20");
    expect(html).toMatch(/renewal invoice/i);
  });
});
