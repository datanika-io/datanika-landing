import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

// ---------------------------------------------------------------------------
// Breadcrumbs wired via Layout props (#46)
// ---------------------------------------------------------------------------

describe("compare pages emit BreadcrumbList (#46)", () => {
  const competitors = [
    { slug: "airbyte", name: "Airbyte" },
    { slug: "fivetran", name: "Fivetran" },
    { slug: "stitch", name: "Stitch" },
    { slug: "hevo", name: "Hevo Data" },
  ];

  for (const { slug, name } of competitors) {
    describe(`/compare/${slug}`, () => {
      let html: string;
      beforeAll(() => {
        html = readHtml(`compare/${slug}/index.html`);
      });

      it("emits BreadcrumbList JSON-LD", () => {
        expect(html).toContain('"@type":"BreadcrumbList"');
      });

      it("has Home → Compare → competitor list items", () => {
        expect(html).toContain('"item":"https://datanika.io/"');
        expect(html).toContain('"item":"https://datanika.io/compare"');
        expect(html).toContain(`"item":"https://datanika.io/compare/${slug}"`);
        expect(html).toContain(`"name":"${name}"`);
        expect(html).toContain('"position":3');
      });

      it("stays og:type=website (not article)", () => {
        expect(html).toMatch(/<meta\s+property="og:type"\s+content="website"/);
      });
    });
  }
});

describe("use-cases template emits BreadcrumbList (#46)", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("use-cases/postgresql-to-bigquery/index.html");
  });

  it("emits BreadcrumbList JSON-LD", () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it("has Home → Use Cases → slug list items", () => {
    expect(html).toContain('"item":"https://datanika.io/"');
    expect(html).toContain('"item":"https://datanika.io/use-cases"');
    expect(html).toContain(
      '"item":"https://datanika.io/use-cases/postgresql-to-bigquery"'
    );
    expect(html).toContain('"name":"Use Cases"');
    expect(html).toContain('"position":3');
  });

  it("stays og:type=website", () => {
    expect(html).toMatch(/<meta\s+property="og:type"\s+content="website"/);
  });
});

describe("connectors template emits BreadcrumbList (#46)", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/postgresql/index.html");
  });

  it("emits BreadcrumbList JSON-LD", () => {
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it("has Home → Connectors → slug list items", () => {
    expect(html).toContain('"item":"https://datanika.io/"');
    expect(html).toContain('"item":"https://datanika.io/connectors"');
    expect(html).toContain(
      '"item":"https://datanika.io/connectors/postgresql"'
    );
    expect(html).toContain('"name":"Connectors"');
    expect(html).toContain('"name":"PostgreSQL"');
    expect(html).toContain('"position":3');
  });

  it("stays og:type=website", () => {
    expect(html).toMatch(/<meta\s+property="og:type"\s+content="website"/);
  });
});
