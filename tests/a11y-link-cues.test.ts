/**
 * landing#620: a link inside running text has a cue other than colour (WCAG 1.4.1), so it is underlined.
 *
 * axe over every page of a build of `dev` at 1920a42 reported `link-in-text-block` on **994 links on
 * 150 of 171 pages**. There were two shapes:
 *
 *   744  class-less links inside the `prose-docs` containers (DocsLayout, ApiLayout, blog posts),
 *        styled `[&_a]:text-violet-400 [&_a:hover]:underline`
 *   250  links classed `text-violet-400 hover:underline` or `text-emerald-400 hover:underline`
 *
 * Both were underlined on hover only, and a keyboard or touch user never hovers. The decision was made
 * once for the whole site: links in running text are underlined at rest.
 *
 * The container rule now applies to class-less anchors only. As `[&_a]` it also coloured a styled
 * call-to-action on /docs/getting-started, where violet text on a violet button failed colour-contrast.
 *
 * Checked statically, on every page:
 *   1. No link inside <main> (outside a <nav>) is underlined only on hover.
 *   2. Every prose-docs container carries the class-less-anchor underline rule.
 *   3. The compiled stylesheet contains that rule. A Tailwind class that was never compiled is a no-op
 *      that still reads as applied in the HTML. The class name is assembled from parts below, so that
 *      this file cannot be the reason it compiled.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative, sep } from "path";

const DIST = resolve(__dirname, "..", "dist");
/**
 * Built from parts on purpose. Tailwind scans every file in the project for class candidates, this one
 * included, so a literal here compiled the rule by itself: the stylesheet check below passed on a tree
 * whose pages did not use the class. Measured, by reverting the fix and rebuilding.
 */
const PROSE_UNDERLINE = ["[&_a:not([class])]", "underline"].join(":");

function walk(dir: string, ext: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, ext, out);
    else if (extname(entry) === ext) out.push(full);
  }
  return out;
}

/** The <main> region with any <nav> inside it removed: the running content of the page. */
function runningContent(html: string): string {
  const start = html.search(/<main[\s>]/);
  const end = html.indexOf("</main>");
  if (start === -1 || end === -1) return "";
  return html.slice(start, end).replace(/<nav\b[\s\S]*?<\/nav>/g, " ");
}

/** Anchors whose classes underline them on hover but not at rest. */
function hoverOnlyUnderlines(region: string): string[] {
  const out: string[] = [];
  for (const m of region.matchAll(/<a\b[^>]*\sclass="([^"]*)"[^>]*>/g)) {
    const cls = m[1].split(/\s+/);
    if (cls.includes("hover:underline") && !cls.includes("underline")) out.push(m[1]);
  }
  return out;
}

describe("links in running text are underlined (landing#620)", () => {
  const pages = existsSync(DIST)
    ? walk(DIST, ".html").map((f) => ({ page: relative(DIST, f).split(sep).join("/"), html: readFileSync(f, "utf-8") }))
    : [];

  it("reads a real build (anti-vacuity)", () => {
    expect(pages.length, "run `npm run build` first").toBeGreaterThan(100);
    // Counted over whole pages, not inside <main>: this proves the walk reads links at all, and must not
    // depend on the <main> fix that a11y-structure.test.ts guards.
    const anchors = pages.reduce((n, p) => n + (p.html.match(/<a\b/g) ?? []).length, 0);
    expect(anchors, "too few links read to mean anything").toBeGreaterThan(1000);
  });

  it("the checker flags the pre-fix class and passes the fixed one", () => {
    // From the build of dev at 1920a42 (/trust) and after this change.
    expect(hoverOnlyUnderlines('<main><p>see <a href="/dpa/" class="text-violet-400 hover:underline">the DPA</a></p></main>')).toHaveLength(1);
    expect(
      hoverOnlyUnderlines('<main><p>see <a href="/dpa/" class="text-violet-400 underline underline-offset-2 hover:text-violet-300">the DPA</a></p></main>'),
    ).toEqual([]);
    expect(runningContent('<nav><a class="hover:underline"></a></nav><main><nav><a class="hover:underline"></a></nav><p>x</p></main>')).not.toContain("hover:underline");
  });

  it("no link inside <main> is underlined only on hover", () => {
    const found = pages
      .map((p) => ({ page: p.page, bad: hoverOnlyUnderlines(runningContent(p.html)) }))
      .filter((p) => p.bad.length > 0);
    expect(
      found.length,
      `${found.length} page(s):\n` + found.slice(0, 10).map((p) => `  ${p.page}: ${p.bad.length}, e.g. class="${p.bad[0]}"`).join("\n"),
    ).toBe(0);
  });

  it("every prose-docs container underlines its class-less links", () => {
    const containers = pages.flatMap((p) =>
      [...p.html.matchAll(/class="(prose-docs[^"]*)"/g)].map((m) => ({ page: p.page, cls: m[1] })),
    );
    expect(containers.length, "the container walk found too few prose-docs containers").toBeGreaterThan(50);
    const missing = containers.filter((c) => !c.cls.split(/\s+/).includes(PROSE_UNDERLINE)).map((c) => c.page);
    expect(missing, `prose-docs without ${PROSE_UNDERLINE}:\n${missing.slice(0, 10).join("\n")}`).toEqual([]);
  });

  it("the compiled stylesheet actually contains the class-less-anchor underline rule", () => {
    const css = existsSync(resolve(DIST, "_astro")) ? walk(resolve(DIST, "_astro"), ".css").map((f) => readFileSync(f, "utf-8")).join("\n") : "";
    expect(css.length, "no compiled CSS found under dist/_astro").toBeGreaterThan(1000);
    expect(css).toMatch(/a:not\(\[class\]\)\{text-decoration-line:underline\}/);
  });
});
