import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("architecture overview page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/architecture/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Architecture");
  });

  it("mentions dlt", () => {
    expect(html).toContain("dlt");
  });

  it("mentions dbt-core", () => {
    expect(html).toContain("dbt-core");
  });

  it("covers multi-tenancy", () => {
    expect(html).toContain("org_id");
  });

  it("covers security", () => {
    expect(html).toContain("Fernet");
  });

  it("has tech stack table", () => {
    expect(html).toContain("Celery");
    expect(html).toContain("APScheduler");
    expect(html).toContain("Reflex");
  });

  it("links to related docs", () => {
    expect(html).toContain("/docs/self-hosting");
    // Issue #105: API docs moved from /docs/api to /api/reference.
    expect(html).toContain("/api/reference");
  });
});
