/**
 * landing#611: structural accessibility properties every built page must have.
 *
 * QA's core#720 sweep runs axe against three production pages. It found /pricing
 * serving no <h1> and no <main>, a docs page with two unnamed <nav> landmarks, and
 * the logo's alt text repeating the brand name beside it. Measured over the whole
 * build of `dev` at ba968e5, each of those, and two more, turned out to be a
 * property of a template rather than of a page:
 *
 *   no <h1>                           38 pages: /pricing and all 37 connector setup guides
 *   two <nav>, neither named          62 pages: every page on DocsLayout or ApiLayout
 *   logo alt repeats the link text   171 pages: the navbar and footer on every page
 *                                               that has them
 *   form control with no name         63 pages: the docs and API page pickers, and the
 *                                               /why-cheaper volume input
 *   scrollable <pre>, not focusable    6 pages: keyboard users cannot scroll them
 *
 * These are static properties of the HTML, so they are checked here, on every
 * page and at build time, rather than on three pages in a browser. Colour contrast
 * needs rendering, and stays with axe (see a11y-contrast-classes.test.ts for the
 * source-side half).
 *
 * Not covered yet, measured and tracked separately: 101 pages still have no <main>,
 * and links inside running text are marked by colour alone.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative, sep } from "path";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

// ------------------------------------------------------------------ checkers

/** Number of <h1> elements. */
function h1Count(html: string): number {
  return (html.match(/<h1[\s>]/gi) ?? []).length;
}

/** When a page has more than one <nav>, each needs its own name. Returns the problems. */
function navProblems(html: string): string[] {
  const navs = [...html.matchAll(/<nav\b([^>]*)>/gi)].map((m) => m[1]);
  if (navs.length < 2) return [];
  const names = navs.map(
    (attrs) => attrs.match(/\saria-label=["']([^"']+)["']/)?.[1] ?? attrs.match(/\saria-labelledby=["']([^"']+)["']/)?.[1] ?? "",
  );
  const problems: string[] = [];
  if (names.some((n) => n.trim() === "")) problems.push(`${navs.length} <nav> elements, ${names.filter((n) => !n.trim()).length} unnamed`);
  const named = names.filter((n) => n.trim() !== "");
  if (new Set(named).size !== named.length) problems.push(`<nav> names repeat: ${named.join(", ")}`);
  return problems;
}

/** An <img> inside a link or button whose alt text repeats that element's own text. */
function redundantAlts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const inner = m[2];
    for (const img of inner.matchAll(/<img\b[^>]*\salt=["']([^"']+)["'][^>]*>/gi)) {
      const text = inner.replace(/<img\b[^>]*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text.toLowerCase().includes(img[1].trim().toLowerCase())) out.push(`alt="${img[1]}" beside "${text.slice(0, 40)}"`);
    }
  }
  return out;
}

/** Form controls with no accessible name: no aria-label, no aria-labelledby, no <label>. */
function unnamedControls(html: string): string[] {
  const labelledIds = new Set([...html.matchAll(/<label\b[^>]*\sfor=["']([^"']+)["']/gi)].map((m) => m[1]));
  const wrapped: [number, number][] = [...html.matchAll(/<label\b[\s\S]*?<\/label>/gi)].map((m) => [m.index!, m.index! + m[0].length]);
  const out: string[] = [];
  for (const m of html.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const [tag, attrs] = [m[1].toLowerCase(), m[2]];
    const type = attrs.match(/\stype=["']([^"']+)["']/)?.[1]?.toLowerCase();
    if (tag === "input" && type && ["hidden", "submit", "button", "reset", "image"].includes(type)) continue;
    if (/\saria-label=["'][^"']*\S[^"']*["']/.test(attrs) || /\saria-labelledby=["'][^"']+["']/.test(attrs)) continue;
    const id = attrs.match(/\sid=["']([^"']+)["']/)?.[1];
    if (id && labelledIds.has(id)) continue;
    if (wrapped.some(([a, b]) => m.index! > a && m.index! < b)) continue;
    out.push(`<${tag}${id ? ` id="${id}"` : ""}>`);
  }
  return out;
}

/** A <pre> that scrolls (by class or inline style) but is not in the tab order. */
function unfocusableScrollers(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<pre\b([^>]*)>/gi)) {
    const attrs = m[1];
    const cls = attrs.match(/\sclass=["']([^"']*)["']/)?.[1] ?? "";
    const style = attrs.match(/\sstyle=["']([^"']*)["']/)?.[1] ?? "";
    const scrolls =
      /(?:^|\s)overflow-(?:x-|y-)?(?:auto|scroll)(?:\s|$)/.test(cls) || /overflow(?:-x|-y)?\s*:\s*(?:auto|scroll)/.test(style);
    if (scrolls && !/\stabindex=["']?0["']?/.test(attrs)) out.push(`<pre class="${cls.slice(0, 50)}">`);
  }
  return out;
}

// --------------------------------------------------------------------- pages

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (extname(entry) === ".html") out.push(full);
  }
  return out;
}

/** Source paths of the configured redirects. Astro emits a meta-refresh stub for each. */
function configuredRedirects(): string[] {
  const config = readFileSync(resolve(ROOT, "astro.config.mjs"), "utf-8");
  const block = config.match(/\bredirects:\s*\{([\s\S]*?)\n\s*\},/);
  return block ? [...block[1].matchAll(/^\s*["'](\/[^"']+)["']\s*:/gm)].map((m) => m[1]) : [];
}

