import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("post-02 why-reflex", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/why-reflex/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Without a Single Line of JavaScript");
  });

  it("mentions Reflex 0.8.x Starlette", () => {
    expect(html).toContain("Reflex 0.8");
    expect(html).toContain("Starlette");
  });

  it("mentions layered architecture", () => {
    expect(html.toLowerCase()).toContain("layered");
  });

  it("links to architecture doc", () => {
    expect(html).toContain('href="/docs/architecture"');
  });

  it("links to multitenancy-mistake post", () => {
    expect(html).toContain("/blog/multitenancy-mistake");
  });

  it("links to dbt-per-tenant post", () => {
    expect(html).toContain("/blog/dbt-per-tenant");
  });

  it("links to self-hosting guide", () => {
    expect(html).toContain('href="/docs/self-hosting"');
  });
});

describe("blog index lists post-02", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/index.html");
  });

  it("lists why-reflex post", () => {
    expect(html).toContain("Without a Single Line of JavaScript");
  });

  it("still lists post-08 (dbt-per-tenant)", () => {
    expect(html).toContain("dbt Was Not Designed for Multi-Tenant");
  });
});
