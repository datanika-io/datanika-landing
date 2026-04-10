import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("32 connectors post", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/32-connectors-most-took-a-day/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("32 Connectors");
  });

  it("mentions dlt plugin architecture", () => {
    expect(html).toContain("dlt");
  });

  it("links to connector pages", () => {
    expect(html).toContain('href="/connectors"');
    expect(html).toContain("/connectors/stripe");
  });
});

describe("solo ETL platform post", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/solo-etl-platform-18-phases/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("18 Phases");
  });

  it("mentions correct test count (1,400+ not 589)", () => {
    expect(html).toContain("1,424");
    expect(html).not.toContain("589 tests");
  });

  it("mentions TDD", () => {
    expect(html).toContain("TDD");
  });

  it("links to architecture doc", () => {
    expect(html).toContain('href="/docs/architecture"');
  });
});

describe("multi-tenancy post", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/multitenancy-mistake/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Multi-Tenancy");
  });

  it("mentions org_id pattern", () => {
    expect(html).toContain("org_id");
  });

  it("mentions schema-per-tenant tradeoff", () => {
    expect(html.toLowerCase()).toContain("schema-per-tenant");
  });

  it("links to architecture doc", () => {
    expect(html).toContain('href="/docs/architecture');
  });
});

describe("blog index lists all 7 posts", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/index.html");
  });

  it("lists 32 connectors post", () => {
    expect(html).toContain("32 Connectors");
  });

  it("lists solo ETL post", () => {
    expect(html).toContain("18 Phases");
  });

  it("lists multitenancy post", () => {
    expect(html).toContain("Multi-Tenancy");
  });

  it("still lists previous posts", () => {
    expect(html).toContain("REST API");
    expect(html).toContain("Slack Alerts");
  });
});
