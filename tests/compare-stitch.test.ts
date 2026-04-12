import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("Datanika vs Stitch comparison page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("compare/stitch/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has comparison title (Stitch Data Alternative after Tier 2 rewrite)", () => {
    expect(html).toContain("Stitch Data Alternative");
  });

  it("mentions open-source advantage", () => {
    expect(html.toLowerCase()).toContain("open-source");
  });

  it("mentions Talend/Qlik context", () => {
    const lower = html.toLowerCase();
    expect(lower.includes("talend") || lower.includes("qlik")).toBe(true);
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
