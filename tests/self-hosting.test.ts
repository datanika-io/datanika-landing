import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("self-hosting guide", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("docs/self-hosting/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Self-Hosting");
  });

  it("mentions Docker Compose", () => {
    expect(html).toContain("Docker Compose");
  });

  it("has prerequisites section", () => {
    expect(html).toContain("Prerequisites");
  });

  it("has configuration section", () => {
    expect(html).toContain("Configuration");
  });

  it("mentions GitHub repo", () => {
    expect(html).toContain("datanika-core");
  });

  it("has upgrading section", () => {
    expect(html).toContain("Upgrading");
  });
});
