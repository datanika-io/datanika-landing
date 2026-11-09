/**
 * Does a vulnerable dependency actually reach the artifact a reader receives?
 *
 * Landing carried a standing pile of open Dependabot alerts for six sessions. The
 * count was re-quoted every session and triaged in none of them, because the
 * question it invites — "are N high-severity vulnerabilities live on datanika.io?"
 * — has no cheap answer from the alert list alone.
 *
 * 🔴 **The figures that used to be in this paragraph are gone on purpose
 * (landing#728).** It said "44 open alerts (21 high) across 17 packages", which was
 * true when written and read as current for three growths of the board — 44 → 46 →
 * 54, and 17 → 19 packages. `WORKFLOW_RULES` §3 names that shape: *a performance
 * number in a rulebook is a measurement with no owner and no expiry. Cite the
 * instrument, not the reading.* The instrument here is the board:
 *     gh api repos/datanika-io/datanika-landing/dependabot/alerts \
 *       --jq '[.[]|select(.state=="open")|.dependency.package.name]|unique|length'
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
 * One distinctive in-source identifier per package. Each must be findable inside that
 * package (positive control) and absent from shipped output (the actual assertion).
 *
 * 🚨 **This map was a 15-entry enumeration and the alert board named 19 — landing#728,
 * found by Infra while re-deriving the partition.** Four alerted packages had no marker,
 * so nothing looked for them and the suite went green. `WORKFLOW_RULES` §5b.6 is the rule:
 * *an instrument that cannot see part of its population reports that part as clean* — and
 * it fails in the flattering direction, which is why six sessions did not notice.
 *
 * **Two halves now, because they rot differently:**
 *
 *  - **DIRECT** — every `dependencies` / `devDependencies` entry in `package.json`. This
 *    half is **derived at read time** by `everyDirectDependencyHasAMarker` below, so
 *    adding a dependency without a marker goes red naming it. There is no list to keep.
 *  - **TRANSITIVE** — packages that carry an alert but are nobody's direct dependency.
 *    This half is a genuine enumeration and **is the part that can still go stale**: there
 *    is no token-free way to learn the alert board from inside vitest. Said plainly rather
 *    than papered over; the design question is on landing#728.
 *
 * ⚠️ Markers are code-shaped identifiers, **never package names**. `"devalue"` or
 * `"@astrojs/rss"` as bare strings match a blog post that mentions them, so the finding
 * would be destroyed by writing about it. Every marker below was measured present in its
 * package's **own** files and absent from `dist/`, with fabricated markers as the negative
 * control.
 */
const PACKAGE_MARKERS: Record<string, string> = {
  // --- DIRECT: every package.json dependency / devDependency ---------------------
  astro: "astro:scripts",
  "@astrojs/rss": "pagesGlobToRssItems",
  "@astrojs/sitemap": "sitemapHostname",
  "@tailwindcss/vite": "customCssResolver",
  "astro-og-canvas": "canvasKitSingleton",
  "canvaskit-wasm": "ParagraphBuilder",
  tailwindcss: "__BARE_VALUE__",
  vitest: "startVitest",
  // --- TRANSITIVE: alerted, nobody's direct dependency ---------------------------
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
  // NOT `XMLBuilder`, which `fast-xml-parser` already uses: a marker shared by two
  // packages cannot attribute a hit, and its positive control would pass on the wrong
  // package's code. `attributesGroupName` is this package's own.
  "fast-xml-builder": "attributesGroupName",
  "smol-toml": "TomlError",
  rollup: "ROLLUP_FILE_URL",
  vite: "__vite__",
  esbuild: "ESBUILD_BINARY_PATH",
  "@vitest/mocker": "MockerRegistry",
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

/**
 * Every file under `dir` that belongs to the package ITSELF — nested `node_modules/` is
 * skipped.
 *
 * 🔴 landing#728: without that skip, the positive control can be satisfied by a **bundled
 * dependency's** code rather than the package's own. Measured while picking the new markers:
 * `@astrojs/rss` and `@astrojs/sitemap` both reported Zod's identifiers
 * (`safeParseAsync`, `ZodFirstPartyTypeKind`) because each vendors Zod, so a marker chosen
 * that way would have identified Zod in two packages and attributed a `dist/` hit to
 * whichever row was read first. *Presence is not role.*
 */
function walkOwnFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkOwnFiles(full, out);
    else out.push(full);
  }
  return out;
}

/** Does `marker` appear anywhere inside this package's own directory? */
function markerLivesInPackage(pkg: string, marker: string): boolean {
  const dir = join(NODE_MODULES, ...pkg.split("/"));
  if (!existsSync(dir)) return false;
  for (const f of walkOwnFiles(dir)) {
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

  /**
   * 🔴 landing#728's load-bearing addition: the population is DERIVED, and an unmarkered
   * package goes RED rather than being skipped.
   *
   * The old map was a literal, so a newly-alerted package produced no marker, no hit and a
   * green suite. Deriving the direct-dependency half from `package.json` at read time means
   * the only moment landing can gain a new shipping surface — adding a dependency — is the
   * moment this fails, naming the package. That is the trigger the marker map was missing:
   * the existing `ships no JavaScript` assertion triggers on the CONCLUSION changing, and
   * nothing triggered on the POPULATION growing.
   *
   * ⚠️ This does not cover transitive packages gaining an alert. That half is honestly
   * enumerated above and cannot be derived without reading the board, which needs a token
   * vitest does not have. Stated rather than implied — §5b.6: *an instrument must print the
   * population it could not search.*
   */
  it("every direct dependency has a marker (the population is derived, not listed)", () => {
    const pkgJson = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
    const direct = [
      ...Object.keys(pkgJson.dependencies ?? {}),
      ...Object.keys(pkgJson.devDependencies ?? {}),
    ].sort();

    // Anti-vacuity: an empty or unparsed package.json would make the check below pass by
    // having nothing to check, which is the exact failure this test exists to remove.
    expect(
      direct.length,
      "no direct dependencies were read out of package.json — the derivation is broken, " +
        "and a broken derivation reads exactly like full coverage",
    ).toBeGreaterThan(3);

    const unmarkered = direct.filter((p) => !(p in PACKAGE_MARKERS));
    expect(
      unmarkered,
      `These package.json dependencies have no marker in PACKAGE_MARKERS, so nothing in ` +
        `this suite looks for their code in shipped output: ${unmarkered.join(", ")}. ` +
        `Add a marker — a code-shaped identifier from the package's OWN files, never its ` +
        `name — and let the control above prove it can be found. Do NOT delete this ` +
        `assertion to get green: a package nothing searches for is reported as clean. ` +
        `landing#728.`,
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
