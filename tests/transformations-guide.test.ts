import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("transformation guide", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/transformations-guide/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Transformation Guide");
  });

  it("mentions dbt", () => {
    expect(html.toLowerCase()).toContain("dbt");
  });

  it("covers materializations", () => {
    expect(html).toContain("view");
    expect(html).toContain("table");
    expect(html).toContain("incremental");
  });

  it("covers tests", () => {
    expect(html).toContain("unique");
    expect(html).toContain("not_null");
  });

  it("covers snapshots", () => {
    expect(html).toContain("Snapshot");
  });

  it("covers packages", () => {
    expect(html).toContain("dbt_utils");
  });
});
