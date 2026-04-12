import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("navbar links", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("index.html");
  });

  it("has Connectors link", () => {
    expect(html).toContain('href="/connectors"');
  });

  it("has Use Cases link", () => {
    expect(html).toContain('href="/use-cases"');
  });

  it("has Pricing link", () => {
    expect(html).toContain('href="/pricing"');
  });

  it("has Docs link", () => {
    expect(html).toContain('href="/docs"');
  });

  it("has API link", () => {
    // Issue #105 — Approach B from SPEC_DOCS_IA_REDESIGN.md.
    // The API section is its own top-level entry between Docs and Blog.
    expect(html).toContain('href="/api"');
  });

  it("has Blog link", () => {
    expect(html).toContain('href="/blog"');
  });
});
