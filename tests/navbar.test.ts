import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("navbar links", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("index.html");
  });

  it("has Connectors link", () => {
    expect(html).toContain('href="/connectors"');
  });

  it("has Use Cases link", () => {
    expect(html).toContain('href="/use-cases"');
  });

  it("has Pricing link", () => {
    expect(html).toContain('href="/pricing"');
  });

  it("has Docs link", () => {
    expect(html).toContain('href="/docs"');
  });

  it("has API link", () => {
    // Issue #105 — Approach B from SPEC_DOCS_IA_REDESIGN.md.
    // The API section is its own top-level entry between Docs and Blog.
    expect(html).toContain('href="/api"');
  });

  it("has Templates link", () => {
    // Issue #122 — Option C public template landing pages.
    // Sits between API and Blog, matching the user-chosen slot from
    // SPEC_PUBLIC_TEMPLATE_LANDING.md.
    expect(html).toContain('href="/templates"');
  });

  it("has Blog link", () => {
    expect(html).toContain('href="/blog"');
  });
});

describe("navbar app entry points — two doors, not one", () => {
  // Before 2026-09-05 the nav's only app link was the "Get Started" button
  // pointing at https://app.datanika.io, which for a signed-out visitor
  // resolves to /login. That single link had to serve both audiences and
  // served the wrong page to the one it was written for: a prospect got a
  // sign-in wall, and a returning user had no sign-in link anywhere on the
  // marketing site.
  let html: string;
  beforeAll(() => {
    html = readHtml("index.html");
  });

  it("offers a Sign in link pointing at /login", () => {
    expect(html).toContain('href="https://app.datanika.io/login"');
    expect(html).toMatch(/Sign in/);
  });

  it("points Get Started at /signup, not the authenticated app root", () => {
    expect(html).toContain('href="https://app.datanika.io/signup"');
  });

  it("renders both doors on desktop and on mobile", () => {
    // The mobile menu is a separate block in Navbar.astro; a fix applied to
    // only one of them is the shape of defect this catches.
    const logins = html.split('href="https://app.datanika.io/login"').length - 1;
    const signups = html.split('href="https://app.datanika.io/signup"').length - 1;
    expect(logins).toBeGreaterThanOrEqual(2);
    expect(signups).toBeGreaterThanOrEqual(2);
  });
});
