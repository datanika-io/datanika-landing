/**
 * Internal linking audit tests.
 * Ensures cross-type linking between connectors, use-cases, comparisons,
 * and blog posts. Prevents link-rot on future pages.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");
const BLOG_SRC = resolve(__dirname, "../src/content/blog");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf-8");
}

function countLinks(html: string, pattern: string): number {
  const regex = new RegExp(`href="${pattern}[^"]*"`, "g");
  return (html.match(regex) || []).length;
}

// --- Connector pages must link to use-cases ---

const connectorSlugs = [
  "postgresql", "mysql", "mssql", "sqlite", "clickhouse", "duckdb",
  "bigquery", "snowflake", "redshift", "databricks", "synapse",
  "mongodb",
  "stripe", "github", "hubspot", "salesforce", "shopify", "jira", "slack",
  "google-analytics", "google-ads", "facebook-ads", "zendesk", "airtable", "notion", "rest-api",
  "csv", "json", "parquet", "s3", "google-sheets", "kafka",
];

const connectorsThatHaveUseCases = [
  "postgresql", "mysql", "mongodb", "stripe", "hubspot", "salesforce",
  "shopify", "kafka", "s3", "bigquery", "snowflake", "clickhouse",
];

describe("connector pages link to use-cases", () => {
  for (const slug of connectorsThatHaveUseCases) {
    it(`/connectors/${slug} links to at least one use-case`, () => {
      const html = readHtml(`connectors/${slug}/index.html`);
      const useCaseLinks = countLinks(html, "/use-cases/");
      expect(useCaseLinks, `/connectors/${slug} has 0 use-case links`).toBeGreaterThan(0);
    });
  }
});

describe("connector pages link to comparison pages", () => {
  for (const slug of connectorSlugs) {
    it(`/connectors/${slug} links to at least one comparison`, () => {
      const html = readHtml(`connectors/${slug}/index.html`);
      const compareLinks = countLinks(html, "/compare/");
      expect(compareLinks, `/connectors/${slug} has 0 comparison links`).toBeGreaterThan(0);
    });
  }
});

// --- Use-case pages must link to connector pages ---

const useCaseSlugs = [
  "postgresql-to-bigquery", "postgresql-to-snowflake", "mysql-to-bigquery",
  "mongodb-to-snowflake", "stripe-to-bigquery", "hubspot-to-snowflake",
  "salesforce-to-bigquery", "shopify-to-bigquery", "kafka-to-clickhouse",
  "s3-to-snowflake",
];

describe("use-case pages link to connector pages", () => {
  for (const slug of useCaseSlugs) {
    it(`/use-cases/${slug} links to connectors`, () => {
      const html = readHtml(`use-cases/${slug}/index.html`);
      const connectorLinks = countLinks(html, "/connectors/");
      expect(connectorLinks, `/use-cases/${slug} has 0 connector links`).toBeGreaterThan(0);
    });
  }
});

describe("use-case pages link to comparison pages", () => {
  for (const slug of useCaseSlugs) {
    it(`/use-cases/${slug} links to at least one comparison`, () => {
      const html = readHtml(`use-cases/${slug}/index.html`);
      const compareLinks = countLinks(html, "/compare/");
      expect(compareLinks, `/use-cases/${slug} has 0 comparison links`).toBeGreaterThan(0);
    });
  }
});

// --- Comparison pages must link to connectors + use-cases ---

const compareSlugs = ["airbyte", "fivetran", "stitch", "hevo"];

describe("comparison pages link to connectors and use-cases", () => {
  for (const slug of compareSlugs) {
    it(`/compare/${slug} links to connectors`, () => {
      const html = readHtml(`compare/${slug}/index.html`);
      const connectorLinks = countLinks(html, "/connectors/");
      expect(connectorLinks, `/compare/${slug} has 0 connector links`).toBeGreaterThanOrEqual(3);
    });

    it(`/compare/${slug} links to use-cases`, () => {
      const html = readHtml(`compare/${slug}/index.html`);
      const useCaseLinks = countLinks(html, "/use-cases/");
      expect(useCaseLinks, `/compare/${slug} has 0 use-case links`).toBeGreaterThanOrEqual(2);
    });
  }
});

// --- Blog posts must have ≥3 internal links ---

describe("blog posts have ≥3 internal links", () => {
  const blogFiles = readdirSync(BLOG_SRC)
    .filter((f) => f.endsWith(".md"));

  for (const file of blogFiles) {
    const content = readFileSync(resolve(BLOG_SRC, file), "utf-8");
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const isDraft = frontmatter?.[1]?.includes("draft: true");
    if (isDraft) continue;

    it(`${file} has ≥3 internal links`, () => {
      const internalLinks = (content.match(/\]\(\/[^)]+\)|href="\/[^"]+/g) || [])
        .filter((l) => !l.includes("/logo"));
      expect(
        internalLinks.length,
        `${file} has only ${internalLinks.length} internal links`
      ).toBeGreaterThanOrEqual(3);
    });
  }
});
