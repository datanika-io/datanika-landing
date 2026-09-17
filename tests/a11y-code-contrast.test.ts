/**
 * landing#620: every token colour Shiki emits is readable against its block's background.
 *
 * axe measured Shiki's comment colour at 3.04:1: `#6A737D` on `#24292e` in the default `github-dark`
 * theme. It appears in every highlighted block that has a comment, 100 spans on the build of `dev` at
 * 1920a42. WCAG AA asks 4.5:1 for text this size. The fix is a transformer in `astro.config.mjs`.
 *
 * Invariant, not instance (WORKFLOW_RULES §5a): this does not ban one hex value. It computes the
 * contrast of every inline `color:` inside every `astro-code` block against that block's own background,
 * so a theme change or a new token colour that is too dim fails here as well.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative, sep } from "path";

const DIST = resolve(__dirname, "..", "dist");
const AA = 4.5;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Each highlighted block's background and the token colours inside it. */
function codeBlocks(html: string): { bg: string; colours: string[] }[] {
  const out: { bg: string; colours: string[] }[] = [];
  for (const m of html.matchAll(
    /<pre class="astro-code[^"]*" style="background-color:(#[0-9a-fA-F]{6})[^"]*"[^>]*>([\s\S]*?)<\/pre>/g,
  )) {
    out.push({ bg: m[1], colours: [...m[2].matchAll(/<span style="color:(#[0-9a-fA-F]{6})"/g)].map((c) => c[1]) });
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

describe("highlighted code is readable (landing#620)", () => {
  const pages = existsSync(DIST)
    ? walkHtml(DIST).map((f) => ({ page: relative(DIST, f).split(sep).join("/"), blocks: codeBlocks(readFileSync(f, "utf-8")) }))
    : [];
  const blocks = pages.flatMap((p) => p.blocks);

  it("reads real highlighted blocks (anti-vacuity)", () => {
    expect(existsSync(DIST), "run `npm run build` first").toBe(true);
    expect(blocks.length, "the block pattern found too few Shiki blocks to mean anything").toBeGreaterThan(100);
    expect(new Set(blocks.flatMap((b) => b.colours)).size, "too few token colours read").toBeGreaterThanOrEqual(5);
  });

  it("the arithmetic reproduces the measured ratios", () => {
    // axe reported 3.04:1 for the comment colour; the replacement measures 5.34:1.
    expect(contrast("#6A737D", "#24292e")).toBeCloseTo(3.05, 1);
    expect(contrast("#959DA5", "#24292e")).toBeCloseTo(5.34, 1);
    expect(contrast("#6A737D", "#24292e")).toBeLessThan(AA);
    expect(contrast("#959DA5", "#24292e")).toBeGreaterThanOrEqual(AA);
  });

  it("the block reader sees a comment span in real Shiki markup", () => {
    // Shape copied from a build of dev at 1920a42 (a markdown fence with a comment).
    const sample =
      '<pre class="astro-code github-dark" style="background-color:#24292e;color:#e1e4e8; overflow-x: auto;" tabindex="0" data-language="sql"><code><span class="line"><span style="color:#6A737D">-- stg_orders</span></span></code></pre>';
    expect(codeBlocks(sample)).toEqual([{ bg: "#24292e", colours: ["#6A737D"] }]);
  });

  it("every token colour in every block meets 4.5:1 against its background", () => {
    const failing = new Map<string, Set<string>>();
    for (const p of pages)
      for (const b of p.blocks)
        for (const c of new Set(b.colours))
          if (contrast(c, b.bg) < AA) {
            const key = `${c} on ${b.bg} (${contrast(c, b.bg).toFixed(2)}:1)`;
            if (!failing.has(key)) failing.set(key, new Set());
            failing.get(key)!.add(p.page);
          }
    const report = [...failing].map(([k, v]) => `${k}: ${v.size} page(s), e.g. ${[...v].slice(0, 3).join(", ")}`);
    expect(report, report.join("\n")).toEqual([]);
  });
});
