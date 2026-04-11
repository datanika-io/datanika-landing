/**
 * Ensures every docs page has the same sidebar entries.
 * Prevents merge-related sidebar drift where different PRs
 * modify DocsLayout.astro independently.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";

const DIST = resolve(__dirname, "../dist/docs");

// All expected sidebar entries in order
const EXPECTED_SIDEBAR = [
  { label: "Overview", href: "/docs" },
  { label: "Getting Started", href: "/docs/getting-started" },
  { label: "Organizations & Members", href: "/docs/organizations" },
  { label: "Connections", href: "/docs/connections" },
  { label: "Connectors", href: "/docs/connectors" },
  { label: "Uploads", href: "/docs/uploads" },
  { label: "Transformations", href: "/docs/transformations" },
  { label: "Transformation Guide", href: "/docs/transformations-guide" },
  { label: "Pipelines", href: "/docs/pipelines" },
  { label: "Scheduling & Dependencies", href: "/docs/scheduling" },
  { label: "Scheduling Guide", href: "/docs/scheduling-guide" },
  { label: "Runs & Monitoring", href: "/docs/runs" },
  { label: "Data Catalog", href: "/docs/catalog" },
  { label: "File Uploads", href: "/docs/file-uploads" },
  { label: "API Keys", href: "/docs/api-keys" },
  { label: "API Reference", href: "/docs/api" },
  { label: "Audit Log", href: "/docs/audit-log" },
  { label: "Self-Hosting", href: "/docs/self-hosting" },
  { label: "Backup & Import", href: "/docs/ai-import" },
  { label: "Architecture", href: "/docs/architecture" },
];

function getDocPages(): string[] {
  if (!existsSync(DIST)) return [];
  const entries = readdirSync(DIST, { withFileTypes: true });
  const pages: string[] = [];

  // docs/index.html
  if (existsSync(join(DIST, "index.html"))) {
    pages.push("index");
  }

  // docs/*/index.html
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const file = join(DIST, entry.name, "index.html");
      if (existsSync(file)) {
        pages.push(entry.name);
      }
    }
  }

  return pages;
}

function extractSidebarLinks(html: string): string[] {
  // The sidebar is inside <aside> with class containing "md:block"
  // Each link is: <a href="/docs/..." class="block rounded-lg ...">Label</a>
  // We extract hrefs from the <nav class="sticky ..."> section
  const navMatch = html.match(/<nav class="sticky[^"]*">([\s\S]*?)<\/nav>/);
  if (!navMatch) return [];

  const links: string[] = [];
  const linkRegex = /href="(\/docs[^"]*)"/g;
  let match;
  while ((match = linkRegex.exec(navMatch[1])) !== null) {
    links.push(match[1]);
  }
  // Also include /docs itself (Overview link uses href="/docs")
  const overviewMatch = navMatch[1].match(/href="(\/docs)"/);
  if (overviewMatch && !links.includes("/docs")) {
    links.unshift("/docs");
  }
  return links;
}

describe("docs sidebar consistency", () => {
  const pages = getDocPages();
  const expectedHrefs = EXPECTED_SIDEBAR.map((s) => s.href);

  it("found doc pages to test", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it("has all expected sidebar entries in DocsLayout source", () => {
    // Verify the source of truth has the right count
    expect(EXPECTED_SIDEBAR.length).toBe(20);
  });

  it("includes the Connectors group between Connections and Uploads", () => {
    // Guardrail for the per-connector setup guide IA (PLAN_PRODUCT P0).
    // Mental model: connect (Connections) → configure (Connectors) → load (Uploads).
    const labels = EXPECTED_SIDEBAR.map((s) => s.label);
    const connectionsIdx = labels.indexOf("Connections");
    const connectorsIdx = labels.indexOf("Connectors");
    const uploadsIdx = labels.indexOf("Uploads");
    expect(connectorsIdx, "Connectors sidebar group is missing").toBeGreaterThan(-1);
    expect(connectorsIdx).toBe(connectionsIdx + 1);
    expect(uploadsIdx).toBe(connectorsIdx + 1);
    expect(EXPECTED_SIDEBAR[connectorsIdx].href).toBe("/docs/connectors");
  });

  it("every built docs page links to the Connectors group", () => {
    // Independent check so this fails loudly even if someone trims EXPECTED_SIDEBAR.
    const pages = getDocPages();
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const filePath =
        page === "index"
          ? join(DIST, "index.html")
          : join(DIST, page, "index.html");
      const html = readFileSync(filePath, "utf-8");
      const links = extractSidebarLinks(html);
      expect(
        links,
        `Page "/docs/${page}" is missing the Connectors sidebar link`
      ).toContain("/docs/connectors");
    }
  });

  for (const page of getDocPages()) {
    it(`page "${page}" has all ${EXPECTED_SIDEBAR.length} sidebar links`, () => {
      const filePath =
        page === "index"
          ? join(DIST, "index.html")
          : join(DIST, page, "index.html");
      const html = readFileSync(filePath, "utf-8");
      const sidebarLinks = extractSidebarLinks(html);

      for (const expected of expectedHrefs) {
        expect(
          sidebarLinks,
          `Page "/docs/${page}" missing sidebar link: ${expected}`
        ).toContain(expected);
      }
    });
  }
});
