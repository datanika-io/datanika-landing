import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("Datanika vs Fivetran comparison page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("compare/fivetran/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has comparison title", () => {
    expect(html).toContain("Datanika vs Fivetran");
  });

  it("mentions open-source advantage", () => {
    expect(html.toLowerCase()).toContain("open-source");
  });

  it("honestly mentions Fivetran connector count", () => {
    expect(html).toContain("500+");
  });

  it("has CTA to sign up", () => {
    expect(html).toContain("app.datanika.io");
  });

  it("has GitHub link", () => {
    expect(html).toContain("github.com/datanika-io/datanika-core");
  });

  it("mentions self-hosting advantage", () => {
    expect(html.toLowerCase()).toContain("self-host");
  });
});
