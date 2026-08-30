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

// ---------------------------------------------------------------------------
// #380 — a use case and a tutorial sharing a slug must stack, not compete
// ---------------------------------------------------------------------------

/**
 * GSC, 2026-07-29 -> 2026-08-28: `export postgresql to bigquery` returned BOTH
 * `/use-cases/postgresql-to-bigquery/` (pos 57.5, 28 imp) and
 * `/blog/postgresql-to-bigquery/` (pos 57.3, 11 imp) in the same 30 days, and
 * again in the 30 days before that. Two of our pages splitting one intent, with
 * neither near the surface.
 *
 * The audit that produced this checked all 401 queries with a ranking page:
 * **20 had more than one**, and after discounting trailing-slash pairs (already
 * 301'd and decaying — 56 impressions in Mar-May, 8 in the last 30 days) this is
 * the only page-vs-page overlap worth resolving. So: an inventory, not a sample.
 *
 * The fix is a hierarchy, not a canonical tag: these are not duplicates. The
 * use-case page is the transactional answer and the tutorial is the depth, so
 * each links to the other with intent-matching anchor text.
 */
describe("use case and tutorial pairs link to each other (#380)", () => {
  it("a tutorial sharing a use-case slug links up to it, and back", () => {
    const pairs = [["postgresql-to-bigquery", "PostgreSQL to BigQuery"]];
    for (const [slug] of pairs) {
      const post = readFileSync(
        resolve(__dirname, `../src/content/blog/${slug}.md`),
        "utf-8",
      );
      expect(
        post,
        `/blog/${slug}/ must link to its canonical use-case page, or the two keep ` +
          "splitting the same query",
      ).toContain(`/use-cases/${slug}/`);

      const usecase = readFileSync(
        resolve(__dirname, `../dist/use-cases/${slug}/index.html`),
        "utf-8",
      );
      expect(usecase).toContain(`/blog/${slug}/`);
    }
  });
});
