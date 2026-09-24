/**
 * Guardrail: a connector core has WITHDRAWN from the picker must not be
 * marketed as available — and must not be deleted either.
 *
 * ## The defect this exists for
 *
 * Core withdrew `s3` (core#863: `s3fs` left `uv.lock`, so
 * `fsspec.get_filesystem_class("s3")` raises `ImportError`). Core's own README
 * moved to **35** on its own guard, because that number is
 * `len(ConnectionType) - len(UNMARKETED_TYPES | WITHDRAWN_SOURCE_TYPES)`.
 *
 * Landing kept saying **36** for a day, on `/connectors/`, `/why-cheaper/`, the
 * pricing FAQ and nine sentences across eight blog posts, with every check
 * green — because every count here was bound to `connectors.length`, the number
 * of *pages we publish*. That is the #391 failure mode: a published claim bound
 * to what landing believes rather than to what production offers, which turns a
 * visible mismatch into a coherent, self-consistent assertion of something
 * untrue. `connector-count-parity.yml` would have caught it, but it is a daily
 * cron and had not run since the withdrawal (landing#443).
 *
 * ## Why the page stays
 *
 * A withdrawal is temporary. 301ing away a ranking connector page is
 * landing#294 exactly, where the site withdrew Google Ads, core reversed it six
 * weeks later, and the page had already been redirected into the index. So the
 * rule is **mark it, do not delete it** — and every assertion below is about
 * marking.
 *
 * ## Why this is written as an invariant
 *
 * Every assertion quantifies over `withdrawnConnectors`, never over the string
 * `"s3"`. `connectors.test.ts` records what naming an instance costs: it once
 * asserted `google-ads` was withdrawn, went red on the *correct* change when
 * core restored it, and could never have noticed a withdrawal it was not told
 * about. This file is told nothing; it reads the marker.
 *
 * ## Why it is not vacuous when nothing is withdrawn
 *
 * If the set empties, the per-withdrawn assertions pass by having no members —
 * the `plans >= 5` restore-drill shape. Two things stop that reading as clean:
 * the arithmetic test below is meaningful at any size, and every *available*
 * connector page is asserted to carry **no** unavailability notice, which is a
 * live assertion over 35 pages that fails if the notice is ever rendered
 * unconditionally. The pair discriminates; either alone does not.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { connectors, availableConnectors } from "../src/data/connectors";
import type { Connector } from "../src/data/connectors";
import { useCases } from "../src/data/use-cases";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

const withdrawnConnectors = connectors.filter((c) => c.withdrawn);

/** The rendered marker on `/connectors/<slug>/` and `/use-cases/<slug>/`. */
const UNAVAILABLE_NOTICE = "Temporarily unavailable";

