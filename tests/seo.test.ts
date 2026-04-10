import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

// --- robots.txt ---

describe("robots.txt", () => {
  it("exists in dist", () => {
    expect(existsSync(resolve(DIST, "robots.txt"))).toBe(true);
  });

  it("allows all crawlers", () => {
    const txt = readFileSync(resolve(DIST, "robots.txt"), "utf-8");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
  });

  it("references sitemap", () => {
    const txt = readFileSync(resolve(DIST, "robots.txt"), "utf-8");
    expect(txt).toContain("Sitemap: https://datanika.io/sitemap");
  });
});

// --- sitemap ---

describe("sitemap", () => {
  it("generates a sitemap index", () => {
    const exists =
      existsSync(resolve(DIST, "sitemap-index.xml")) ||
      existsSync(resolve(DIST, "sitemap-0.xml"));
    expect(exists).toBe(true);
  });
});

// --- Layout meta tags (homepage) ---

describe("homepage meta tags", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("index.html");
  });

  it("has og:title", () => {
    expect(html).toMatch(/<meta\s+property="og:title"/);
  });

  it("has og:description", () => {
    expect(html).toMatch(/<meta\s+property="og:description"/);
  });

  it("has og:type", () => {
    expect(html).toMatch(/<meta\s+property="og:type"\s+content="website"/);
  });

  it("has og:url", () => {
    expect(html).toMatch(/<meta\s+property="og:url"/);
  });

  it("has og:site_name", () => {
    expect(html).toMatch(/<meta\s+property="og:site_name"\s+content="Datanika"/);
  });

  it("has twitter:card", () => {
    expect(html).toMatch(/<meta\s+name="twitter:card"\s+content="summary_large_image"/);
  });

  it("has twitter:title", () => {
    expect(html).toMatch(/<meta\s+name="twitter:title"/);
  });

  it("has canonical URL", () => {
    expect(html).toMatch(/<link\s+rel="canonical"\s+href="https:\/\/datanika\.io\/"/);
  });

  it("has Organization JSON-LD", () => {
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"name":"Datanika"');
  });

  it("has WebSite JSON-LD", () => {
    expect(html).toContain('"@type":"WebSite"');
  });
});

// --- Docs page meta tags ---

describe("docs page meta tags", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/connections/index.html");
  });

  it("has og:title", () => {
    expect(html).toMatch(/<meta\s+property="og:title"/);
  });

  it("has og:description", () => {
    expect(html).toMatch(/<meta\s+property="og:description"/);
  });

  it("has og:type article", () => {
    expect(html).toMatch(/<meta\s+property="og:type"\s+content="article"/);
  });

  it("has canonical URL", () => {
    expect(html).toMatch(
      /<link\s+rel="canonical"\s+href="https:\/\/datanika\.io\/docs\/connections\/"/
    );
  });

  it("has Article JSON-LD", () => {
    expect(html).toContain('"@type":"Article"');
  });

  it("has twitter:card", () => {
    expect(html).toMatch(/<meta\s+name="twitter:card"/);
  });
});

// --- Pricing page meta tags ---

describe("pricing page meta tags", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("pricing/index.html");
  });

  it("has og:title with Pricing", () => {
    expect(html).toMatch(/property="og:title"\s+content="[^"]*[Pp]ricing/);
  });

  it("has canonical URL", () => {
    expect(html).toMatch(/<link\s+rel="canonical"/);
  });
});
