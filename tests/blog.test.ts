import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("blog index page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has blog title", () => {
    expect(html).toContain("Blog");
  });

  it("lists the sample post", () => {
    expect(html).toContain("Introducing Datanika");
  });

  it("has post date", () => {
    expect(html).toContain("2026");
  });
});

describe("blog post page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/introducing-datanika/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has post title", () => {
    expect(html).toContain("Introducing Datanika");
  });

  it("has post content", () => {
    expect(html).toContain("Why We Built Datanika");
  });

  it("has back to blog link", () => {
    expect(html).toContain('href="/blog"');
  });
});

describe("navbar has blog link", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("index.html");
  });

  it("has blog link in navigation", () => {
    expect(html).toContain('href="/blog"');
  });
});

// ---------------------------------------------------------------------------
// Article schema + breadcrumbs wired via Layout props (#43)
// ---------------------------------------------------------------------------

describe("blog post Article schema + breadcrumbs", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/introducing-datanika/index.html");
  });

  it("sets og:type to article", () => {
    expect(html).toMatch(/<meta\s+property="og:type"\s+content="article"/);
  });

  it("emits article:published_time meta", () => {
    expect(html).toMatch(/<meta\s+property="article:published_time"\s+content="2026-04-10/);
  });

  it("emits article:author meta", () => {
    expect(html).toMatch(/<meta\s+property="article:author"\s+content="Datanika Team"/);
  });

  it("emits article:tag meta for each tag", () => {
    expect(html).toMatch(/<meta\s+property="article:tag"\s+content="announcement"/);
    expect(html).toMatch(/<meta\s+property="article:tag"\s+content="open-source"/);
  });

  it("emits Article JSON-LD with headline and author", () => {
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('"headline":"Introducing Datanika');
    expect(html).toContain('"Datanika Team"');
    expect(html).toContain('"datePublished":"2026-04-10');
    expect(html).toContain('"dateModified":"2026-04-10');
    expect(html).toContain('"publisher"');
  });

  it("emits BreadcrumbList JSON-LD with Home → Blog → post", () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(html).toContain('"item":"https://datanika.io/"');
    expect(html).toContain('"item":"https://datanika.io/blog"');
    expect(html).toContain('"position":3');
  });

  it("og:image is auto-derived from build-time OG generator (#55)", () => {
    // Posts without a custom heroImage get /og/blog/<slug>.png from the
    // build-time OG image generator. Posts with a custom heroImage
    // (set in frontmatter by Growth) would override this — none of the
    // current posts do, so every post resolves to the auto-derived URL.
    expect(html).toMatch(
      /<meta\s+property="og:image"\s+content="https:\/\/datanika\.io\/og\/blog\/introducing-datanika\.png"/
    );
  });
});
