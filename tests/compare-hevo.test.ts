import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("Datanika vs Hevo Data comparison page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("compare/hevo/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has comparison title (Hevo Data Alternative after Tier 1 rewrite)", () => {
    expect(html).toContain("Hevo Data Alternative");
  });

  it("mentions open-source advantage", () => {
    expect(html.toLowerCase()).toContain("open-source");
  });

  it("mentions dbt transforms", () => {
    expect(html.toLowerCase()).toContain("dbt");
  });

  it("has CTA to sign up", () => {
    expect(html).toContain("app.datanika.io");
  });

  it("has GitHub link", () => {
    expect(html).toContain("github.com/datanika-io/datanika-core");
  });

  it("has when to choose sections", () => {
    expect(html.toLowerCase()).toContain("when to choose");
  });
});
