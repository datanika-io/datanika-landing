import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("Datanika vs Airbyte comparison page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("compare/airbyte/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has comparison title", () => {
    expect(html).toContain("Datanika vs Airbyte");
  });

  it("mentions dbt transformations advantage", () => {
    expect(html.toLowerCase()).toContain("dbt");
    expect(html.toLowerCase()).toContain("transform");
  });

  it("honestly mentions Airbyte connector advantage", () => {
    expect(html).toContain("400+");
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
