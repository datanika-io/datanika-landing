import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

// ---------------------------------------------------------------------------
// Backward compatibility: homepage uses Layout with no new props.
// ---------------------------------------------------------------------------

describe("Layout backward compat (homepage with default props)", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("index.html");
  });

  it("defaults og:type to website", () => {
    expect(html).toMatch(/<meta\s+property="og:type"\s+content="website"/);
  });

  it("defaults og:image to /logo.png", () => {
    expect(html).toMatch(
      /<meta\s+property="og:image"\s+content="https:\/\/datanika\.io\/logo\.png"/
    );
  });

  it("does not emit Article JSON-LD", () => {
    expect(html).not.toContain('"@type":"Article"');
  });

  it("does not emit BreadcrumbList JSON-LD", () => {
    expect(html).not.toContain('"@type":"BreadcrumbList"');
  });

  it("does not emit article:* meta tags", () => {
    expect(html).not.toMatch(/<meta\s+property="article:published_time"/);
    expect(html).not.toMatch(/<meta\s+property="article:author"/);
  });
});

// ---------------------------------------------------------------------------
// Article fixture: ogImage + ogType + articleMeta + breadcrumbs all set.
// ---------------------------------------------------------------------------

describe("Layout fixture page (all new props set)", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("test-fixtures/layout-fixture/index.html");
  });

  it("uses the custom ogImage", () => {
    expect(html).toMatch(
      /<meta\s+property="og:image"\s+content="https:\/\/datanika\.io\/og\/test-fixture\.png"/
    );
  });

  it("uses ogImage on twitter:image too", () => {
    expect(html).toMatch(
      /<meta\s+name="twitter:image"\s+content="https:\/\/datanika\.io\/og\/test-fixture\.png"/
    );
  });

  it("sets og:type to article", () => {
    expect(html).toMatch(/<meta\s+property="og:type"\s+content="article"/);
  });

  it("emits article:published_time as ISO 8601", () => {
    expect(html).toMatch(
      /<meta\s+property="article:published_time"\s+content="2026-04-10T12:00:00\.000Z"/
    );
  });

  it("emits article:modified_time", () => {
    expect(html).toMatch(
      /<meta\s+property="article:modified_time"\s+content="2026-04-11T08:00:00\.000Z"/
    );
  });

  it("emits article:author", () => {
    expect(html).toMatch(
      /<meta\s+property="article:author"\s+content="Datanika Team"/
    );
  });

  it("emits article:section", () => {
    expect(html).toMatch(
      /<meta\s+property="article:section"\s+content="Engineering"/
    );
  });

  it("emits one article:tag per tag", () => {
    expect(html).toMatch(/<meta\s+property="article:tag"\s+content="test"/);
    expect(html).toMatch(/<meta\s+property="article:tag"\s+content="layout"/);
    expect(html).toMatch(/<meta\s+property="article:tag"\s+content="seo"/);
  });

  it("emits Article JSON-LD with required fields", () => {
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"headline":"Test Fixture Article"');
    expect(html).toContain('"datePublished":"2026-04-10T12:00:00.000Z"');
    expect(html).toContain('"dateModified":"2026-04-11T08:00:00.000Z"');
    expect(html).toContain('"author"');
    expect(html).toContain('"Datanika Team"');
  });

  it("Article JSON-LD includes the custom ogImage", () => {
    expect(html).toContain(
      '"image":"https://datanika.io/og/test-fixture.png"'
    );
  });

  it("emits BreadcrumbList JSON-LD with absolute URLs", () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"@type":"ListItem"');
    expect(html).toContain('"position":1');
    expect(html).toContain('"position":2');
    expect(html).toContain('"position":3');
    expect(html).toContain('"item":"https://datanika.io/"');
    expect(html).toContain('"item":"https://datanika.io/blog"');
    expect(html).toContain(
      '"item":"https://datanika.io/test-fixtures/layout-fixture"'
    );
  });

  it("still emits Organization and WebSite JSON-LD", () => {
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"@type":"WebSite"');
  });
});

// ---------------------------------------------------------------------------
// Sitemap and robots: test fixture must not leak.
// ---------------------------------------------------------------------------

describe("Test fixture exclusion", () => {
  it("robots.txt disallows /test-fixtures/", () => {
    const txt = readFileSync(resolve(DIST, "robots.txt"), "utf-8");
    expect(txt).toContain("Disallow: /test-fixtures/");
  });

  it("sitemap does not include the test fixture", () => {
    // Sitemap may be sitemap-index.xml + sitemap-0.xml
    const candidates = ["sitemap-0.xml", "sitemap-index.xml"];
    for (const name of candidates) {
      const path = resolve(DIST, name);
      if (existsSync(path)) {
        const content = readFileSync(path, "utf-8");
        expect(content).not.toContain("/test-fixtures/");
      }
    }
  });
});
