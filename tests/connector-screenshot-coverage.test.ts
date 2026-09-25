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

  // ── The step captures this guard covers. ──
  //
  // 🆕 2026-09-25 (landing#395). This used to watch `04-first-run.png` ALONE, and the issue it
  // serves tracks five step captures. So `03-configure-upload.png` and `05-schedule.png` could be
  // deleted, or captured and never referenced, and nothing anywhere went red — the two properties
  // below were already written generically enough to cover them and simply were not pointed at them.
  // *An instrument that cannot see part of its population reports that part as clean.*
  //
  // `01-credentials.png` is deliberately absent: it means screenshotting a vendor's own admin
  // console, which #395 rules out as a policy rather than tracks as a gap. `02-add-connection.png`
  // is 36/36 and is guarded by `connector-coverage-guard.test.ts`.
  const STEP_CAPTURES = [
    // 🔒 Floors, measured off disk on 2026-09-25. Raise as captures land; never lower one without
    // saying why in the same commit.
    { file: "03-configure-upload.png", floor: 11, what: "the upload form" },
    { file: "04-first-run.png", floor: 16, what: "data landing in the destination" },
    { file: "05-schedule.png", floor: 3, what: "the schedule form" },
  ];

  const hasShotFile = (slug: string, file: string) =>
    existsSync(resolve(PUBLIC_DIR, "docs/connectors", slug, file));
  const hasShotRef = (guide: string, file: string) =>
    imageRefs(readGuide(guide)).some((r) => r.endsWith(`/${file}`));

  // ── Property 2 — a step capture and its reference move together, for every step. ──
  it.each(
    guides.flatMap((guide) => STEP_CAPTURES.map((c) => [guide, c.file] as const)),
  )("%s: %s and its reference agree", (guide, file) => {
    const slug = slugOf(guide);
    expect(
      hasShotRef(guide, file),
      hasShotFile(slug, file)
        ? `public/docs/connectors/${slug}/${file} exists but ${guide} never shows it — ` +
          `the capture was taken and no reader can see it.`
        : `${guide} references ${file} but no such file exists — a broken image.`,
    ).toBe(hasShotFile(slug, file));
  });

  // ── Property 3 — the ratchets. ──
  it.each(STEP_CAPTURES)("the number of guides carrying $file does not go backwards", (c) => {
    const covered = guides.filter((g) => hasShotFile(slugOf(g), c.file)).map(slugOf);

    // 🔒 RATCHET. History for 04, kept because it is the one that has drifted twice:
    // 15 as of 2026-09-22 (8 on 2026-09-07; the openapi walk added one, landing#572, the mysql walk
    // another, the mssql and mongodb walks two more, and the sqlite and kafka walks one each). The
    // clickhouse walk of 2026-09-16 added none, because /models could not list a ClickHouse
    // destination's tables then (landing#604); the 2026-09-22 walk, on a stack carrying that fix
    // (core#1397), took it (landing#618). **16 since the HubSpot walk of 2026-09-23 (landing#670),
    // which took the capture and did not raise the floor** — the second time this number has lagged
    // disk by one, after reading 8 while 9 captures existed. Re-derive it from disk when you touch
    // it; the floor is a tripwire against deletion, not a record of how many exist.
    //
    // It is one number rather than a hand-written list of covered connectors, because that list is
    // derivable from disk and a hand-maintained copy of a derivable fact is what landing#508 was
    // about. It is a floor, not a target — landing#395 is the work of raising it.
    expect(
      covered.length,
      `only ${covered.length} of ${guides.length} guides carry ${c.file} (${c.what}) ` +
        `(${covered.join(", ")}). This is a ratchet: if a capture was deliberately removed, ` +
        `lower the floor in the same commit and say why.`,
    ).toBeGreaterThanOrEqual(c.floor);
  });

  it("the step-capture floors are not silently ahead of disk", () => {
    // Anti-vacuity for the ratchet itself. A floor of 0 — or a `file` nobody ever writes — passes
    // property 3 for every guide while watching nothing. Require each capture to exist somewhere.
    for (const c of STEP_CAPTURES) {
      expect(c.floor, `${c.file} has a floor of ${c.floor}, which watches nothing`).toBeGreaterThan(0);
      const covered = guides.filter((g) => hasShotFile(slugOf(g), c.file)).length;
      expect(covered, `${c.file}: floor ${c.floor} but ${covered} on disk`).toBeGreaterThanOrEqual(c.floor);
    }
    // The matcher must be able to say no: a capture name that cannot exist must score zero.
    expect(guides.filter((g) => hasShotFile(slugOf(g), "99-no-such-capture.png")).length).toBe(0);
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