/** Report shape: how many pages, and the first few with what was found on each. */
function summarize(found: [string, string[]][]): string {
  const bad = found.filter(([, p]) => p.length > 0);
  return `${bad.length} page(s):\n` + bad.slice(0, 12).map(([page, p]) => `  ${page}: ${p.slice(0, 3).join("; ")}`).join("\n");
}

describe("every built page has the structure assistive technology relies on (landing#611)", () => {
  const stubs = new Set(configuredRedirects().map((from) => `${from.replace(/^\//, "")}/index.html`));
  const pages = (existsSync(DIST) ? walkHtml(DIST) : [])
    .map((f) => [relative(DIST, f).split(sep).join("/"), readFileSync(f, "utf-8")] as const)
    .filter(([page]) => !stubs.has(page));

  it("dist/ exists and holds a plausible number of pages", () => {
    expect(pages.length, "run `npm run build` first").toBeGreaterThan(100);
    expect(stubs.size, "no redirects parsed from astro.config.mjs").toBeGreaterThan(0);
  });

  it("each checker flags the pre-fix markup and passes the fixed markup", () => {
    // Real markup from the build of dev at ba968e5, before this change, and after it.
    expect(h1Count('<h2 class="text-3xl">Simple, transparent pricing</h2>')).toBe(0);
    expect(h1Count('<h1 class="text-3xl">Simple, transparent pricing</h1>')).toBe(1);

    const navBefore = '<nav class="fixed top-0"></nav><aside><nav class="sticky top-24"></nav></aside>';
    const navAfter = '<nav aria-label="Main" class="fixed top-0"></nav><aside><nav aria-label="Documentation" class="sticky top-24"></nav></aside>';
    expect(navProblems(navBefore)).toHaveLength(1);
    expect(navProblems(navAfter)).toEqual([]);
    expect(navProblems('<nav aria-label="Main"></nav><nav aria-label="Main"></nav>')).toHaveLength(1);

    const logoBefore = '<a href="/" class="flex"><img src="/logo.png" alt="Datanika" class="h-8 w-8"> <span class="gradient-text">Datanika</span></a>';
    expect(redundantAlts(logoBefore)).toHaveLength(1);
    expect(redundantAlts(logoBefore.replace('alt="Datanika"', 'alt=""'))).toEqual([]);
    expect(redundantAlts('<a href="/x"><img src="/y.png" alt="Architecture diagram"></a>')).toEqual([]);

    const selectBefore = '<select id="docs-mobile-nav" class="w-full"><option value="/docs">Overview</option></select>';
    expect(unnamedControls(selectBefore)).toHaveLength(1);
    expect(unnamedControls(selectBefore.replace('class="w-full"', 'aria-label="Documentation page" class="w-full"'))).toEqual([]);
    const inputBefore = '<label class="block">Monthly volume processed</label><div><input id="gb-input" type="number"></div>';
    expect(unnamedControls(inputBefore)).toHaveLength(1);
    expect(unnamedControls(inputBefore.replace("<label ", '<label for="gb-input" '))).toEqual([]);
    expect(unnamedControls('<label>Volume <input type="number"></label><input type="hidden" name="x">')).toEqual([]);

    const preBefore = '<pre class="p-6 text-sm leading-relaxed overflow-x-auto"><code>{}</code></pre>';
    expect(unfocusableScrollers(preBefore)).toHaveLength(1);
    expect(unfocusableScrollers(preBefore.replace("<pre ", '<pre tabindex="0" '))).toEqual([]);
    // Shiki's own blocks scroll by inline style and already carry tabindex="0".
    expect(unfocusableScrollers('<pre class="astro-code github-dark" style="background-color:#24292e;overflow-x:auto" tabindex="0">')).toEqual([]);
    expect(unfocusableScrollers('<pre class="astro-code github-dark" style="background-color:#24292e;overflow-x:auto">')).toHaveLength(1);
  });

  it("every page has exactly one <h1>", () => {
    const found = pages.map(([page, html]): [string, string[]] => {
      const n = h1Count(html);
      return [page, n === 1 ? [] : [`${n} <h1>`]];
    });
    expect(found.filter(([, p]) => p.length).length, summarize(found)).toBe(0);
  });

  it("every page with more than one <nav> names each one, uniquely", () => {
    const found = pages.map(([page, html]): [string, string[]] => [page, navProblems(html)]);
    expect(found.filter(([, p]) => p.length).length, summarize(found)).toBe(0);
  });

  it("no image in a link or button repeats that element's text as its alt", () => {
    const found = pages.map(([page, html]): [string, string[]] => [page, redundantAlts(html)]);
    expect(found.filter(([, p]) => p.length).length, summarize(found)).toBe(0);
  });

  it("every form control has an accessible name", () => {
    const found = pages.map(([page, html]): [string, string[]] => [page, unnamedControls(html)]);
    expect(found.filter(([, p]) => p.length).length, summarize(found)).toBe(0);
  });

  it("every scrollable <pre> can be reached with the keyboard", () => {
    const found = pages.map(([page, html]): [string, string[]] => [page, unfocusableScrollers(html)]);
    expect(found.filter(([, p]) => p.length).length, summarize(found)).toBe(0);
  });
});
