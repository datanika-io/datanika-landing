import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("API docs page", () => {
  let html: string;
  beforeAll(() => {
    // Issue #105 — API docs moved from /docs/api to /api/reference. The
    // /docs/api URL still works as a 301 redirect; this test now reads the
    // canonical location to verify content.
    html = readHtml("api/reference/index.html");
  });

  it("has schedules section", () => {
    expect(html).toContain("/api/v1/schedules");
  });

  it("has notification channels section", () => {
    expect(html).toContain("/api/v1/notifications/channels");
  });

  it("mentions Swagger UI", () => {
    expect(html).toContain("Swagger");
  });

  it("documents channel types", () => {
    expect(html).toContain("slack");
    expect(html).toContain("telegram");
    expect(html).toContain("webhook");
  });

  it("documents cron_expression", () => {
    expect(html).toContain("cron_expression");
  });

  it("documents the compile endpoint (#52)", () => {
    expect(html).toContain("/api/v1/transformations/5/compile");
    expect(html).toContain("compiled_sql");
    expect(html).toContain("compilation_error");
  });

  it("documents the preview endpoint (#52)", () => {
    expect(html).toContain("/api/v1/transformations/5/preview");
    expect(html).toContain("row_count");
    expect(html).toContain("truncated");
    expect(html).toContain("missing_destination");
    expect(html).toContain("execution_error");
  });

  it("explains the agent loop", () => {
    expect(html).toContain("agent loop");
  });
});
