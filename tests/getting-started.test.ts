import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function readHtml(path: string): string {
  return readFileSync(resolve("dist", path), "utf-8");
}

describe("getting started page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/getting-started/index.html");
  });

  it("exists and has title", () => {
    expect(html).toContain("Getting Started");
  });

  it("contains sign up step", () => {
    expect(html).toContain("Sign Up");
  });

  it("contains connection step", () => {
    expect(html).toContain("Add Your First Connection");
  });

  it("contains load data step", () => {
    expect(html).toContain("Load Your Data");
  });

  it("contains pipeline step", () => {
    expect(html).toContain("Build a Pipeline");
  });

  it("contains scheduling step", () => {
    expect(html).toContain("Schedule Automated Runs");
  });

  it("links to connections docs", () => {
    expect(html).toContain('href="/docs/connections"');
  });
});
