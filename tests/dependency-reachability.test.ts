/**
 * Does a vulnerable dependency actually reach the artifact a reader receives?
 *
 * Landing carried 44 open Dependabot alerts (21 high) across 17 packages for six
 * sessions. The number was re-quoted every session and triaged in none of them,
 * because the question it invites — "are 21 high-severity vulnerabilities live on
 * datanika.io?" — has no cheap answer from the alert list alone.
 *
 * It does have a cheap answer from `dist/`. Every one of those alerts reads
 * `scope: runtime` in the GitHub API, and on this repo that means **nothing about
 * the browser**: the scope field is derived from placement in `package.json`, and
 * `dependencies` here holds only build tooling (astro, vite, tailwind, sitemap,
 * rss, og-canvas). There is no client framework, no adapter, and `output` is
 * static. So the whole toolchain runs on a CI runner and exits, and nginx serves
 * files. `scope: runtime` is the label; "ships to a browser" is the question.
 *
 * ⚠️ Do NOT restate this as a claim in a comment and call it checked. That is the
 * exact defect landing#471 shipped a post about — a guard whose assertion was
 * satisfied by the prose above it. This file asserts against `dist/`.
 *
 * Two properties carry the finding, and each fails loudly the moment it stops
 * being true:
 *
 *   1. No JavaScript file ships at all. The day someone adds a hydrated island,
 *      this goes red — and that is precisely the day the reachability answer
 *      changes and has to be re-derived. Treat a failure here as "re-triage the
 *      alerts", not as "delete the assertion".
 *   2. No dependency's own source markers appear anywhere in shipped output.
 *
 * ⚠️ (2) is worthless without its positive control. A marker that matches nothing
 * anywhere returns 0 hits in `dist/` and reads exactly like proof of safety, so
 * every marker is first asserted to exist inside its own package under
 * `node_modules/`. A check that cannot fail is not evidence (WORKFLOW_RULES §13).
 *
 * Markers are deliberately code-shaped identifiers, not package names. `"devalue"`
 * and `"esbuild"` as bare strings match a blog post that mentions them; the
 * finding would then be destroyed by writing about it.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, join, relative } from "path";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");
const NODE_MODULES = resolve(ROOT, "node_modules");

/**
 * One distinctive in-source identifier per package carrying an open alert.
 * Each must be findable inside that package (positive control) and absent from
 * shipped output (the actual assertion).
 */
const PACKAGE_MARKERS: Record<string, string> = {
  nanoid: "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict",
  devalue: "DevalueError",
  defu: "createDefu",
  h3: "H3Event",
  picomatch: "POSIX_REGEX_SOURCE",
  "js-yaml": "YAMLException",
  svgo: "removeScripts",
  postcss: "CssSyntaxError",
  sharp: "sharp-libvips",
  "fast-xml-parser": "XMLBuilder",
  "smol-toml": "TomlError",
  rollup: "ROLLUP_FILE_URL",
  vite: "__vite__",
  esbuild: "ESBUILD_BINARY_PATH",
  astro: "astro:scripts",
};

/** Text-bearing extensions a browser or feed reader actually receives. */
const SHIPPED_TEXT = new Set([
  ".html",
  ".css",
  ".xml",
  ".txt",
  ".svg",
  ".js",
  ".mjs",
  ".json",
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function shippedTextFiles(): string[] {
  if (!existsSync(DIST)) return [];
  return walk(DIST).filter((f) => SHIPPED_TEXT.has(extname(f).toLowerCase()));
}

/** Does `marker` appear anywhere inside this package's own directory? */
function markerLivesInPackage(pkg: string, marker: string): boolean {
  const dir = join(NODE_MODULES, ...pkg.split("/"));
  if (!existsSync(dir)) return false;
  for (const f of walk(dir)) {
    const ext = extname(f).toLowerCase();
    if (![".js", ".mjs", ".cjs", ".ts", ".json", ".map"].includes(ext)) continue;
    try {
      if (readFileSync(f, "utf8").includes(marker)) return true;
    } catch {
      /* unreadable/binary — keep looking */
    }
  }
  return false;
}

describe("dependency reachability in shipped output (landing#381 triage)", () => {
  // Hard-fail rather than skip. A harness that quietly does nothing when its
  // input is missing is the failure mode this repo keeps re-learning. CI runs
  // `npm run build` before `npm test`.
  it("has a built site to read", () => {
    expect(
      existsSync(DIST),
      "dist/ is absent — run `npm run build` first. This suite reads the built " +
        "artifact on purpose and must not pass without one.",
    ).toBe(true);
  });

  it("ships no JavaScript files at all", () => {
    const js = walk(DIST)
      .filter((f) => [".js", ".mjs"].includes(extname(f).toLowerCase()))
      .map((f) => relative(DIST, f));

    expect(
      js,
      "A JS bundle appeared in dist/. The site was static with no hydration when " +
        "the 44 open Dependabot alerts were triaged as unreachable, and that " +
        "triage rested on this. RE-DERIVE the reachability finding before " +
        "changing this assertion — do not just update the expected list.",
    ).toEqual([]);
  });

  it("every marker is present in its own package (control: the next assertion can fail)", () => {
    const vacuous = Object.entries(PACKAGE_MARKERS)
      .filter(([pkg, marker]) => !markerLivesInPackage(pkg, marker))
      .map(([pkg, marker]) => `${pkg} -> "${marker}"`);

    expect(
      vacuous,
      "These markers match nothing inside their own package, so searching dist/ " +
        "for them proves nothing. Fix the marker (the package may have renamed " +
        "or minified the identifier); never delete the row to get green.",
    ).toEqual([]);
  });

  it("no dependency source code reaches shipped output", () => {
    const files = shippedTextFiles();
    expect(files.length).toBeGreaterThan(50);

    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const [pkg, marker] of Object.entries(PACKAGE_MARKERS)) {
        if (text.includes(marker)) hits.push(`${relative(DIST, f)} contains ${pkg} marker`);
      }
    }

    expect(
      hits,
      "Dependency code is now present in shipped output, so open Dependabot " +
        "alerts against those packages may be genuinely reachable by a visitor. " +
        "Re-triage before touching this assertion.",
    ).toEqual([]);
  });

  // The one alert family whose defect is expressible in output we actually
  // publish: @astrojs/rss GHSA-8j5q-mfj2-5q9q (XML injection via unescaped feed
  // fields) and the fast-xml-builder attribute-quote bypass. Library code never
  // ships, so the assertions above are blind to this by construction — the
  // artifact is the generated XML, not the generator.
  it("shipped XML escapes its text content", () => {
    const feed = join(DIST, "rss.xml");
    expect(existsSync(feed), "dist/rss.xml is missing").toBe(true);
    const xml = readFileSync(feed, "utf8");

    // No raw markup inside element text. Anything unescaped would have broken
    // out of its element, which is the advisory's whole shape.
    const leaked: string[] = [];
    for (const tag of ["title", "description", "category", "link", "guid"]) {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
      for (const m of xml.matchAll(re)) {
        const inner = m[1];
        if (inner.includes("<") || inner.includes(">")) {
          leaked.push(`<${tag}> contains raw markup: ${inner.slice(0, 80)}`);
        }
        // A bare `&` that is not the start of an entity is malformed XML.
        if (/&(?!#\d+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/.test(inner)) {
          leaked.push(`<${tag}> contains an unescaped '&': ${inner.slice(0, 80)}`);
        }
      }
    }
    expect(leaked, "RSS field escaping failed — feed consumers receive injected markup").toEqual([]);
  });
});
