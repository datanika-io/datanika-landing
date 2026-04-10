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
    html = readHtml("docs/api/index.html");
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
});
