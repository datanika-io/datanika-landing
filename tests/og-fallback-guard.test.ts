import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join, relative } from "path";

const DIST = resolve(__dirname, "../dist");

/**
 * Guardrail: every leaf page in blog/, connectors/, use-cases/, and compare/
 * must have a unique og:image — not the site-wide /logo.png fallback.
 *
 * Index/listing pages (e.g. /blog/index.html) are excluded because they
 * don't have per-page OG images by design.
 *
 * If this test fails, the new page is missing ogCollection + ogSlug props
 * in its template (or an explicit ogImage override).
 */

const SEO_FAMILIES = ["blog", "connectors", "use-cases", "compare"];

function leafPages(family: string): string[] {
  const dir = resolve(DIST, family);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(dir, d.name, "index.html"))
    .filter((p) => existsSync(p));
}

function extractOgImage(html: string): string | null {
  const match = html.match(
    /property="og:image"\s+content="([^"]+)"/
  );
  return match ? match[1] : null;
}

/**
 * Astro emits a tiny `<meta http-equiv="refresh">` stub for every entry in the
 * `redirects` config. Those land inside these families on disk — e.g.
 * `/connectors/google-ads` after that connector was withdrawn (core#567) — but
 * they are not content pages: they have no OG tags by design, and giving them
 * any would be worse, since the whole point is that nobody should land there.
 *
 * Excluded by shape rather than by slug so the next redirect needs no edit here.
 */
function isRedirectStub(html: string): boolean {
  return /http-equiv="refresh"/i.test(html);
}

describe("og:image fallback guardrail", () => {
  const pages: { family: string; slug: string; file: string }[] = [];

  for (const family of SEO_FAMILIES) {
    for (const file of leafPages(family)) {
      if (isRedirectStub(readFileSync(file, "utf-8"))) continue;
      const slug = relative(resolve(DIST, family), file).split(/[\\/]/)[0];
      pages.push({ family, slug, file });
    }
  }

  it("found leaf pages to check", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages.map((p) => [`${p.family}/${p.slug}`, p.file]))(
    "%s has a unique og:image (not /logo.png)",
    (_label, file) => {
      const html = readFileSync(file as string, "utf-8");
      const ogImage = extractOgImage(html);
      expect(ogImage, "og:image meta tag missing").not.toBeNull();
      expect(ogImage).not.toContain("/logo.png");
    }
  );
});
