import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("post-04 saas-12-euros", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/saas-12-euros/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("12 a Month");
  });

  it("mentions Hetzner CPX31 cost", () => {
    expect(html).toContain("11.49");
  });

  it("mentions all-in total honestly", () => {
    expect(html).toContain("14.20");
  });

  it("mentions amortized domain costs", () => {
    expect(html).toContain("amortized");
  });

  it("mentions Paddle 5% + $0.50", () => {
    expect(html).toContain("5%");
  });

  it("links to self-hosting guide", () => {
    expect(html).toContain('href="/docs/self-hosting"');
  });

  it("links to open-core-plugin post", () => {
    expect(html).toContain("/blog/open-core-plugin");
  });

  it("links to pricing", () => {
    expect(html).toContain('href="/pricing"');
  });
});

describe("blog index lists post-04", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/index.html");
  });

  it("lists saas-12-euros post", () => {
    expect(html).toContain("12 a Month");
  });
});
