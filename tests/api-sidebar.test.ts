/**
 * Consistency tests for the new top-level /api/ section (issue #105).
 * Analogous to docs-sidebar.test.ts. Catches drift between the source IA in
 * ApiLayout.astro and what actually ships in the built /api/* HTML.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";

const DIST = resolve(__dirname, "../dist/api");

const EXPECTED_API_SIDEBAR = [
  { label: "Overview", href: "/api" },
  { label: "API Reference", href: "/api/reference" },
  { label: "API Keys", href: "/api/keys" },
];

function getApiPages(): string[] {
  if (!existsSync(DIST)) return [];
  const entries = readdirSync(DIST, { withFileTypes: true });
  const pages: string[] = [];

  // /api/index.html
  if (existsSync(join(DIST, "index.html"))) {
    pages.push("index");
  }

  // /api/<slug>/index.html
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const file = join(DIST, entry.name, "index.html");
      if (existsSync(file)) {
        pages.push(entry.name);
      }
    }
  }

  return pages;
}

function extractApiSidebarLinks(html: string): string[] {
  // ApiLayout.astro renders the sidebar as <nav class="sticky ...">. Same
  // shape as DocsLayout but lives at /api/* instead of /docs/*.
  const navMatch = html.match(/<nav class="sticky[^"]*">([\s\S]*?)<\/nav>/);
  if (!navMatch) return [];

  const links: string[] = [];
  const linkRegex = /href="(\/api[^"]*)"/g;
  let match;
  while ((match = linkRegex.exec(navMatch[1])) !== null) {
    links.push(match[1]);
  }
  // Overview link uses href="/api" exactly; the regex above grabs both
  // "/api" and "/api/...". Dedupe while preserving order.
  return Array.from(new Set(links));
}

describe("api sidebar consistency", () => {
  const pages = getApiPages();
  const expectedHrefs = EXPECTED_API_SIDEBAR.map((s) => s.href);

  it("found api pages to test", () => {
    // Issue #105 ships the section with 3 pages: index, reference, keys.
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });

  it("EXPECTED_API_SIDEBAR has the right entry count", () => {
    expect(EXPECTED_API_SIDEBAR.length).toBe(3);
  });

  it("api sidebar nav is sticky and independently scrollable", () => {
    // Mirrors the DocsLayout regression test from PR #101 — same constraint
    // applies to the API section, even though it's currently short. The
    // intent is to grow this section over time without ever having a
    // non-scrollable sidebar regression.
    const filePath = join(DIST, "index.html");
    if (!existsSync(filePath)) return;
    const html = readFileSync(filePath, "utf-8");
    const navMatch = html.match(/<nav class="(sticky[^"]*)">/);
    expect(navMatch, "api sidebar <nav class=\"sticky ...\"> not found").not.toBeNull();
    const navClasses = navMatch![1];
    expect(navClasses).toMatch(/max-h-\[calc\(100vh-/);
    expect(navClasses).toContain("overflow-y-auto");
  });

  for (const page of getApiPages()) {
    it(`page "${page}" has all ${EXPECTED_API_SIDEBAR.length} sidebar links`, () => {
      const filePath =
        page === "index"
          ? join(DIST, "index.html")
          : join(DIST, page, "index.html");
      const html = readFileSync(filePath, "utf-8");
      const sidebarLinks = extractApiSidebarLinks(html);

      for (const expected of expectedHrefs) {
        expect(
          sidebarLinks,
          `Page "/api/${page}" missing sidebar link: ${expected}`
        ).toContain(expected);
      }
    });
  }

  it("api section is reachable from the top-level navbar", () => {
    // The whole point of Approach B is that /api/ is its own top-nav entry.
    // Read the index.html and assert the navbar contains an /api link.
    const indexHtml = readFileSync(join(DIST, "..", "index.html"), "utf-8");
    expect(indexHtml).toContain('href="/api"');
  });

  it("legacy /docs/api and /docs/api-keys URLs redirect to the new location", () => {
    // Astro's `redirects` config emits static stubs at the source paths.
    // Check that the built HTML contains a meta refresh / canonical pointing
    // at the new URL.
    const docsApiStub = join(DIST, "..", "docs", "api", "index.html");
    const docsApiKeysStub = join(DIST, "..", "docs", "api-keys", "index.html");
    expect(existsSync(docsApiStub), "/docs/api redirect stub not built").toBe(true);
    expect(existsSync(docsApiKeysStub), "/docs/api-keys redirect stub not built").toBe(true);

    const apiHtml = readFileSync(docsApiStub, "utf-8");
    expect(apiHtml).toContain("/api/reference");

    const keysHtml = readFileSync(docsApiKeysStub, "utf-8");
    expect(keysHtml).toContain("/api/keys");
  });
});
