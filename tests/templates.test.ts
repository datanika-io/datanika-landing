/**
 * Build-output tests for /templates/* (Option C public template landing pages).
 * See plans/product/SPEC_PUBLIC_TEMPLATE_LANDING.md and issue #122.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { templates, templateSlugs } from "../src/data/templates";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("templates — static paths", () => {
  it("generates a detail page for every template slug", () => {
    for (const slug of templateSlugs) {
      const file = resolve(DIST, `templates/${slug}/index.html`);
      expect(existsSync(file), `Missing: /templates/${slug}`).toBe(true);
    }
  });

  it("generates the templates index page", () => {
    expect(existsSync(resolve(DIST, "templates/index.html"))).toBe(true);
  });
});

describe("templates index page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("templates/index.html");
  });

  it("has the Pipeline Templates H1", () => {
    expect(html).toContain("Pipeline Templates");
  });

  it("links to every template slug", () => {
    for (const slug of templateSlugs) {
      expect(html, `index missing link to /templates/${slug}`).toContain(
        `href="/templates/${slug}"`,
      );
    }
  });

  it("has canonical URL on /templates", () => {
    expect(html).toContain('rel="canonical" href="https://datanika.io/templates/"');
  });
});

describe("stripe-to-postgres template detail page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("templates/stripe-to-postgres/index.html");
  });

  it("has the SEO title with primary keyword first", () => {
    expect(html).toContain("Stripe to PostgreSQL Pipeline Template");
  });

  it("has the H1 inside an <h1> tag", () => {
    expect(html).toMatch(/<h1[^>]*>[\s\S]*?Stripe to PostgreSQL Pipeline Template[\s\S]*?<\/h1>/);
  });

  it("renders the try-template CTA with the exact deep link including slug", () => {
    expect(html).toContain(
      'href="https://app.datanika.io/pipelines/templates?template=stripe-to-postgres"',
    );
  });

  it("links to the source and destination connector pages", () => {
    expect(html).toContain('href="/connectors/stripe"');
    expect(html).toContain('href="/connectors/postgresql"');
  });

  it("renders the prerequisites list with every entry", () => {
    const tpl = templates.find((t) => t.slug === "stripe-to-postgres")!;
    for (const req of tpl.prerequisites) {
      // Check first 30 chars of each — enough to prove presence without
      // re-escaping the full sentence.
      expect(html).toContain(req.slice(0, 30));
    }
  });

  it("renders the what-it-loads section for each Python-enumerated resource", () => {
    const tpl = templates.find((t) => t.slug === "stripe-to-postgres")!;
    for (const resource of tpl.whatItLoads) {
      expect(html).toContain(resource);
    }
  });

  it("emits HowTo JSON-LD with the correct @type and name", () => {
    // Extract every ld+json block; expect one to be the HowTo.
    const blocks = Array.from(
      html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ).map((m) => m[1]);
    const parsed = blocks.map((b) => {
      try {
        return JSON.parse(b);
      } catch {
        return null;
      }
    });
    const howTo = parsed.find((p) => p && p["@type"] === "HowTo");
    expect(howTo, "HowTo JSON-LD block missing").toBeTruthy();
    expect(howTo.name).toBe("Stripe to PostgreSQL Pipeline Template");
    expect(Array.isArray(howTo.step)).toBe(true);
    expect(howTo.step.length).toBeGreaterThanOrEqual(4);
  });

  it("emits BreadcrumbList JSON-LD with Home → Templates → slug", () => {
    const blocks = Array.from(
      html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g),
    ).map((m) => m[1]);
    const parsed = blocks.map((b) => {
      try {
        return JSON.parse(b);
      } catch {
        return null;
      }
    });
    const breadcrumb = parsed.find((p) => p && p["@type"] === "BreadcrumbList");
    expect(breadcrumb, "BreadcrumbList JSON-LD block missing").toBeTruthy();
    const names = breadcrumb.itemListElement.map((el: { name: string }) => el.name);
    expect(names).toContain("Home");
    expect(names).toContain("Templates");
  });
});

describe("postgres-to-bigquery template detail page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("templates/postgres-to-bigquery/index.html");
  });

  it("renders the try-template CTA with the slug", () => {
    expect(html).toContain(
      'href="https://app.datanika.io/pipelines/templates?template=postgres-to-bigquery"',
    );
  });

  it("links to postgresql and bigquery connector pages", () => {
    expect(html).toContain('href="/connectors/postgresql"');
    expect(html).toContain('href="/connectors/bigquery"');
  });
});

describe("csv-to-duckdb template detail page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("templates/csv-to-duckdb/index.html");
  });

  it("renders the try-template CTA with the slug", () => {
    expect(html).toContain(
      'href="https://app.datanika.io/pipelines/templates?template=csv-to-duckdb"',
    );
  });

  it("advertises zero-credentials positioning in the hero", () => {
    expect(html.toLowerCase()).toContain("zero-credentials");
  });
});
