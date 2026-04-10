import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

function ogPath(relative: string): string {
  return resolve(DIST, "og", relative);
}

/**
 * Parse width and height from a PNG file header. PNG IHDR chunk starts
 * at byte 16; width (4 bytes) + height (4 bytes) big-endian.
 */
function pngDimensions(file: string): { width: number; height: number } {
  const buf = readFileSync(file);
  // Sanity-check PNG magic number
  expect(buf.slice(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  );
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

// ---------------------------------------------------------------------------
// PNG generation
// ---------------------------------------------------------------------------

describe("OG image generation (#55)", () => {
  it("generates a blog post OG image", () => {
    const file = ogPath("blog/introducing-datanika.png");
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(5000);
  });

  it("generates a connector OG image", () => {
    const file = ogPath("connectors/postgresql.png");
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(5000);
  });

  it("generates a use-case OG image", () => {
    const file = ogPath("use-cases/postgresql-to-bigquery.png");
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(5000);
  });

  it("generates all 4 compare OG images", () => {
    for (const slug of ["airbyte", "fivetran", "stitch", "hevo"]) {
      const file = ogPath(`compare/${slug}.png`);
      expect(existsSync(file), `missing ${slug}`).toBe(true);
    }
  });

  it("every generated PNG is 1200×630", () => {
    const samples = [
      "blog/introducing-datanika.png",
      "connectors/postgresql.png",
      "use-cases/postgresql-to-bigquery.png",
      "compare/fivetran.png",
    ];
    for (const rel of samples) {
      const { width, height } = pngDimensions(ogPath(rel));
      expect(width).toBe(1200);
      expect(height).toBe(630);
    }
  });
});

// ---------------------------------------------------------------------------
// Layout picks up the derived URL
// ---------------------------------------------------------------------------

describe("Layout auto-derives OG image from collection+slug (#55)", () => {
  it("blog post uses /og/blog/<slug>.png", () => {
    const html = readHtml("blog/introducing-datanika/index.html");
    expect(html).toContain(
      'content="https://datanika.io/og/blog/introducing-datanika.png"',
    );
  });

  it("connector page uses /og/connectors/<slug>.png", () => {
    const html = readHtml("connectors/postgresql/index.html");
    expect(html).toContain(
      'content="https://datanika.io/og/connectors/postgresql.png"',
    );
  });

  it("use-case page uses /og/use-cases/<slug>.png", () => {
    const html = readHtml("use-cases/postgresql-to-bigquery/index.html");
    expect(html).toContain(
      'content="https://datanika.io/og/use-cases/postgresql-to-bigquery.png"',
    );
  });

  it("compare page uses /og/compare/<slug>.png (fivetran)", () => {
    const html = readHtml("compare/fivetran/index.html");
    expect(html).toContain(
      'content="https://datanika.io/og/compare/fivetran.png"',
    );
  });

  it("all 4 compare pages point at their own OG image", () => {
    for (const slug of ["airbyte", "fivetran", "stitch", "hevo"]) {
      const html = readHtml(`compare/${slug}/index.html`);
      expect(html).toContain(
        `content="https://datanika.io/og/compare/${slug}.png"`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Fallback still works
// ---------------------------------------------------------------------------

describe("/logo.png fallback preserved (#55)", () => {
  it("homepage (no collection/slug) still uses logo.png", () => {
    const html = readHtml("index.html");
    expect(html).toContain(
      'content="https://datanika.io/logo.png"',
    );
    expect(html).not.toMatch(/og:image"\s+content="https:\/\/datanika\.io\/og\//);
  });

  it("pricing page still uses logo.png", () => {
    const html = readHtml("pricing/index.html");
    expect(html).toContain(
      'content="https://datanika.io/logo.png"',
    );
  });

  it("test-fixtures page with explicit ogImage is untouched", () => {
    // The test fixture explicitly sets `/og/test-fixture.png`. It must
    // not be overridden by auto-derivation (no ogCollection/ogSlug there).
    const html = readHtml("test-fixtures/layout-fixture/index.html");
    expect(html).toContain(
      'content="https://datanika.io/og/test-fixture.png"',
    );
  });
});

// ---------------------------------------------------------------------------
// Growth's rich-result story: no SEO page falls back to /logo.png
// ---------------------------------------------------------------------------

describe("Growth SEO pages all have custom OG images (#55)", () => {
  it("no blog post falls back to /logo.png in og:image", () => {
    // Sample a few blog posts; each must point to its own /og/blog/...
    const posts = [
      "blog/introducing-datanika/index.html",
      "blog/postgresql-to-bigquery/index.html",
      "blog/slack-alerts-pipeline-failures/index.html",
      "blog/datanika-rest-api-v1/index.html",
    ];
    for (const p of posts) {
      const html = readHtml(p);
      expect(
        /<meta\s+property="og:image"\s+content="https:\/\/datanika\.io\/logo\.png"/.test(
          html,
        ),
        `${p} still falls back to /logo.png`,
      ).toBe(false);
    }
  });

  it("no connector page falls back to /logo.png in og:image", () => {
    const connectors = [
      "connectors/postgresql",
      "connectors/stripe",
      "connectors/bigquery",
      "connectors/snowflake",
    ];
    for (const slug of connectors) {
      const html = readHtml(`${slug}/index.html`);
      expect(
        /<meta\s+property="og:image"\s+content="https:\/\/datanika\.io\/logo\.png"/.test(
          html,
        ),
        `${slug} still falls back to /logo.png`,
      ).toBe(false);
    }
  });
});
