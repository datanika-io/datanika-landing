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
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { connectors, availableConnectors } from "../src/data/connectors";
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
