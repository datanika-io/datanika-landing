/**
 * Guardrail: every internal href in the built site must resolve to a real page.
 *
 * Why this exists. `internal-links.test.ts` asserts that page *families* link to
 * each other -- "every connector page links to at least one use-case". It never
 * asks whether the link it just counted goes anywhere. So a link to
 * `/use-cases/postgresql-to-clickhouse` satisfies it perfectly while 404ing.
 *
 * Two live defects were found the day this was written, both by an ad-hoc scan
 * rather than by a test:
 *
 *   1. `/blog/datanika-vs-modern-data-stack/` linked its "Benchmark log" --
 *      the evidence its "measured, not estimated" claim rested on -- at
 *      `/scripts/benchmark/results/...`. `scripts/` is not under `public/`, so
 *      it was never served. Live and 404ing for four months (landing#325).
 *   2. Four connector guides linked seven `/use-cases/*` pages that were never
 *      built (landing#331).
 *
 * The build was green the whole time, because Astro does not verify that a
 * string in an href corresponds to a route.
 *
 * Scope: internal hrefs only. External URLs are deliberately excluded -- a test
 * that makes network calls is a test that fails when someone else's site is
 * down, and a required check that can fail for reasons unrelated to the PR is
 * how merges get blocked on nothing.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { resolve, join, relative } from "path";

const DIST = resolve(__dirname, "../dist");

/**
 * Paths that are served by something other than a file in `dist/`, and so
 * cannot be checked here. Keep this list short and give every entry a reason --
 * an exemption is a hole in the guard.
 */
const ALLOWED_UNRESOLVED: { prefix: string; reason: string }[] = [];

function htmlFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) htmlFiles(full, out);
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

/** Mirror Astro's static output: /foo/ -> dist/foo/index.html, or dist/foo.html, or a real asset. */
function resolves(href: string): boolean {
  const clean = href.split("#")[0].split("?")[0];
  if (!clean || clean === "/") return existsSync(join(DIST, "index.html"));
  const rel = clean.replace(/^\//, "").replace(/\/$/, "");
  return (
    existsSync(join(DIST, rel, "index.html")) ||
    existsSync(join(DIST, `${rel}.html`)) ||
    existsSync(join(DIST, rel))
  );
}

describe("every internal link in the built site resolves", () => {
  const files = existsSync(DIST) ? htmlFiles(DIST) : [];

  it("found a built site to scan (guards against a silently empty pass)", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no broken internal hrefs", () => {
    const broken = new Map<string, Set<string>>();

    for (const file of files) {
      const html = readFileSync(file, "utf-8");
      for (const match of html.matchAll(/href="(\/[^"]*)"/g)) {
        const href = match[1];
        if (href.startsWith("//")) continue; // protocol-relative -> external
        if (href.startsWith("/#")) continue; // same-page anchor
        if (ALLOWED_UNRESOLVED.some((a) => href.startsWith(a.prefix))) continue;
        if (resolves(href)) continue;
        const key = href;
        if (!broken.has(key)) broken.set(key, new Set());
        broken.get(key)!.add(relative(DIST, file).split("\\").join("/"));
      }
    }

    const report = [...broken]
      .map(([href, srcs]) => `  ${href}  <-  ${[...srcs].slice(0, 4).join(", ")}`)
      .join("\n");

    expect(
      [...broken.keys()],
      "Internal links that go nowhere. Either fix the href, build the page, or " +
        "-- only if it is genuinely served by something outside dist/ -- add it " +
        "to ALLOWED_UNRESOLVED with a reason.\n" +
        report
    ).toEqual([]);
  });
});
