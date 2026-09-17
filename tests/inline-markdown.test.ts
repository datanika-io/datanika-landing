/**
 * landing#609: inline markdown reaches the reader rendered, never as literal
 * backticks or asterisks.
 *
 * What happened. /ai-agents and /docs/ai-agents printed a tier summary as
 * "Trigger runs synchronously with `?wait=true`, …", backticks included. Core
 * authors the summary in markdown style and both pages interpolated it as text.
 * A sweep of the whole build found the same defect on four more pages: a pricing
 * FAQ answer, a connector field description and a template prerequisite, each a
 * data-file string interpolated by a template, and a Databricks GRANT whose
 * principal name is itself backtick-quoted, so CommonMark closed the code span
 * early and the reader got half a statement.
 *
 * So the dist/ half of this file sweeps every built page rather than the two the
 * issue named. The unit half holds the renderer to escaping first, and checks the
 * checked-in agent-tiers snapshot, which is what a build renders when the live
 * fetch fails. The dist/ sweep covers whichever source the build actually used.
 *
 * One deliberate exception: a blog post whose frontmatter title carries a code
 * span. That title is also the <title>, og:title, the JSON-LD headline, the RSS
 * entry and the syndicated dev.to title, all plain text, so the heading shows the
 * same string the reader saw in the search result. The exemption is derived from
 * the titles, limited to pages under blog/, and fails when it goes stale.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative, sep } from "path";
import { renderInline } from "../src/utils/inline-markdown";
import fallback from "../src/data/agent-tiers.fallback.json";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const BLOG_SRC = resolve(ROOT, "src/content/blog");

// ------------------------------------------------------------------ renderer

describe("renderInline", () => {
  it("renders a code span and bold", () => {
    expect(renderInline("Use `?wait=true` for **sync** runs")).toBe(
      "Use <code>?wait=true</code> for <strong>sync</strong> runs",
    );
  });

  it("escapes HTML before rendering, so a placeholder stays text", () => {
    // Without escaping, set:html would parse <upload> as a tag and the reader
    // would see "___" with the names gone.
    expect(renderInline("Load `<upload>___<table>` & check")).toBe(
      "Load <code>&lt;upload&gt;___&lt;table&gt;</code> &amp; check",
    );
  });

  it("leaves a string with no markdown as text", () => {
    expect(renderInline("Discover & Introspect")).toBe("Discover &amp; Introspect");
  });
});

describe("the checked-in agent-tiers snapshot renders with no delimiter left", () => {
  // Every field core authors as prose. Names, endpoints and error codes are
  // identifiers and are rendered as text on purpose.
  const prose: [string, string][] = [
    ...fallback.tiers.map((t, i): [string, string] => [`tiers[${i}].summary`, t.summary]),
    ...fallback.tiers.flatMap((t, i) =>
      t.capabilities.map((c, j): [string, string] => [`tiers[${i}].capabilities[${j}].description`, c.description]),
    ),
    ...fallback.golden_path.map((s, i): [string, string] => [`golden_path[${i}]`, s]),
    ...fallback.error_codes.flatMap((e, i): [string, string][] => [
      [`error_codes[${i}].meaning`, e.meaning],
      [`error_codes[${i}].action`, e.action],
    ]),
    ...fallback.ui_only_operations.map((s, i): [string, string] => [`ui_only_operations[${i}]`, s]),
  ];

  it("reads the prose fields (guards an extraction that finds nothing)", () => {
    expect(prose.length).toBeGreaterThan(fallback.tiers.length);
  });

  it("no rendered prose field still carries a backtick or **", () => {
    const left = prose
      .map(([field, s]) => [field, renderInline(s)] as const)
      .filter(([, html]) => html.includes("`") || html.includes("**"))
      .map(([field, html]) => `${field}: ${html}`);
    expect(left).toEqual([]);
  });
});

// --------------------------------------------------------------------- dist/

/** The text a reader sees in a page body, with code blocks and inline code removed. */
function proseOf(html: string): string {
  const body = html.slice(Math.max(0, html.indexOf("<body")));
  return body
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<pre\b[\s\S]*?<\/pre>/gi, " ")
    .replace(/<code\b[\s\S]*?<\/code>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#96;|&#x60;|&grave;/gi, "`");
}

