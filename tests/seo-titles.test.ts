/**
 * SEO title/meta consistency checks.
 *
 * Rules (from plans/SEO_KEYWORDS.md):
 * - Title ≤ 60 characters
 * - Meta description 150–160 characters
 * - Primary keyword appears in title
 * - Non-default title (not the Layout.astro fallback)
 *
 * Fixture list starts with Tier 1 (10 pages). As Tier 2 / Tier 3 rewrites
 * land, add their slugs to the `enforced` arrays below.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");
const LAYOUT_DEFAULT_TITLE = "Datanika — Your Data Pipeline Platform";

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

function extractTitle(html: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1].trim() : "";
}

function extractMeta(html: string): string {
  const m = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  return m ? m[1].trim() : "";
}

// --- Tier 1: 10 pages that were rewritten in datanika-landing#57 ---

interface TierSpec {
  path: string;
  primaryKeyword: string;
  // The visible piece of the title that MUST appear verbatim. Case-insensitive
  // match so "Fivetran Alternative" matches "Fivetran alternative" etc.
  titleMustContain: string;
}

const tier1: TierSpec[] = [
  { path: "compare/fivetran/index.html", primaryKeyword: "fivetran alternative", titleMustContain: "Fivetran Alternative" },
  { path: "compare/airbyte/index.html", primaryKeyword: "airbyte alternative", titleMustContain: "Airbyte Alternative" },
  { path: "compare/hevo/index.html", primaryKeyword: "hevo data alternative", titleMustContain: "Hevo Data Alternative" },
  { path: "use-cases/postgresql-to-bigquery/index.html", primaryKeyword: "postgresql to bigquery", titleMustContain: "PostgreSQL to BigQuery" },
  { path: "use-cases/postgresql-to-snowflake/index.html", primaryKeyword: "postgresql to snowflake", titleMustContain: "PostgreSQL to Snowflake" },
  { path: "use-cases/stripe-to-bigquery/index.html", primaryKeyword: "stripe to bigquery", titleMustContain: "Stripe to BigQuery" },
  { path: "connectors/bigquery/index.html", primaryKeyword: "bigquery etl tool", titleMustContain: "BigQuery ETL" },
  { path: "connectors/snowflake/index.html", primaryKeyword: "snowflake data pipeline", titleMustContain: "Snowflake Data Pipeline" },
  { path: "connectors/stripe/index.html", primaryKeyword: "stripe data pipeline", titleMustContain: "Stripe Data Pipeline" },
  { path: "connectors/salesforce/index.html", primaryKeyword: "salesforce etl", titleMustContain: "Salesforce ETL" },
];

describe("Tier 1 SEO title/meta compliance", () => {
  for (const spec of tier1) {
    describe(spec.path, () => {
      const html = readHtml(spec.path);
      const title = extractTitle(html);
      const meta = extractMeta(html);

      it("title is not the Layout default", () => {
        expect(title).not.toBe(LAYOUT_DEFAULT_TITLE);
      });

      it("title is ≤ 60 characters", () => {
        expect(title.length, `title is ${title.length} chars: "${title}"`).toBeLessThanOrEqual(60);
      });

      it("title contains primary keyword", () => {
        expect(title.toLowerCase()).toContain(spec.titleMustContain.toLowerCase());
      });

      it("title ends with | Datanika", () => {
        expect(title).toMatch(/\|\s*Datanika\s*$/);
      });

      it("meta description is 150–160 characters", () => {
        expect(meta.length, `meta is ${meta.length} chars: "${meta}"`).toBeGreaterThanOrEqual(150);
        expect(meta.length, `meta is ${meta.length} chars: "${meta}"`).toBeLessThanOrEqual(160);
      });

      it("visible H1 exists and is not empty", () => {
        const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
        expect(h1Match, "no <h1> found").not.toBeNull();
        // Strip inner HTML tags for text content check
        const h1Text = h1Match![1].replace(/<[^>]*>/g, "").trim();
        expect(h1Text.length).toBeGreaterThan(0);
      });
    });
  }
});

// --- Regression guard: every connector/use-case/comparison page has a custom title ---
// This prevents future pages from shipping with the Layout default title.

const allConnectorSlugs = [
  "postgresql", "mysql", "mssql", "sqlite", "clickhouse", "duckdb",
  "bigquery", "snowflake", "redshift", "databricks", "synapse",
  "mongodb",
  "stripe", "github", "hubspot", "salesforce", "shopify", "jira", "slack",
  "google-analytics", "google-ads", "facebook-ads", "zendesk", "airtable", "notion", "rest-api",
  "csv", "json", "parquet", "s3", "google-sheets", "kafka",
];

const allUseCaseSlugs = [
  "postgresql-to-bigquery", "postgresql-to-snowflake", "mysql-to-bigquery",
  "mongodb-to-snowflake", "stripe-to-bigquery", "hubspot-to-snowflake",
  "salesforce-to-bigquery", "shopify-to-bigquery", "kafka-to-clickhouse",
  "s3-to-snowflake",
];

const allCompareSlugs = ["airbyte", "fivetran", "hevo", "stitch"];

describe("every SEO page has a custom <title>", () => {
  it("connector pages have non-default titles", () => {
    for (const slug of allConnectorSlugs) {
      const html = readHtml(`connectors/${slug}/index.html`);
      const title = extractTitle(html);
      expect(title, `/connectors/${slug} has default title`).not.toBe(LAYOUT_DEFAULT_TITLE);
      expect(title.length, `/connectors/${slug} title is empty`).toBeGreaterThan(0);
    }
  });

  it("use-case pages have non-default titles", () => {
    for (const slug of allUseCaseSlugs) {
      const html = readHtml(`use-cases/${slug}/index.html`);
      const title = extractTitle(html);
      expect(title, `/use-cases/${slug} has default title`).not.toBe(LAYOUT_DEFAULT_TITLE);
      expect(title.length).toBeGreaterThan(0);
    }
  });

  it("comparison pages have non-default titles", () => {
    for (const slug of allCompareSlugs) {
      const html = readHtml(`compare/${slug}/index.html`);
      const title = extractTitle(html);
      expect(title, `/compare/${slug} has default title`).not.toBe(LAYOUT_DEFAULT_TITLE);
      expect(title.length).toBeGreaterThan(0);
    }
  });
});
