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

  it("has comparison title (Airbyte Alternative after Tier 1 rewrite)", () => {
    expect(html).toContain("Airbyte Alternative");
  });

  it("mentions dbt transformations advantage", () => {
    expect(html.toLowerCase()).toContain("dbt");
    expect(html.toLowerCase()).toContain("transform");
  });

  // Airbyte's own pricing page, read 2026-08-30: "600+ connectors".
  // Same story as the Fivetran assertion -- see the comment there.
  // RE-VERIFY against https://airbyte.com/pricing before changing this.
  it("honestly mentions Airbyte connector advantage (600+, verified 2026-08-30)", () => {
    expect(html).toContain("600+");
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