function readHtml(rel: string): string {
  const file = resolve(DIST, rel);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

describe("the marketed catalogue excludes withdrawn connectors", () => {
  it("availableConnectors is connectors minus the withdrawn ones", () => {
    // Meaningful at any size, including zero withdrawn — this is the assertion
    // that keeps an empty withdrawn set from reading as a clean pass.
    expect(availableConnectors.length).toBe(connectors.length - withdrawnConnectors.length);
    expect(availableConnectors.some((c) => c.withdrawn)).toBe(false);
  });

  it("every withdrawal cites a tracking issue, so the copy is greppable when it closes", () => {
    for (const c of withdrawnConnectors) {
      expect(
        /(?:core|landing)?#\d+/.test(c.withdrawn as string),
        `${c.slug}'s withdrawal text names no issue. Without one, nothing connects this ` +
          "copy to the fix, and it outlives the defect.",
      ).toBe(true);
    }
  });

  it("a withdrawn connector keeps its page — marking is the remedy, not deletion", () => {
    for (const c of withdrawnConnectors) {
      expect(
        existsSync(resolve(DIST, `connectors/${c.slug}/index.html`)),
        `/connectors/${c.slug}/ is gone. A withdrawal is temporary; deleting a ranking ` +
          "connector page is landing#294. Mark it instead.",
      ).toBe(true);
    }
  });
});

describe("every surface that names a connector respects the withdrawal", () => {
  it("the withdrawn connector's own page renders the notice and its reason", () => {
    for (const c of withdrawnConnectors) {
      const html = readHtml(`connectors/${c.slug}/index.html`);
      expect(html, `/connectors/${c.slug}/ does not render the unavailability notice`).toContain(
        UNAVAILABLE_NOTICE,
      );
      // A banner with no reason is a dead end. Pin a distinctive fragment of the
      // stated reason rather than the whole string, which carries entities once
      // rendered.
      const fragment = (c.withdrawn as string).split(".")[0].slice(0, 40);
      expect(html, `/connectors/${c.slug}/ shows a banner but not why`).toContain(fragment);
    }
  });

  it("an available connector's page renders no unavailability notice", () => {
    // The negative control, and the half that keeps the test honest when nothing
    // is withdrawn: it fails if the notice is ever rendered unconditionally.
    const offenders = availableConnectors
      .map((c) => c.slug)
      .filter((slug) => readHtml(`connectors/${slug}/index.html`).includes(UNAVAILABLE_NOTICE));
    expect(
      offenders,
      `These connectors are available but their pages say "${UNAVAILABLE_NOTICE}": ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("a use case built on a withdrawn connector says the pipeline cannot be built", () => {
    const withdrawnSlugs = new Set(withdrawnConnectors.map((c) => c.slug));
    const affected = useCases.filter(
      (uc) => withdrawnSlugs.has(uc.sourceSlug) || withdrawnSlugs.has(uc.destinationSlug),
    );
    for (const uc of affected) {
      const html = readHtml(`use-cases/${uc.slug}/index.html`);
      expect(
        html,
        `/use-cases/${uc.slug}/ sells a pipeline through a withdrawn connector with no notice`,
      ).toContain("cannot be built right now");
    }
  });

  it("a use case built only on available connectors carries no such notice", () => {
    const withdrawnSlugs = new Set(withdrawnConnectors.map((c) => c.slug));
    const clean = useCases.filter(
      (uc) => !withdrawnSlugs.has(uc.sourceSlug) && !withdrawnSlugs.has(uc.destinationSlug),
    );
    const offenders = clean
      .map((uc) => uc.slug)
      .filter((slug) => readHtml(`use-cases/${slug}/index.html`).includes("cannot be built right now"));
    expect(offenders, `Notice rendered on unaffected use cases: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the homepage integrations grid does not name a withdrawn connector", () => {
    // `Integrations.astro`'s category lists are hand-written display strings —
    // there is no slug to derive from — so the check is on the rendered names.
    // This is the one surface where a withdrawal has to be applied by hand, and
    // therefore the one that needs a test rather than a comment.
    const src = readFileSync(resolve(ROOT, "src/components/Integrations.astro"), "utf-8");
    const itemsBlocks = [...src.matchAll(/items:\s*\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(itemsBlocks.length, "no `items:` arrays found — Integrations.astro changed shape").toBeGreaterThan(3);
    const listed = itemsBlocks.join(" | ");
    for (const c of withdrawnConnectors) {
      expect(
        new RegExp(`"${c.name}"`).test(listed),
        `Integrations.astro lists "${c.name}", which core has withdrawn from the picker`,
      ).toBe(false);
    }
  });

  it("the setup guide for a withdrawn connector says so", () => {
    // Product owns the guide copy (landing PR #438); this asserts the fact is
    // stated, not the wording.
    const SAYS_UNAVAILABLE = /unavailable|cannot (?:currently )?be created|not currently available/i;
    for (const c of withdrawnConnectors) {
      const guide = resolve(ROOT, `src/content/connectors/${c.slug}.md`);
      if (!existsSync(guide)) continue; // not every connector has a setup guide
      expect(
        SAYS_UNAVAILABLE.test(readFileSync(guide, "utf-8")),
        `src/content/connectors/${c.slug}.md walks the reader through setting up a connector ` +
          "they cannot create, and never says so.",
      ).toBe(true);
    }
  });
});

/**
 * ## landing#680 — the surfaces the derived mechanism did not reach
 *
 * Everything above quantifies over `withdrawnConnectors` and was already load-bearing. Three
 * surfaces sat outside it, and all three marketed the withdrawn `s3` with no marker at all:
 *
 * 1. **The "Popular Pipelines" pills on the comparison pages** were three hand-written anchors
 *    per page, so `/compare/fivetran` sold `S3 -> Snowflake` on the one surface where we are
 *    least entitled to overpromise. Now rendered by `UseCasePills.astro`, which derives both the
 *    label and the availability from the data files.
 * 2. **The "Related Connectors" cards** on six connector pages list `s3` and read as an
 *    invitation to go and connect it.
 * 3. **Three other connectors' `seoDescription` strings** named S3 as a source we load from.
 *    Metadata travels into a search result without the page's banner attached, so this is the
 *    landing#467 lesson: the body may stay dated, the metadata has to become true.
 *
 * ## 🚨 The needle is the NAME **and** the SLUG, and the name alone is blind
 *
 * Measured on the pre-fix tree, not reasoned: `s3`'s catalogue `name` is **"Amazon S3"**, and the
 * three defective descriptions spell it **"S3"**. Grepping `origin/dev` returned **4** matches for
 * a bare `S3` in `seoDescription` and **1** for `Amazon S3` — and that single match was the `s3`
 * entry's own, legitimate self-description. **A guard built on `name` would have reported zero
 * defects while all three were live**, which is this project's dominant failure shape: an
 * instrument that cannot see part of its population reports that part as clean.
 *
 * So the needle set is derived from both fields, and the control below pins that the short
 * spelling is caught — otherwise somebody simplifies this back to `name` and it goes quiet.
 */

/** Escape a literal for use inside a RegExp. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * How a withdrawn connector can be spelled in marketed prose: its catalogue name, and its slug
 * with the hyphens relaxed — `google-ads` reaches "Google Ads", `s3` reaches "S3".
 */
function needles(c: Connector): RegExp[] {
  const fromSlug = c.slug.split("-").map(esc).join("[-\\s]?");
  return [new RegExp(`\\b${esc(c.name)}\\b`, "i"), new RegExp(`\\b${fromSlug}\\b`, "i")];
}

const MARKER = 'data-availability="withdrawn"';

/** The compare pages, selected by what they ARE rather than by a list: built pages under
 *  `/compare/` that render a pipeline pill row. A fifth one is covered the day it ships. */
function comparePages(): { slug: string; html: string }[] {
  const dir = resolve(DIST, "compare");
  return readdirSync(dir)
    .filter((entry) => existsSync(resolve(dir, entry, "index.html")))
    .map((entry) => ({ slug: entry, html: readFileSync(resolve(dir, entry, "index.html"), "utf-8") }))
    .filter((p) => p.html.includes("Popular Pipelines"));
}

/** The pill row, bounded on both ends — `slice(at)` would take the rest of the document and turn
 *  a rotted anchor into a vacuous pass rather than a red. */
function pillRegion(html: string, page: string): string {
  const start = html.indexOf("Popular Pipelines");
  const end = html.indexOf("Top Connectors", start);
  if (start < 0 || end < 0) {
    throw new Error(
      `/compare/${page}/: could not bound the pill row (start=${start}, end=${end}). ` +
        "The heading anchor rotted; fix the anchor rather than widening the slice.",
    );
  }
  return html.slice(start, end);
}

function relatedRegion(html: string, page: string): string {
  const start = html.indexOf("Related Connectors");
  if (start < 0) return ""; // a connector with no related entries renders no section
  const end = html.indexOf("</section>", start);
  if (end < 0) throw new Error(`/connectors/${page}/: Related Connectors section never closes`);
  return html.slice(start, end);
}

const PILL = /<a\b[^>]*href="\/use-cases\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

describe("the derived mechanism reaches the pills, the cards and the metadata (landing#680)", () => {
  it("a needle catches the SHORT spelling, which the catalogue name misses", () => {
    for (const c of withdrawnConnectors) {
      const short = `Load data from ${c.slug.toUpperCase()} into your warehouse.`;
      expect(
        needles(c).some((re) => re.test(short)),
        `no needle for ${c.slug} matches its short spelling — this is the exact blindness ` +
          "landing#680 measured: name \"Amazon S3\" never matches the published \"S3\".",
      ).toBe(true);
      // And the pair must not collapse: if someone rewrites `needles` to return the name only,
      // the assertion above is the one that goes red, so pin the arity too.
      expect(needles(c)).toHaveLength(2);
    }
  });

  it("a needle does NOT fire on an available connector (negative control)", () => {
    const control = availableConnectors[0];
    const sentence = `Load data from ${control.name} into your warehouse.`;
    for (const c of withdrawnConnectors) {
      expect(
        needles(c).some((re) => re.test(sentence)),
        `${c.slug}'s needle matched a sentence about ${control.name} — it is over-broad, and an ` +
          "over-broad guard gets deleted rather than narrowed.",
      ).toBe(false);
    }
  });

  it("no available connector's SEO metadata names a withdrawn connector", () => {
    const FIELDS = ["seoTitle", "seoDescription", "seoH1", "description"] as const;
    const offenders: string[] = [];
    for (const c of availableConnectors) {
      for (const field of FIELDS) {
        const value = c[field];
        if (typeof value !== "string") continue;
        for (const w of withdrawnConnectors) {
          if (needles(w).some((re) => re.test(value))) {
            offenders.push(`${c.slug}.${field} names "${w.name}": ${value}`);
          }
        }
      }
    }
    expect(
      offenders,
      "Metadata travels into a search result without the withdrawal banner attached:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("every pipeline pill inherits its two connectors' availability", () => {
    const pages = comparePages();
    expect(pages.length, "no built compare page renders a pill row").toBeGreaterThanOrEqual(4);

    const bySlug = new Map(useCases.map((uc) => [uc.slug, uc]));
    const withdrawnSlugs = new Set(withdrawnConnectors.map((c) => c.slug));
    const offenders: string[] = [];
    let pillCount = 0;
    let markedCount = 0;

    for (const page of pages) {
      const region = pillRegion(page.html, page.slug);
      const pills = [...region.matchAll(PILL)];
      expect(
        pills.length,
        `/compare/${page.slug}/ renders ${pills.length} pipeline pills — the extraction is not ` +
          "reading the row it was aimed at.",
      ).toBeGreaterThanOrEqual(3);

      for (const [whole, slug] of pills) {
        pillCount++;
        const uc = bySlug.get(slug);
        expect(uc, `/compare/${page.slug}/ links /use-cases/${slug}/, which is in no data file`)
          .toBeTruthy();
        const shouldMark =
          withdrawnSlugs.has(uc!.sourceSlug) || withdrawnSlugs.has(uc!.destinationSlug);
        const marked = whole.includes(MARKER);
        if (marked) markedCount++;
        if (shouldMark !== marked) {
          offenders.push(
            `/compare/${page.slug}/ -> ${slug}: withdrawn half = ${shouldMark}, marked = ${marked}`,
          );
        }
      }
    }

    // Both halves are live: the marked count proves the marker renders at all, and the unmarked
    // majority proves it is not rendered unconditionally. Either alone passes on a broken row.
    expect(offenders, offenders.join("\n")).toEqual([]);
    expect(pillCount, "fewer pills than the four compare pages can carry").toBeGreaterThanOrEqual(12);
    if (withdrawnConnectors.length > 0) {
      expect(markedCount, "nothing is marked, yet a connector is withdrawn").toBeGreaterThan(0);
    }
  });

  it("a related-connector card carries the marker exactly when that connector is withdrawn", () => {
    const withdrawnSlugs = new Set(withdrawnConnectors.map((c) => c.slug));
    const offenders: string[] = [];
    let expectedTotal = 0;
    let renderedTotal = 0;

    for (const c of connectors) {
      const expected = c.related.filter((s) => withdrawnSlugs.has(s)).length;
      const region = relatedRegion(readHtml(`connectors/${c.slug}/index.html`), c.slug);
      const rendered = (region.match(new RegExp(esc(MARKER), "g")) ?? []).length;
      expectedTotal += expected;
      renderedTotal += rendered;
      if (expected !== rendered) {
        offenders.push(`/connectors/${c.slug}/: expected ${expected} marker(s), found ${rendered}`);
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
    // Anti-vacuity: a rotted region would give 0 === 0 on almost every page and read as clean.
    if (withdrawnConnectors.length > 0) {
      expect(expectedTotal, "no connector lists a withdrawn one as related — check the data")
        .toBeGreaterThan(0);
      expect(renderedTotal).toBe(expectedTotal);
    }
  });
});
