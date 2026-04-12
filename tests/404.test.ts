import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("404 page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("404.html");
  });

  it("renders as 404.html (not inside a subdirectory)", () => {
    expect(existsSync(resolve(DIST, "404.html"))).toBe(true);
  });

  it("has branded title", () => {
    expect(html).toContain("<title>Page Not Found — Datanika</title>");
  });

  it("shows 404 heading and message", () => {
    expect(html).toContain("404");
    expect(html).toContain("Page not found");
  });

  it("includes Navbar", () => {
    expect(html).toContain("mobile-menu");
  });

  it("includes Footer", () => {
    expect(html).toContain("All rights reserved");
  });

  it("has helpful links to key pages", () => {
    const requiredLinks = ["/connectors", "/docs", "/blog", "/pricing"];
    for (const link of requiredLinks) {
      expect(html).toContain(`href="${link}"`);
    }
  });

  it("has homepage CTA button", () => {
    expect(html).toMatch(/href="\/"/);
    expect(html).toContain("Go to Homepage");
  });

  it("has popular pages section", () => {
    expect(html).toContain("Popular Pages");
    expect(html).toContain("/docs/getting-started");
    expect(html).toContain("/docs/api");
  });

  it("does not emit JSON-LD (Google ignores it on 404)", () => {
    // Layout always emits Organization + WebSite JSON-LD, which is fine.
    // But there should be no Article, BreadcrumbList, FAQPage, or
    // SoftwareApplication JSON-LD on the 404 page.
    expect(html).not.toContain('"@type":"Article"');
    expect(html).not.toContain('"@type":"BreadcrumbList"');
    expect(html).not.toContain('"@type":"FAQPage"');
    expect(html).not.toContain('"@type":"SoftwareApplication"');
  });
});
