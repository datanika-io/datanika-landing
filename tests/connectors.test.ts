import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { connectors } from "../src/data/connectors";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

// Derived from the data file rather than duplicated here.
//
// This list was hardcoded in three separate test files, so withdrawing one
// connector (google-ads, core#567) meant editing the same list four times —
// counting the copy in connectors.ts itself — and any one of them could be
// missed. Deriving it means the data file is the single place a connector is
// added or removed, and these tests follow automatically.
const connectorSlugs = connectors.map((c) => c.slug);

describe("connector landing pages", () => {
  it("generates a page for every connector in the data file", () => {
    expect(connectorSlugs.length).toBeGreaterThan(30);
    for (const slug of connectorSlugs) {
      const file = resolve(DIST, `connectors/${slug}/index.html`);
      expect(existsSync(file), `Missing: /connectors/${slug}`).toBe(true);
    }
  });

  it("never both markets and redirects the same connector", () => {
    // This replaces a guard that named `google-ads` as withdrawn (core#567).
    // Naming the connector was the bug: the withdrawal was reversed in
    // core#592 and a literal cannot notice that.
    //
    // The durable invariant is the one that has teeth in both directions — a
    // slug must not appear in `connectors.ts` *and* in the redirect map at the
    // same time. Astro resolves the redirect first, so leaving a stale 301
    // behind silently shadows the page it points away from: the build passes,
    // the page exists in `dist/`, and every visitor still bounces to the
    // index. That is exactly the half-finished restore this test now catches.
    const config = readFileSync(resolve(__dirname, "../astro.config.mjs"), "utf-8");
    const redirectBlock = config.slice(
      config.indexOf("redirects: {"),
      config.indexOf("integrations:"),
    );
    const redirected = [...redirectBlock.matchAll(/^\s*"(\/connectors\/[^"]+)":/gm)].map(
      (m) => m[1],
    );
    const shadowed = connectorSlugs.filter((slug) =>
      redirected.includes(`/connectors/${slug}`),
    );
    expect(
      shadowed,
      `These connectors are in connectors.ts but still redirect away: ${shadowed.join(", ")}`,
    ).toEqual([]);
  });
});

describe("connector index page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/index.html");
  });

  it("exists", () => {
    expect(html).toBeTruthy();
  });

  it("has title", () => {
    expect(html).toContain("Connectors");
  });

  it("links to PostgreSQL", () => {
    expect(html).toContain('href="/connectors/postgresql"');
  });

  it("links to Stripe", () => {
    expect(html).toContain('href="/connectors/stripe"');
  });

  it("has CTA", () => {
    expect(html).toContain("app.datanika.io");
  });
});

describe("PostgreSQL connector page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/postgresql/index.html");
  });

  it("has connector name in title", () => {
    expect(html).toContain("PostgreSQL");
  });

  it("has use cases section", () => {
    expect(html.toLowerCase()).toContain("use case");
  });

  it("has configuration section", () => {
    expect(html).toContain("host");
    expect(html).toContain("port");
  });

  it("has CTA to sign up", () => {
    expect(html).toContain("app.datanika.io");
  });

  it("has related connectors", () => {
    expect(html).toContain('href="/connectors/');
  });
});

describe("Stripe connector page", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/stripe/index.html");
  });

  it("has connector name", () => {
    expect(html).toContain("Stripe");
  });

  it("is marked as source", () => {
    expect(html.toLowerCase()).toContain("source");
  });

  it("has api_key config field", () => {
    expect(html).toContain("api_key");
  });

  it("auto-links to the Stripe → Postgres template (issue #126)", () => {
    // Session 3 auto-cross-link: every connector page that matches a template's
    // source or destination slug must render a "Templates with <connector>" section.
    expect(html).toContain('href="/templates/stripe-to-postgres"');
    expect(html).toContain("Templates with Stripe");
  });
});

describe("PostgreSQL connector page — template cross-links", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/postgresql/index.html");
  });

  it("auto-links to both templates that use postgresql", () => {
    expect(html).toContain('href="/templates/stripe-to-postgres"');
    expect(html).toContain('href="/templates/postgres-to-bigquery"');
  });
});

describe("MongoDB connector page — no template cross-links", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("connectors/mongodb/index.html");
  });

  it("does not render a Templates section when no template matches", () => {
    // MongoDB is not a source or destination in any of the 3 launch templates,
    // so the auto-computed section must be absent (not empty-rendered).
    expect(html).not.toContain("Templates with MongoDB");
  });
});
