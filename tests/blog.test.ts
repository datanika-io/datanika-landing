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
