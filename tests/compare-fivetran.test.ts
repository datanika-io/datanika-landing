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

  it("has comparison title (Fivetran Alternative after Tier 1 rewrite)", () => {
    expect(html).toContain("Fivetran Alternative");
  });

  it("mentions open-source advantage", () => {
    expect(html.toLowerCase()).toContain("open-source");
  });

  // Fivetran's own pricing page, read 2026-08-30: "700+ fully managed
  // connectors". This assertion sat at "500+" for months and was the reason
  // three pages kept understating a competitor -- the test enforced the stale
  // number, so correcting the page turned the suite red. Understating a
  // competitor is the same accuracy failure as overstating ourselves.
  //
  // RE-VERIFY against https://www.fivetran.com/pricing before changing this.
  // A number in a test is not a source; the vendor's page is.
  it("honestly mentions Fivetran connector count (700+, verified 2026-08-30)", () => {
    expect(html).toContain("700+");
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
