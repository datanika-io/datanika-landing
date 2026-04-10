import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("scheduling guide", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/scheduling-guide/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Scheduling Guide");
  });

  it("covers cron expressions", () => {
    expect(html).toContain("Cron");
  });

  it("covers dependencies", () => {
    expect(html).toContain("Dependencies");
  });

  it("covers DAG", () => {
    expect(html).toContain("DAG");
  });

  it("has cron examples", () => {
    expect(html).toContain("0 6 * * *");
  });

  it("mentions plan limits", () => {
    expect(html).toContain("Unlimited");
  });
});
