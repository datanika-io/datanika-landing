/**
 * landing#395 — the connector guides' screenshot coverage, measured rather than asserted.
 *
 * The issue's title says the corpus is "36/36 on the add-connection screenshot and 3/36 on the
 * one that proves data actually landed". Re-derived 2026-09-07 on `main 49c8114c`: it is
 * **36/37 and 8/37**. The ratio in the title has drifted twice and nothing recomputes it,
 * because until this file **there was no guard on connector screenshots at all**.
 *
 * Three distinct properties, and they fail in different directions:
 *
 *  1. **A referenced image exists.** This is the one that fails SILENTLY today. A markdown
 *     `![alt](/docs/connectors/x/y.png)` is an `<img src>`; Astro does not resolve `public/`
 *     paths at build time, so a guide can promise a screenshot that 404s and `npm run build`
 *     stays green. Currently 0 violations — this pins that.
 *
 *  2. **The first-run capture and its reference move together.** A file with no reference is
 *     invisible to readers; a reference with no file is a broken image. Both directions, both
 *     derived from disk — no list.
 *
 *  3. **A ratchet on the count.** One number, and its semantics are stated: raise it as
 *     captures land, never lower it. It is deliberately NOT a target and deliberately NOT a
 *     hand-written list of which connectors are covered — that list is derivable, and a
 *     hand-maintained one is the failure mode this repo keeps paying for.
 *
 * 🚨 Why the first-run shot is the one that matters, and why a count of it is not pedantry:
 * `02-add-connection.png` proves **the form renders**. `04-first-run.png` proves **data landed**.
 * A green run has been wrong twice — core#492 (file sources loaded a *listing* of files rather
 * than their contents and reported `success`) and core#493 (a zero-match glob also completes as
 * `success`). The template's own capture rules say the shot must be the **Data preview** read
 * live from the destination, never the `/runs` table. Three guides once carried an
 * `04-first-run.png` that showed `/runs`, which is why landing#395 scored the set 0/36 rather
 * than 3/36 in the first place.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const GUIDE_DIR = resolve(__dirname, "../src/content/connectors");
const PUBLIC_DIR = resolve(__dirname, "../public");

const guides = readdirSync(GUIDE_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

const readGuide = (name: string) => readFileSync(resolve(GUIDE_DIR, name), "utf-8");
const slugOf = (name: string) => name.replace(/\.md$/, "");

/**
 * Every `/docs/connectors/...` image path a markdown body references.
 *
 * Scoped to that prefix on purpose: guides link to `/docs/...` pages and to external URLs too,
 * and a matcher wide enough to catch those would report every prose link as a missing file.
 */
const IMAGE_REF = /!\[[^\]]*\]\((\/docs\/connectors\/[^)\s]+\.(?:png|jpg|jpeg|webp|svg))\)/g;

function imageRefs(body: string): string[] {
  return [...body.matchAll(IMAGE_REF)].map((m) => m[1]);
}

/** `/docs/connectors/x/y.png` is served from `public/docs/connectors/x/y.png`. */
const publicPathFor = (ref: string) => resolve(PUBLIC_DIR, ref.replace(/^\//, ""));

const hasFirstRunFile = (slug: string) =>
  existsSync(resolve(PUBLIC_DIR, "docs/connectors", slug, "04-first-run.png"));

const hasFirstRunRef = (name: string) => imageRefs(readGuide(name)).some((r) => r.endsWith("/04-first-run.png"));

describe("connector guide screenshots (landing#395)", () => {
  it("the corpus is the size this guard was derived against", () => {
    // A tripwire, not a target. If the directory moves or the glob stops matching, every
    // `it.each` below silently becomes zero cases and the suite still goes green.
    expect(guides.length, `expected 37 connector guides in ${GUIDE_DIR}`).toBe(37);
  });

  it("the scan actually found image references", () => {
    // Anti-vacuity for the extractor itself. If IMAGE_REF stops matching — a markdown style
    // change, a path rename — property 1 below passes for every guide by finding nothing.
    const total = guides.reduce((n, g) => n + imageRefs(readGuide(g)).length, 0);
    expect(total, "IMAGE_REF matched nothing across the corpus — the extractor is broken").toBeGreaterThan(30);
  });

  // ── Property 1 — a referenced image exists. Fails silently in the build today. ──
  it.each(guides)("%s references no image that is missing from public/", (guide) => {
    const missing = imageRefs(readGuide(guide)).filter((ref) => !existsSync(publicPathFor(ref)));
    expect(
      missing,
      `${guide} references ${missing.length} image(s) with no file under public/. ` +
        `Astro does not resolve public/ paths at build time, so this 404s for readers ` +
        `while every check stays green.`,
    ).toEqual([]);
  });

  // ── Property 2 — the first-run capture and its reference move together. ──
  it.each(guides)("%s: the first-run capture and its reference agree", (guide) => {
    const slug = slugOf(guide);
    expect(
      hasFirstRunRef(guide),
      hasFirstRunFile(slug)
        ? `public/docs/connectors/${slug}/04-first-run.png exists but ${guide} never shows it — ` +
          `the capture was taken and no reader can see it.`
        : `${guide} references 04-first-run.png but no such file exists — a broken image.`,
    ).toBe(hasFirstRunFile(slug));
  });

  // ── Property 3 — the ratchet. ──
  it("the number of guides proving data landed does not go backwards", () => {
    const covered = guides.filter((g) => hasFirstRunFile(slugOf(g))).map(slugOf);

    // 🔒 RATCHET. 8 as of 2026-09-07: csv, duckdb, json, parquet, postgresql, rest-api,
    // shopify, stripe. **Raise this as captures land; never lower it.** It is one number
    // rather than a hand-written list of covered connectors, because that list is derivable
    // from disk and a hand-maintained copy of a derivable fact is what landing#508 was about.
    // It is a floor, not a target — landing#395 is the work of raising it.
    const FIRST_RUN_FLOOR = 8;

    expect(
      covered.length,
      `only ${covered.length} of ${guides.length} guides carry a first-run capture ` +
        `(${covered.join(", ")}). This is a ratchet: if a capture was deliberately removed, ` +
        `lower the floor in the same commit and say why.`,
    ).toBeGreaterThanOrEqual(FIRST_RUN_FLOOR);
  });

  // ── The extractor's own negative controls, in-suite. ──
  //
  // A guard proved discriminating once by an external harness is a claim about a past session;
  // arming it here runs every time CI does.
  describe("the extractor fires on a missing image and spares a present one", () => {
    it("finds a planted reference", () => {
      expect(imageRefs("![x](/docs/connectors/zzz/04-first-run.png)")).toEqual([
        "/docs/connectors/zzz/04-first-run.png",
      ]);
    });

    it("ignores a non-image link, so prose links are not reported as missing files", () => {
      expect(imageRefs("[the models page](/docs/connectors/stripe)")).toEqual([]);
    });

    it("a planted reference to a nonexistent file resolves to a path that does not exist", () => {
      // The control for property 1: proves the existsSync arm can be false at all.
      expect(existsSync(publicPathFor("/docs/connectors/zzz/04-first-run.png"))).toBe(false);
    });

    it("a real reference resolves to a path that does exist", () => {
      // …and the other direction, so the check is not passing because every path is missing.
      expect(existsSync(publicPathFor("/docs/connectors/stripe/04-first-run.png"))).toBe(true);
    });
  });
});
