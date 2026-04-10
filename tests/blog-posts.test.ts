import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("REST API announcement post", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/datanika-rest-api-v1/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("REST API");
  });

  it("mentions 36 endpoints", () => {
    expect(html).toContain("36");
  });

  it("has Swagger reference", () => {
    expect(html).toContain("Swagger");
  });

  it("has code examples", () => {
    expect(html).toContain("curl");
  });
});

describe("PostgreSQL to BigQuery tutorial", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/postgresql-to-bigquery/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("PostgreSQL to BigQuery");
  });

  it("has step-by-step content", () => {
    expect(html).toContain("Step 1");
    expect(html).toContain("Step 7");
  });

  it("has SQL example", () => {
    expect(html).toContain("datanika_reader");
  });

  it("links to app", () => {
    expect(html).toContain("app.datanika.io");
  });
});

describe("Slack alerts tutorial", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/slack-alerts-pipeline-failures/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Slack Alerts");
  });

  it("covers all channel types", () => {
    expect(html).toContain("Telegram");
    expect(html).toContain("Webhook");
  });

  it("has API example", () => {
    expect(html).toContain("api/v1/notifications");
  });

  it("has webhook payload example", () => {
    expect(html).toContain("run.failed");
  });
});

describe("blog index lists all posts", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("blog/index.html");
  });

  it("lists REST API post", () => {
    expect(html).toContain("REST API");
  });

  it("lists PostgreSQL post", () => {
    expect(html).toContain("PostgreSQL to BigQuery");
  });

  it("lists Slack alerts post", () => {
    expect(html).toContain("Slack Alerts");
  });

  it("lists original intro post", () => {
    expect(html).toContain("Introducing Datanika");
  });
});
