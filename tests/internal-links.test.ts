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

// --- Docs pages cross-link to service connectors (issue #117) ---
//
// Each of these 5 high-traffic docs pages gets a "Related Connectors" section
// driven by src/components/RelatedConnectors.astro. Filter logic lives in the
// individual .astro pages so each context can tune its own list — the tests
// below pin the *expected result counts* so a drift in either the filter or
// the underlying connectors.ts data is caught immediately.

function uniqueConnectorLinks(html: string): Set<string> {
  const matches = html.match(/href="\/connectors\/[^"#]*"/g) || [];
  return new Set(matches);
}

describe("docs pages cross-link service connectors (#117)", () => {
  it("/docs/connections links to all 32 connectors", () => {
    // The page groups connectors by category and renders every one. If a
    // new connector is added to src/data/connectors.ts, this count changes
    // and the test flags that the expected count needs updating.
    const html = readHtml("docs/connections/index.html");
    const links = uniqueConnectorLinks(html);
    expect(links.size, `/docs/connections should link all 32 connectors`).toBe(32);
  });

  it("/docs/pipelines links to the 5 Pipeline Templates connectors", () => {
    // Must match the TEMPLATE_CONNECTOR_SLUGS set in the pipelines page,
    // which mirrors the Pipeline Templates MVP shipped in core PR #81.
    const html = readHtml("docs/pipelines/index.html");
    const links = uniqueConnectorLinks(html);
    for (const slug of ["stripe", "postgresql", "bigquery", "csv", "duckdb"]) {
      expect(
        links.has(`href="/connectors/${slug}"`),
        `/docs/pipelines missing template connector /connectors/${slug}`
      ).toBe(true);
    }
    expect(links.size).toBe(5);
  });

  it("/docs/transformations links to 6 materialized-destination connectors", () => {
    // Filter: direction !== "source" AND (category === "Cloud Warehouse" OR
    // slug === "clickhouse"). Currently BigQuery, Snowflake, Redshift,
    // Databricks, Synapse, ClickHouse.
    const html = readHtml("docs/transformations/index.html");
    const links = uniqueConnectorLinks(html);
    for (const slug of [
      "bigquery",
      "snowflake",
      "redshift",
      "databricks",
      "synapse",
      "clickhouse",
    ]) {
      expect(
        links.has(`href="/connectors/${slug}"`),
        `/docs/transformations missing warehouse /connectors/${slug}`
      ).toBe(true);
    }
    expect(links.size).toBe(6);
  });

  it("/docs/getting-started links to the 5 Tier 1 connectors", () => {
    const html = readHtml("docs/getting-started/index.html");
    const links = uniqueConnectorLinks(html);
    for (const slug of ["stripe", "postgresql", "bigquery", "snowflake", "salesforce"]) {
      expect(
        links.has(`href="/connectors/${slug}"`),
        `/docs/getting-started missing Tier 1 /connectors/${slug}`
      ).toBe(true);
    }
    expect(links.size).toBe(5);
  });

  it("/docs/architecture links to all 11 destination connectors", () => {
    // Filter: direction !== "source". Currently 6 databases + 5 cloud
    // warehouses = 11. If connectors.ts grows a new destination type (e.g.,
    // Motherduck), this count changes and the test will flag it.
    const html = readHtml("docs/architecture/index.html");
    const links = uniqueConnectorLinks(html);
    expect(
      links.size,
      `/docs/architecture should link all destination connectors`
    ).toBe(11);
    // Sanity: must include the cloud warehouses by name.
    for (const slug of ["bigquery", "snowflake", "redshift", "databricks", "synapse"]) {
      expect(
        links.has(`href="/connectors/${slug}"`),
        `/docs/architecture missing /connectors/${slug}`
      ).toBe(true);
    }
  });
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
