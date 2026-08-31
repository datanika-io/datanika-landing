import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, sep } from "path";

/**
 * Guardrail: an INVENTORY of every built route that quotes the V2 bytes-pricing
 * terms — the terms production does not enforce (landing#396, core#713).
 *
 * ## The defect this exists for
 *
 * `/pricing/` sells a bytes model that production has never billed against: the
 * byte-allotment columns on `plans` were never seeded, so prod enforces the V1
 * runs caps. #396 carries the commercial decision about that. This file carries
 * something narrower and decision-independent: **where the claims are.**
 *
 * #396 named four surfaces — `Pricing.astro` (homepage + `/pricing/`),
 * `src/data/pricing-tiers.ts`, `/features/volume-pricing/`, and the FAQ JSON-LD.
 * Grepping for the *numbers* rather than the topic finds **eighteen** built
 * routes rendering them. The four named surfaces account for three of the
 * eighteen. See landing#403 for the full write-up.
 *
 * That gap is this project's most repeated defect shape, not a one-off:
 * Hetzner in six statements across two pages when the issue named the host;
 * SOC 2 in four files when the decision named two; email-verification on three
 * pages including one the issue never mentioned; Fivetran dollar figures on
 * three surfaces when #325 fixed one. `docs/GROWTH_RULES.md`, verbatim:
 * *"An issue naming one instance of a false claim is a sample, not an
 * inventory. Grep for the number, not for the topic."*
 *
 * ## 🚨 What this test does NOT do, stated so nobody mistakes green for safe
 *
 * It does **not** check whether any number here is true. It cannot: it has no
 * access to the `plans` table, and CI has no credentials. Every route below is
 * currently asserting terms production does not enforce, and this test is
 * **green on all of them by design**.
 *
 * It is also deliberately **not** a self-consistency check. A `pricing-facts`
 * guard shaped like `legal-pages-facts.test.ts` — one asserting the surfaces
 * agree with each other — would go green on the entire #396 defect, because
 * after #390 the page and its JSON-LD agree perfectly and all five uninventoried
 * evergreen surfaces quote the identical sentence. **Self-consistency is not the
 * property in doubt. Completeness of the inventory is.**
 *
 * What it does do, and it is the thing that failed last time:
 *   1. a route that starts quoting byte pricing cannot appear unnoticed;
 *   2. a **partial** #396 sweep fails, naming exactly the routes still quoting
 *      the old terms — so "I fixed /pricing/" cannot read as "I fixed it".
 *
 * ## Why this reads `dist/`, not `src/`
 *
 * Same reason `pricing-claims.test.ts` does: the claim is what a *reader* is
 * told, and the mapping from source to rendered route is not one-to-one.
 * `Pricing.astro` renders on two routes; `pricing-tiers.ts` renders through a
 * component; a `//` frontmatter comment renders nowhere. A source scan gets the
 * count wrong in both directions. `dist/` is the artifact under discussion.
 *
 * A source-level grep is also measurably noisier: it flags eleven blog posts on
 * `per GB` / `GB/mo` where only ten render a pinned term, and `docs/connectors/
 * sqlite` on the phrase "hard cap". Those are not byte-pricing claims.
 *
 * ## When #396 is executed
 *
 * This test WILL go red, and that is the point — it is the checklist. Delete
 * each route from the inventory below as its copy is corrected. When the last
 * one goes, the inventory is empty and the guard becomes a ratchet that keeps
 * the claims from coming back.
 */

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/**
 * The V2 byte-allotment numbers, as they appear to a reader.
 *
 * Chosen to be unambiguous about *whose* price they are. The overage rates and
 * the effective per-GB prices are ours and no competitor on any `/compare/`
 * page is quoted at them, so a match cannot be a competitor's figure. Bare
 * `100 GB` / `1 TB` are deliberately absent — they appear as row labels in the
 * comparison tables ("100 GB / mo" is a volume column heading), which would
 * make the signal describe the table's axis rather than a claim about us.
 */
const BYTE_TERMS = [
  "$0.50/GB",
  "$0.50 / GB",
  "$0.25/GB",
  "$0.25 / GB",
  "$0.79 / GB",
  "$0.39 / GB",
  "10 GB/mo",
  "10 GB / mo",
  "includes 100 GB",
  "100 GB included",
  "includes 1 TB",
  "1 TB included",
] as const;

/**
 * The three routes #396 already names. Kept as a named set rather than folded
 * into one list, because the whole finding is the size of the difference
 * between this and the two below.
 */
const INVENTORIED_BY_396 = ["/", "/pricing", "/features/volume-pricing"];

/**
 * Evergreen commercial pages asserting the terms in the present tense, which
 * #396 does not name. These are the ones that matter most: a reader arriving
 * from search is quoted current terms.
 *
 * `/why-cheaper` is the sharpest of them and is a different kind of exposure —
 * it is an interactive calculator that computes a personalised dollar figure
 * from the unenforced rates, rather than merely stating them.
 *
 * ⚠️ That calculator carried a second, independent defect that this inventory
 * cannot see: it quoted the **Free** tier at **$79**, because `freeIncludedGB`
 * was declared and read by nothing, so `datanikaBill()` could only return Pro
 * or Enterprise. Fixed in landing#410. The lesson for *this* file: an inventory
 * of **where** a claim appears says nothing about whether the claim is right.
 */