/** Every place a reader would see a markdown delimiter, with context. */
function delimitersIn(prose: string): string[] {
  const out: string[] = [];
  for (const m of prose.matchAll(/`|\*\*/g)) {
    out.push(prose.slice(Math.max(0, m.index! - 40), m.index! + 40).replace(/\s+/g, " ").trim());
  }
  return out;
}

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (extname(entry) === ".html") out.push(full);
  }
  return out;
}

/** Code spans in the frontmatter titles of blog posts that were built. */
function builtPostTitleSpans(): { slug: string; span: string }[] {
  const out: { slug: string; span: string }[] = [];
  for (const file of readdirSync(BLOG_SRC).filter((f) => f.endsWith(".md"))) {
    const slug = file.replace(/\.md$/, "");
    if (!existsSync(resolve(DIST, "blog", slug, "index.html"))) continue;
    const front = readFileSync(resolve(BLOG_SRC, file), "utf-8").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const title = front?.[1].match(/^title:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|(.+?))\s*$/m);
    const text = title ? (title[1] ?? title[2] ?? title[3] ?? "") : "";
    for (const m of text.matchAll(/`[^`]+`/g)) out.push({ slug, span: m[0] });
  }
  return out;
}

describe("no built page shows inline markdown unrendered (landing#609)", () => {
  const pages = existsSync(DIST) ? walkHtml(DIST) : [];
  const exemptions = existsSync(DIST) ? builtPostTitleSpans() : [];

  it("dist/ exists and holds a plausible number of pages", () => {
    expect(pages.length, "run `npm run build` first").toBeGreaterThan(100);
  });

  it("the detector fires on the pre-fix render and not on the fixed one", () => {
    // Real output from the build of dev at ba968e5, before this change.
    const before =
      '<p class="text-sm text-slate-400 mb-3">Trigger runs synchronously with `?wait=true`, retry safely with Idempotency-Key headers, monitor history, and browse the auto-generated catalog.</p>';
    const databricksBefore =
      "As a catalog admin, run: <code>GRANT USE SCHEMA, CREATE TABLE, MODIFY ON SCHEMA main.raw_data TO \\</code>datanika-loader`;<code>. Replace </code>main.raw_data` with your catalog.schema.</p>";
    expect(delimitersIn(proseOf(`<body>${before}`)).length).toBeGreaterThan(0);
    expect(delimitersIn(proseOf(`<body>${databricksBefore}`)).length).toBeGreaterThan(0);

    const after = `<p class="text-sm text-slate-400 mb-3">${renderInline("Trigger runs synchronously with `?wait=true`, retry safely")}</p>`;
    expect(delimitersIn(proseOf(`<body>${after}`))).toEqual([]);
    // A backtick inside a code block or inline code is content, not a rendering defect.
    expect(delimitersIn(proseOf("<body><pre><code>echo `date`</code></pre><p><code>a`b</code></p>"))).toEqual([]);
  });

  it("each blog-title exemption is still needed (guards a stale exemption)", () => {
    for (const { slug, span } of exemptions) {
      const prose = proseOf(readFileSync(resolve(DIST, "blog", slug, "index.html"), "utf-8"));
      expect(prose.includes(span), `blog/${slug} no longer shows ${span} literally: drop the exemption`).toBe(true);
    }
  });

  it("every page shows its inline markdown rendered", () => {
    const violations: string[] = [];
    for (const file of pages) {
      const page = relative(DIST, file).split(sep).join("/");
      let prose = proseOf(readFileSync(file, "utf-8"));
      if (page.startsWith("blog/")) {
        for (const { span } of exemptions) prose = prose.split(span).join(" ");
      }
      for (const context of delimitersIn(prose)) violations.push(`${page}: …${context}…`);
    }
    expect(
      violations,
      "A reader sees markdown delimiters as text. Render the string with renderInline " +
        "(src/utils/inline-markdown.ts) via set:html, or fix the markdown source:\n" +
        violations.join("\n"),
    ).toEqual([]);
  });
});
