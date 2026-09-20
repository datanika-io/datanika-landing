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
 * landing#620 added two more, both measured over the whole build of `dev` at 1920a42:
 *
 *   no <main>                        101 pages: every blog post, connector reference,
 *                                               use case, compare page and template, their
 *                                               index pages, /ai-agents, /why-cheaper and
 *                                               /features/volume-pricing
 *   <pre> outside the tab order       67 blocks on 20 docs and API pages, which scroll
 *                                               because a container rule gives them
 *                                               overflow-x-auto, so a check of the <pre>'s
 *                                               own class could not see them
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

/**
 * A <pre> that is not in the tab order.
 *
 * This used to flag only a <pre> that scrolls by its own class or inline style. landing#620 found
 * 67 that scroll because their container gives them overflow (`[&_pre]:overflow-x-auto`), which
 * that check could not see. Whether a block scrolls depends on the viewport, since code that fits
 * at 1280px scrolls on a phone. So every <pre> is in the tab order, as Shiki already does for its own.
 */
function unfocusablePres(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<pre\b([^>]*)>/gi)) {
    const attrs = m[1];
    const cls = attrs.match(/\sclass=["']([^"']*)["']/)?.[1] ?? "";
    if (!/\stabindex=["']?0["']?/.test(attrs)) out.push(`<pre class="${cls.slice(0, 50)}">`);
  }
  return out;
}

/** Exactly one <main>, with the site navbar and the footer outside it. Returns the problems. */
function mainProblems(html: string): string[] {
  const opens = [...html.matchAll(/<main[\s>]/gi)].map((m) => m.index!);
  if (opens.length !== 1) return [`${opens.length} <main>`];
  const start = opens[0];
  const end = html.indexOf("</main>", start);
  if (end === -1) return ["<main> is never closed"];
  const problems: string[] = [];
  const nav = html.search(/<nav\b[^>]*\saria-label=["']Main["']/i);
  if (nav > start && nav < end) problems.push("the site navbar is inside <main>");
  const footer = html.search(/<footer[\s>]/i);
  if (footer > start && footer < end) problems.push("the footer is inside <main>");
  return problems;
}

/**
 * landing#641: a table header cell with no text.
 *
 * axe reports `empty-table-header` as minor, and it is a best-practice rule rather than a
 * WCAG 2.1 AA failure — but on a comparison table the first column IS the row header, so a
 * screen reader announcing it as nothing loses the one label that says what is being
 * compared. The fix is one word per table.
 *
 * Counted over `dist/` rather than over the pages a sweep happened to sample, which is
 * landing#620's own lesson: its 26-page sample put links marked by colour alone on 15
 * pages, and the whole build had 994 of them on 150.
 *
 * A `<th>` whose label is supplied by `aria-label` is fine — the cell has an accessible
 * name even though it renders no text.
 */
function emptyHeaders(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi)) {
    if (/\saria-label=["'][^"']+["']/.test(m[1])) continue;
    const text = m[2]
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text === "") out.push(`<th${m[1]}></th>`.slice(0, 60));
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
    expect(unfocusablePres(preBefore)).toHaveLength(1);
    expect(unfocusablePres(preBefore.replace("<pre ", '<pre tabindex="0" '))).toEqual([]);
    // Shiki's own blocks scroll by inline style and already carry tabindex="0".
    expect(unfocusablePres('<pre class="astro-code github-dark" style="background-color:#24292e;overflow-x:auto" tabindex="0">')).toEqual([]);
    expect(unfocusablePres('<pre class="astro-code github-dark" style="background-color:#24292e;overflow-x:auto">')).toHaveLength(1);
    // landing#620: a hand-written docs block with no class of its own, which the old check passed.
    expect(unfocusablePres('<pre><code>GET /api/v1/connections</code></pre>')).toHaveLength(1);
    expect(unfocusablePres('<pre tabindex="0"><code>GET /api/v1/connections</code></pre>')).toEqual([]);

    // landing#620: the shapes of a page before and after, from the build of dev at 1920a42.
    const mainBefore = '<nav aria-label="Main" class="fixed"></nav> <section class="pt-32"></section> <footer class="border-t"></footer>';
    const mainAfter = '<nav aria-label="Main" class="fixed"></nav> <main> <section class="pt-32"></section> </main> <footer class="border-t"></footer>';
    expect(mainProblems(mainBefore)).toEqual(["0 <main>"]);
    expect(mainProblems(mainAfter)).toEqual([]);
    expect(mainProblems('<main><nav aria-label="Main"></nav></main><footer></footer>')).toEqual(["the site navbar is inside <main>"]);
    expect(mainProblems('<nav aria-label="Main"></nav><main><footer></footer></main>')).toEqual(["the footer is inside <main>"]);
    expect(mainProblems("<main></main><main></main>")).toEqual(["2 <main>"]);

    // landing#641: the real markup from /docs/mcp-server before this change, and after it.
    expect(emptyHeaders("<tr><th></th><th>Hosted — one click</th><th>Local — stdio</th></tr>")).toHaveLength(1);
    expect(emptyHeaders("<tr><th>Aspect</th><th>Hosted — one click</th><th>Local — stdio</th></tr>")).toEqual([]);
    // What markdown renders for a `| | Old | New |` header row, and for the fixed one.
    expect(emptyHeaders('<tr><th scope="col">  </th><th scope="col">Old</th></tr>')).toHaveLength(1);
    expect(emptyHeaders('<tr><th scope="col">Plan</th><th scope="col">Old</th></tr>')).toEqual([]);
    // A label inside markup still counts; a whitespace entity does not.
    expect(emptyHeaders("<tr><th><strong>Plan</strong></th></tr>")).toEqual([]);
    expect(emptyHeaders("<tr><th>&nbsp;</th></tr>")).toHaveLength(1);
    // An aria-label gives the cell a name without rendering text.
    expect(emptyHeaders('<tr><th aria-label="Plan"></th></tr>')).toEqual([]);
  });

  it("every page has exactly one <main>, with the navbar and footer outside it", () => {
    const found = pages.map(([page, html]): [string, string[]] => [page, mainProblems(html)]);
    expect(found.filter(([, p]) => p.length).length, summarize(found)).toBe(0);
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

  it("every <pre> can be reached with the keyboard", () => {
    const found = pages.map(([page, html]): [string, string[]] => [page, unfocusablePres(html)]);
    expect(found.filter(([, p]) => p.length).length, summarize(found)).toBe(0);
  });

  it("every table header cell has a label", () => {
    const found = pages.map(([page, html]): [string, string[]] => [page, emptyHeaders(html)]);
    expect(found.filter(([, p]) => p.length).length, summarize(found)).toBe(0);
  });

  /**
   * Anti-vacuity for the assertion above. Every other checker here fires on dozens of pages,
   * so a broken walk shows up immediately. This one is expected to find nothing, which is
   * exactly the shape that passes when the regex is dead — so pin that `<th>` elements are
   * read at all.
   */
  it("reads a real population of table headers (anti-vacuity)", () => {
    const ths = pages.reduce((n, [, html]) => n + (html.match(/<th\b/gi) ?? []).length, 0);
    expect(ths, "too few <th> elements read for the empty-header check to mean anything").toBeGreaterThan(100);
  });
});
