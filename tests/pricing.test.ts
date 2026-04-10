import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("pricing page with annual toggle", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("pricing/index.html");
  });

  it("has monthly/annual toggle", () => {
    expect(html).toContain("Monthly");
    expect(html).toContain("Annual");
  });

  it("shows save percentage for annual", () => {
    expect(html).toMatch(/[Ss]ave\s+\d+%/);
  });

  it("has monthly prices", () => {
    expect(html).toContain("$79");
    expect(html).toContain("$399");
  });

  it("has annual prices", () => {
    expect(html).toContain("$66");
    expect(html).toContain("$333");
  });

  it("has Free plan unchanged", () => {
    expect(html).toContain("$0");
  });
});

describe("homepage pricing section", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("index.html");
  });

  it("has monthly/annual toggle", () => {
    expect(html).toContain("Monthly");
    expect(html).toContain("Annual");
  });
});
