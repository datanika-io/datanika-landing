/**
 * The connector-count defect one layer OUT — the one that actually shipped (#443).
 *
 * `connector-count-prose.test.ts` scans **source** and matches the literal string
 * `<N> connectors`. A call site written as `${connectors.length} connectors`
 * contains no digit, so it is invisible to that suite **by construction**, not by
 * oversight. Derived call sites were treated as safe because "derived" was read
 * as "bound to the right fact".
 *
 * Those are not the same thing. On 2026-09-02 the marketed count moved to
 * `availableConnectors` — core withdrew `s3` (core#863) and its README derived
 * its way to 35 on its own guard — while **sixteen** call sites kept reading
 * `connectors.length`. Nine built pages published 36, including the homepage,
 * `/pricing`, and the `FAQPage` JSON-LD, with every source suite green. It was
 * caught by grepping `dist/`, in the same session as the fix, after the PR body
 * had already asserted the FAQ "followed on its own".
 *
 * That is #391 exactly: the derived half bound to landing's own catalogue rather
 * than to what production offers. It is strictly harder to notice than a
 * hardcoded number — a reader checking "is this derived?" finds yes — and in the
 * JSON-LD case it is eligible for a rich result.
 *
 * So this file asserts on the artifact the reader receives. `dist/` cannot tell
 * you *which* source file is wrong — the source suite does that, and both are
 * worth having — but it is blind to nothing.
 *
 * ⚠️ Do not "simplify" this to scanning source. Source and output disagreed, and
 * only one of them is what we published.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative } from "path";
import { availableConnectors } from "../src/data/connectors";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/** Same shape as the source suite's COUNT_RE, applied to rendered HTML. */
const RENDERED_RE = /(?<![\w.$+,])(\d{1,4}) connectors?\b/gi;

/**
 * Below this, "<N> connectors" is a subset count or a stray hit, not a claim
 * about the catalogue. Kept identical to the source suite's threshold.
 */
const MIN_CATALOGUE_CLAIM = 20;

/**
 * Dated narrative that survives into the build. The unit here is a built route,
 * not a source file, which is why this list is separate from the source suite's
 * ALLOWED rather than shared with it.
 */
const DIST_ALLOWED: { file: string; text: string; reason: string }[] = [
  {
    file: "blog/dbt-per-tenant/index.html",
    text: "32 connectors",
    reason:
      "Cites the post titled '32 Connectors, Most Took a Day' by name. Exempted in the source " +
      "suite for the same reason: renaming it would misname a real page.",
  },
  {
    file: "blog/32-connectors-most-took-a-day/index.html",
    text: "32 Connectors",
    reason:
      "The post's own title, rendered in the <h1>, <title>, the OG/Twitter meta and the " +
      "BlogPosting JSON-LD — six occurrences of one string. A dated claim about how many " +
      "connectors existed when it was written; the slug is a live URL and renaming it would " +
      "301 away an indexed page. Exact-string match, so a different wrong count in the same " +
      "file is still caught.",
  },
  {
    file: "blog/index.html",
    text: "32 Connectors",
    reason:
      "The same post's title on the blog listing. Exempts that one string only — another " +
      "post's title carrying a wrong count would still fail here.",
  },
];

function walkHtml(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walkHtml(full, out);
    else if (extname(entry) === ".html") out.push(full);
  }
  return out;
}

describe("no BUILT page publishes a connector count other than the marketed one (#443)", () => {
  const pages = existsSync(DIST) ? walkHtml(DIST) : [];

  it("dist/ exists and holds a plausible number of pages (guards a broken walk)", () => {
    // A walk that finds nothing reports zero violations, which reads exactly
    // like a clean sweep — the link-auditor-handed-a-file shape. Landing builds
    // ~161 routes.
    expect(pages.length, "run `npm run build` first").toBeGreaterThan(100);
  });

  it("the marketed count is actually rendered somewhere (guards a regex that matches nothing)", () => {
    // The second half of the same worry: a regex that matches nothing also
    // reports zero violations. This fails if the copy stops publishing the count
    // or if the pattern drifts away from the rendered text.
    const expected = availableConnectors.length;
    const re = new RegExp(`(?<![\\w.$+,])${expected} connectors?\\b`, "i");
    const hits = pages.filter((f) => re.test(readFileSync(f, "utf-8")));
    expect(
      hits.length,
      `No built page renders "${expected} connectors". Either the count stopped being ` +
        "published, or this pattern no longer matches the copy — either way the assertion " +
        "below has become vacuous.",
    ).toBeGreaterThan(5);
  });

  it("every rendered connector count equals availableConnectors.length", () => {
    const expected = availableConnectors.length;
    const violations: string[] = [];

    for (const full of pages) {
      const rel = relative(DIST, full).split("\\").join("/");
      const html = readFileSync(full, "utf-8");
      for (const m of html.matchAll(RENDERED_RE)) {
        const n = Number(m[1]);
        if (n === expected) continue;
        if (n < MIN_CATALOGUE_CLAIM) continue;
        if (DIST_ALLOWED.some((a) => a.file === rel && a.text === m[0])) continue;
        violations.push(`dist/${rel} renders "${m[0]}" but the marketed count is ${expected}`);
      }
    }

    expect(
      violations,
      "A built page publishes a connector count we do not sell. Look for a call site still " +
        "reading `connectors.length` instead of `availableConnectors.length` — a derived " +
        "number bound to the wrong set is invisible to the source suite.\n" +
        violations.join("\n"),
    ).toEqual([]);
  });

  it("every DIST_ALLOWED entry still matches something (no stale exemptions)", () => {
    const stale = DIST_ALLOWED.filter((a) => {
      const f = resolve(DIST, a.file);
      if (!existsSync(f)) return true;
      return !readFileSync(f, "utf-8").includes(a.text);
    });
    expect(stale, `Stale DIST_ALLOWED: ${JSON.stringify(stale)}`).toEqual([]);
  });
});
