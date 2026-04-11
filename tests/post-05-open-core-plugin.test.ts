import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("post-05 open-core plugin", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/open-core-plugin/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Open-Source Core From Paid Cloud");
  });

  it("mentions AGPL-3.0", () => {
    expect(html).toContain("AGPL-3.0");
  });

  it("mentions DATANIKA_EDITION environment variable", () => {
    expect(html).toContain("DATANIKA_EDITION");
  });

  it("mentions specific hook names (verified against plugin.py)", () => {
    expect(html).toContain("connection.before_create");
    expect(html).toContain("run.models_completed");
  });

  it("mentions init_cloud entry point", () => {
    expect(html).toContain("init_cloud");
  });

  it("links to why-reflex (architecture cluster)", () => {
    expect(html).toContain('href="/blog/why-reflex"');
  });

  it("links to multitenancy-mistake (architecture cluster)", () => {
    expect(html).toContain('href="/blog/multitenancy-mistake"');
  });

  it("links to self-hosting doc", () => {
    expect(html).toContain('href="/docs/self-hosting"');
  });

  it("links to pricing (cloud CTA)", () => {
    expect(html).toContain('href="/pricing"');
  });

  it("does NOT link to /compare/dbt-cloud (does not exist)", () => {
    expect(html).not.toContain('href="/compare/dbt-cloud"');
  });
});

describe("blog index lists post-05", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/index.html");
  });

  it("lists open-core plugin post", () => {
    expect(html).toContain("Open-Source Core From Paid Cloud");
  });

  it("still lists post-02 (why-reflex)", () => {
    expect(html).toContain("Without a Single Line of JavaScript");
  });

  it("still lists post-08 (dbt-per-tenant)", () => {
    expect(html).toContain("dbt Was Not Designed for Multi-Tenant");
  });
});
