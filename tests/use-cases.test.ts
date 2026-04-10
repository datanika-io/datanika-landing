import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

const useCaseSlugs = [
  "postgresql-to-bigquery",
  "postgresql-to-snowflake",
  "mysql-to-bigquery",
  "mongodb-to-snowflake",
  "stripe-to-bigquery",
  "hubspot-to-snowflake",
  "salesforce-to-bigquery",
  "shopify-to-bigquery",
  "kafka-to-clickhouse",
  "s3-to-snowflake",
];

describe("use-case pages", () => {
  it("generates all 10 use-case pages", () => {
    for (const slug of useCaseSlugs) {
      const file = resolve(DIST, `use-cases/${slug}/index.html`);
      expect(existsSync(file), `Missing: /use-cases/${slug}`).toBe(true);
    }
  });
});

describe("use-case index page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("use-cases/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Use Cases");
  });

  it("links to postgresql-to-bigquery", () => {
    expect(html).toContain('href="/use-cases/postgresql-to-bigquery"');
  });

  it("links to stripe-to-bigquery", () => {
    expect(html).toContain('href="/use-cases/stripe-to-bigquery"');
  });

  it("has CTA", () => {
    expect(html).toContain("app.datanika.io");
  });
});

describe("PostgreSQL to BigQuery use-case page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("use-cases/postgresql-to-bigquery/index.html");
  });

  it("has source and destination in title", () => {
    expect(html).toContain("PostgreSQL");
    expect(html).toContain("BigQuery");
  });

  it("has steps section", () => {
    expect(html).toContain("Add your PostgreSQL");
  });

  it("has transform examples", () => {
    expect(html.toLowerCase()).toContain("transform");
  });

  it("links to connector pages", () => {
    expect(html).toContain("/connectors/postgresql");
    expect(html).toContain("/connectors/bigquery");
  });

  it("has CTA to sign up", () => {
    expect(html).toContain("app.datanika.io");
  });
});
