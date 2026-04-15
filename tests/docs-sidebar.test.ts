/**
 * Ensures every docs page has the same sidebar entries.
 * Prevents merge-related sidebar drift where different PRs
 * modify DocsLayout.astro independently.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, join } from "path";

const DIST = resolve(__dirname, "../dist/docs");

// Sidebar IA — must mirror DocsLayout.astro `groups`. Issue #103.
// If you add a doc page, append it to the right group here AND in DocsLayout.
const EXPECTED_GROUPS = [
  {
    label: "Getting Started",
    items: [
      { label: "Overview", href: "/docs" },
      { label: "Getting Started", href: "/docs/getting-started" },
      { label: "Architecture", href: "/docs/architecture" },
    ],
  },
  {
    label: "Connect",
    items: [
      { label: "Connections", href: "/docs/connections" },
      { label: "Connectors", href: "/docs/connectors" },
      { label: "Uploads", href: "/docs/uploads" },
      { label: "File Uploads", href: "/docs/file-uploads" },
    ],
  },
  {
    label: "Build",
    items: [
      { label: "Transformations", href: "/docs/transformations" },
      { label: "Transformation Guide", href: "/docs/transformations-guide" },
      { label: "Data Catalog", href: "/docs/catalog" },
      { label: "AI Agents", href: "/docs/ai-agents" },
    ],
  },
  {
    label: "Run & Schedule",
    items: [
      { label: "Pipelines", href: "/docs/pipelines" },
      { label: "Scheduling & Dependencies", href: "/docs/scheduling" },
      { label: "Scheduling Guide", href: "/docs/scheduling-guide" },
      { label: "Runs & Monitoring", href: "/docs/runs" },
    ],
  },
  {
    label: "Operate",
    items: [
      { label: "Organizations & Members", href: "/docs/organizations" },
      { label: "Audit Log", href: "/docs/audit-log" },
      { label: "Self-Hosting", href: "/docs/self-hosting" },
      { label: "Backup & Import", href: "/docs/ai-import" },
    ],
  },
  // The API & Reference group used to live here. Issue #105 moved API docs
  // out of /docs/ entirely into a top-level /api/ section. See
  // tests/api-sidebar.test.ts for that section's consistency tests.
];

// Flat view kept for assertions that don't care about grouping.
const EXPECTED_SIDEBAR = EXPECTED_GROUPS.flatMap((g) => g.items);

// Pages that look like docs pages (have a /docs/<slug>/index.html) but are
// actually static redirect stubs emitted by astro.config.mjs `redirects`.
// They don't have a sidebar — they're just a meta refresh — so iterating
// them in sidebar consistency tests would fail spuriously.
const REDIRECT_STUBS = new Set(["api", "api-keys", "api-versioning"]);

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
    if (entry.isDirectory() && !REDIRECT_STUBS.has(entry.name)) {
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
    // 19 = 20 original entries minus API Reference and API Keys (moved to
    // /api/* in issue #105) plus AI Agents (added in issue #96, lives under
    // Build because it's a how-to for building agent-driven automations).
    expect(EXPECTED_SIDEBAR.length).toBe(19);
  });

  it("groups sidebar entries into 5 named groups", () => {
    // Issue #105 dropped the API & Reference group when API docs moved to
    // their own top-level section. If you change this, also update
    // plans/product/SPEC_DOCS_IA_REDESIGN.md and DocsLayout.astro `groups`.
    expect(EXPECTED_GROUPS).toHaveLength(5);
    const labels = EXPECTED_GROUPS.map((g) => g.label);
    expect(labels).toEqual([
      "Getting Started",
      "Connect",
      "Build",
      "Run & Schedule",
      "Operate",
    ]);
  });

  it("docs sidebar no longer references the moved /api/* paths", () => {
    // Regression guard for issue #105: a copy-paste accident that
    // re-introduced /docs/api or /docs/api-keys in the sidebar would silently
    // break the redirects (the old URL would become a real page again).
    const hrefs = EXPECTED_SIDEBAR.map((s) => s.href);
    expect(hrefs).not.toContain("/docs/api");
    expect(hrefs).not.toContain("/docs/api-keys");
  });

  it("every doc entry belongs to exactly one group", () => {
    // Catches typos and accidental duplicates between groups.
    const counts = new Map<string, number>();
    for (const group of EXPECTED_GROUPS) {
      for (const item of group.items) {
        counts.set(item.href, (counts.get(item.href) ?? 0) + 1);
      }
    }
    for (const [href, n] of counts) {
      expect(n, `${href} appears in ${n} groups, expected 1`).toBe(1);
    }
    expect(counts.size).toBe(EXPECTED_SIDEBAR.length);
  });

  it("every built doc page renders all 6 group <summary> elements", () => {
    // Issue #103. If a refactor accidentally drops one group from the layout,
    // this fails on every page instead of silently leaving entries unreachable.
    const pages = getDocPages();
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      const filePath =
        page === "index"
          ? join(DIST, "index.html")
          : join(DIST, page, "index.html");
      const html = readFileSync(filePath, "utf-8");
      for (const group of EXPECTED_GROUPS) {
        // Astro encodes `&` differently in attributes (`&#38;`) vs text
        // content (`&amp;`). Encode both ways and check they're present.
        const attrLabel = group.label.replace(/&/g, "&#38;");
        const textLabel = group.label.replace(/&/g, "&amp;");
        expect(
          html.includes(`data-sidebar-group="${attrLabel}"`),
          `Page "/docs/${page}" missing data-sidebar-group="${group.label}"`
        ).toBe(true);
        expect(
          html.includes(`<span>${textLabel}</span>`),
          `Page "/docs/${page}" missing <summary> text "${group.label}"`
        ).toBe(true);
      }
    }
  });

  it("active page's group renders with `open` attribute (no JS flash)", () => {
    // The Astro side renders the group containing the current page as
    // `<details ... open>` so the user lands on a useful sidebar even with
    // empty localStorage. Pick one page from each group and verify.
    const samples = [
      { page: "architecture", expectedGroup: "Getting Started" },
      { page: "connections", expectedGroup: "Connect" },
      { page: "transformations", expectedGroup: "Build" },
      { page: "pipelines", expectedGroup: "Run & Schedule" },
      { page: "self-hosting", expectedGroup: "Operate" },
      // No "api" sample anymore — moved to /api/* in issue #105 with its
      // own ApiLayout and tests/api-sidebar.test.ts.
    ];
    for (const { page, expectedGroup } of samples) {
      const filePath = join(DIST, page, "index.html");
      if (!existsSync(filePath)) continue; // page may not exist in dev builds
      const html = readFileSync(filePath, "utf-8");
      const attrLabel = expectedGroup.replace(/&/g, "&#38;");
      // Astro emits attributes in source order: class, data-sidebar-group, open.
      // Match the full opening tag for the active group and assert it contains
      // a bare `open` attribute. Order-independent within the tag.
      const tagRe = new RegExp(
        `<details\\b[^>]*\\bdata-sidebar-group="${attrLabel}"[^>]*>`
      );
      const tagMatch = html.match(tagRe);
      expect(
        tagMatch,
        `Page "/docs/${page}" missing <details> tag for group "${expectedGroup}"`
      ).not.toBeNull();
      expect(
        tagMatch![0],
        `Page "/docs/${page}" should render group "${expectedGroup}" with open attribute by default`
      ).toMatch(/\bopen\b/);
    }
  });

  it("mobile <select> uses <optgroup> for each sidebar group", () => {
    // Mobile users should see the same IA as desktop. <optgroup> is the
    // semantic equivalent of <details>/<summary> in a native <select>.
    const pages = getDocPages();
    expect(pages.length).toBeGreaterThan(0);
    const filePath =
      pages[0] === "index"
        ? join(DIST, "index.html")
        : join(DIST, pages[0], "index.html");
    const html = readFileSync(filePath, "utf-8");
    for (const group of EXPECTED_GROUPS) {
      const attrLabel = group.label.replace(/&/g, "&#38;");
      expect(
        html.includes(`<optgroup label="${attrLabel}">`),
        `Mobile <select> missing <optgroup label="${group.label}">`
      ).toBe(true);
    }
  });

  it("sidebar nav is sticky and independently scrollable", () => {
    // Regression guard for issue #100: pages below "Audit Log" used to be
    // unreachable without scrolling the entire page because the sticky nav
    // had no max-height + overflow. If you remove either of these classes,
    // the sidebar grows past the viewport and lower entries become invisible.
    const pages = getDocPages();
    expect(pages.length).toBeGreaterThan(0);
    // Check the longest page so we know the fix holds even when content is huge.
    const filePath = existsSync(join(DIST, "architecture", "index.html"))
      ? join(DIST, "architecture", "index.html")
      : join(DIST, pages[0] === "index" ? "index.html" : `${pages[0]}/index.html`);
    const html = readFileSync(filePath, "utf-8");
    const navMatch = html.match(/<nav class="(sticky[^"]*)">/);
    expect(navMatch, "sidebar <nav class=\"sticky ...\"> not found").not.toBeNull();
    const navClasses = navMatch![1];
    expect(navClasses, "sidebar nav must have a viewport-bounded max-height").toMatch(
      /max-h-\[calc\(100vh-/
    );
    expect(navClasses, "sidebar nav must scroll independently when entries overflow").toContain(
      "overflow-y-auto"
    );
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
