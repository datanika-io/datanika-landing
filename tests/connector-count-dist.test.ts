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
import { inlineText, RENDERINGS, BLOCK_SEPARATED } from "./helpers/rendered-text";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/** Same shape as the source suite's COUNT_RE, applied to rendered HTML. */
const RENDERED_RE = /(?<![\w.$+,])(\d{1,4}) connectors?\b/gi;

/**
 * 🚨 The scan runs over `inlineText(html)`, not over the raw bytes — landing#505.
 *
 * `RENDERED_RE` needs a literal space between the digits and the word, so
 * `<strong>47</strong> connectors` matched **nothing**. Measured by mutating a
 * real post and rebuilding: `We now ship **47** connectors in total.` left this
 * file at `4 passed`, while the identical claim in plain prose
 * (`We now ship 48 connectors in total.`) failed it. One pair of asterisks.
 *
 * 🔑 And there was no defence in depth. This file exists *because*
 * `connector-count-prose.test.ts` cannot see rendered output — but it uses the
 * same regex, and `**47** connectors` breaks digit-space adjacency in markdown
 * source too. The same mutation walked past both guards.
 *
 * The raw pass is kept as well: it costs nothing, and a phrase that is contiguous
 * in the raw bytes is contiguous after `inlineText` too, so the two agree except
 * where the markup is the whole point.
 */

/**
 * Every catalogue-count claim on a page, read both ways.
 *
 * Module-level on purpose: the sweep below and the arming controls at the bottom
 * must exercise **this function**, not two regexes that happen to be identical.
 * A control written beside the assertion rather than through it proves the
 * pattern works and says nothing about whether the assertion still calls it —
 * which is how a fix gets reverted under a green control.
 */
export function countClaimsOn(html: string): string[] {
  const out = new Set<string>();
  for (const hay of [html, inlineText(html)]) {
    for (const m of hay.matchAll(RENDERED_RE)) out.add(m[0]);
  }
  return [...out];
}

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
      for (const claim of countClaimsOn(readFileSync(full, "utf-8"))) {
        const n = Number(claim.match(/\d+/)![0]);
        if (n === expected) continue;
        if (n < MIN_CATALOGUE_CLAIM) continue;
        if (DIST_ALLOWED.some((a) => a.file === rel && a.text === claim)) continue;
        violations.push(`dist/${rel} renders "${claim}" but the marketed count is ${expected}`);
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

  // -------------------------------------------------------------------------
  // landing#505 — the assertion above is only worth its runtime if it survives
  // the RENDERER. These two arm it in-suite, against shapes copied out of a real
  // build, so the discrimination is re-proved on every run rather than asserted
  // from a session that measured it once.
  // -------------------------------------------------------------------------

  it("countClaimsOn() sees a wrong count in every rendering it could arrive in", () => {
    // Runs through `countClaimsOn`, which is what the sweep above calls. A
    // control that re-applied RENDERED_RE beside the sweep would keep passing
    // if someone dropped the inlineText pass from the sweep itself.
    //
    // The exact payload that walked past this file AND past
    // connector-count-prose.test.ts before landing#505: `**47** connectors`.
    const missed = RENDERINGS.filter(
      (r) => !countClaimsOn(r.wrap("We now ship 47 connectors in total.")).includes("47 connectors"),
    ).map((r) => r.how);
    expect(
      missed,
      "A wrong connector count rendered this way is invisible to the sweep above. Measured, " +
        "not hypothetical: `**47** connectors` passed this file and the source suite both, " +
        `because each requires the digits and the word to be adjacent.\nMissed: ${missed.join(", ")}`,
    ).toEqual([]);
  });

  it("countClaimsOn() does NOT invent a count across a block boundary (false-positive control)", () => {
    // The other half, and the reason `inlineText` strips inline tags only. A
    // blanket tag strip turns `<td>47</td><td>connectors</td>` into a violation
    // that does not exist, and a guard that invents failures gets loosened until
    // it stops working.
    const fired = BLOCK_SEPARATED.map((wrap) => wrap("47 connectors sold"))
      .filter((h) => countClaimsOn(h).length > 0)
      .map((h) => h.slice(0, 70));
    expect(
      fired,
      `These are two separate cells, not a claim. inlineText must not glue them:\n${fired.join("\n")}`,
    ).toEqual([]);
  });
});