const EVERGREEN_UNINVENTORIED = [
  "/compare/airbyte",
  "/compare/fivetran",
  "/compare/hevo",
  "/compare/stitch",
  "/why-cheaper",
];

/**
 * Dated blog posts. A weaker claim than an evergreen commercial page — a post
 * describing the terms current at the time of writing is not the same as a
 * pricing page asserting them now — but they are inventoried rather than
 * ignored, because "we did not know it was there" is the failure being fixed.
 * Whether to sweep them is an editorial judgement, separate from #396.
 */
const DATED_POSTS = [
  "/blog/claude-built-a-data-pipeline",
  "/blog/datanika-mcp-server-launch",
  "/blog/datanika-vs-modern-data-stack",
  "/blog/dlt-arrow-5x-faster-pipeline",
  "/blog/mcp-write-tools-consent-scope",
  "/blog/pricing-v2-math-and-why",
  "/blog/self-hosting-datanika-docker-compose",
  "/blog/sso-saml-oidc-enterprise",
  "/blog/stripe-revenue-dashboard-dbt",
  "/blog/why-we-built-datanika",
];

const INVENTORY = [
  ...INVENTORIED_BY_396,
  ...EVERGREEN_UNINVENTORIED,
  ...DATED_POSTS,
].sort();

/** Every built page as `{ route, text }`, tags and scripts stripped. */
function builtRoutes(): { route: string; text: string }[] {
  const out: { route: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = resolve(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry === "index.html") {
        const rel = p.slice(DIST.length + 1).split(sep).join("/");
        const route = "/" + rel.replace(/index\.html$/, "").replace(/\/$/, "");
        const text = readFileSync(p, "utf-8")
          .replace(/<script[\s\S]*?<\/script>/g, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/&#36;/g, "$")
          .replace(/&nbsp;/g, " ");
        out.push({ route, text });
      }
    }
  };
  walk(DIST);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

describe("V2 byte-pricing surface inventory (landing#403 / #396)", () => {
  // Hard-fail rather than skip. A harness that quietly does nothing when its
  // input is missing is the exact failure mode this repo keeps re-learning
  // (landing#354, landing#339). CI builds before it tests.
  it("has a built site to read", () => {
    expect(
      existsSync(DIST),
      "dist/ is absent — run `npm run build` first. This test reads the built " +
        "artifact on purpose; it must not silently pass without one.",
    ).toBe(true);
  });

  it("renders byte terms on exactly the inventoried routes, and no others", () => {
    const found = builtRoutes()
      .filter(({ text }) => BYTE_TERMS.some((t) => text.includes(t)))
      .map(({ route }) => route)
      .sort();

    const added = found.filter((r) => !INVENTORY.includes(r));
    const removed = INVENTORY.filter((r) => !found.includes(r));

    const label = (r: string) =>
      INVENTORIED_BY_396.includes(r)
        ? "named by #396"
        : EVERGREEN_UNINVENTORIED.includes(r)
          ? "evergreen, NOT named by #396"
          : "dated post";

    expect(
      added,
      "A route started quoting V2 byte-pricing terms that production does not " +
        "enforce. Either correct the copy, or add the route to the inventory " +
        "in this file with a reason:\n" +
        added.map((r) => `  + ${r}`).join("\n"),
    ).toEqual([]);

    expect(
      removed,
      "An inventoried route no longer quotes byte terms. If you are executing " +
        "#396, this is expected — delete these from the inventory as you go. " +
        "The routes STILL quoting them are listed below; a partial sweep is " +
        "not a finished one:\n" +
        removed.map((r) => `  - ${r} (${label(r)})`).join("\n") +
        "\n  --- still quoting: ---\n" +
        found.map((r) => `  * ${r} (${label(r)})`).join("\n"),
    ).toEqual([]);
  });

  it("keeps the count of uninventoried evergreen surfaces visible", () => {
    // The headline number in #403. Pinned separately so that quietly folding a
    // compare page into the "dated posts" bucket cannot shrink the finding
    // without someone editing this line and noticing what they are doing.
    expect(EVERGREEN_UNINVENTORIED.length).toBe(5);
    expect(INVENTORY.length).toBe(18);
  });

  it("still explains that green does not mean the numbers are true", () => {
    // The docstring is load-bearing: this file is the most likely place for a
    // future reader to conclude the pricing claims are verified. They are not.
    const self = readFileSync(resolve(__dirname, "byte-pricing-surface-inventory.test.ts"), "utf-8");
    expect(self).toContain("does **not** check whether any number here is true");
    expect(self).toContain("Completeness of the inventory is");
  });
});
