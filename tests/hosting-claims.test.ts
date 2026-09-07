import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, relative } from "path";

/**
 * Which published surfaces name a hosting provider, and is each one accounted
 * for (landing#467, landing#343).
 *
 * ## The gap this closes
 *
 * Production moved Hetzner (Nuremberg) → pointer.gr (Athens) on **2026-07-17**.
 * `/privacy` and `/trust` still named Hetzner on **2026-08-30** — six weeks,
 * every build green, because nothing connected the two (#343). Fixing those two
 * pages did not close the class: two **blog posts** still described production
 * as running on Hetzner, and both had been syndicated to dev.to (#467).
 *
 * `legal-pages-facts.test.ts` is the guard for exactly this fact and could not
 * see either post — its `PAGES` constant is a hardcoded two-page map. From
 * `docs/GROWTH_RULES.md`: *"A guard's scope is a path set as much as a
 * phrasing… When a fact about us changes, ask which surfaces assert it — not
 * which pages you remember writing."* This file is that question, asked of the
 * built artifact.
 *
 * ## Why this is an INVENTORY and not a ban
 *
 * #467 left this guard unbuilt for a stated reason: under the founder's Option B
 * the April cost post legitimately names Hetzner **ten times**, so a regex over
 * prose cries wolf. That reason is real, and I measured the specific failure
 * before choosing this shape — a production-ownership proximity pattern at a
 * 130-character window flags `/blog/real-cost-modern-data-stack`, where
 * *"collapses five vendor invoices into a **Hetzner** bill"* sits ~100 characters
 * from *"We publish **our own infrastructure** bill"*. Two unrelated clauses, one
 * false positive, and `GROWTH_RULES` is explicit that a guard which fires on
 * correct copy gets loosened until it fires on nothing.
 *
 * So membership is **derived from `dist/`** and every member must be **bucketed
 * with a reason**. A new page naming a retired host cannot be quietly published:
 * it fails here until somebody classifies it, and classifying it requires
 * reading the sentence. That is the same instrument as
 * `byte-pricing-surface-inventory.test.ts`, for the same reason — *"we did not
 * know it was there"* is the failure being fixed.
 *
 * 🔑 **A green here does NOT mean the site describes the right host.** It means
 * every surface naming a host has been read by someone. The claim that we are on
 * pointer.gr is asserted positively at the bottom, and only for the two pages
 * that carry it as a legal representation.
 */

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/**
 * Hosts we have retired. Re-derive from `/trust`'s change log, never from
 * memory: `legal-pages-facts.test.ts` holds that log to the real move.
 */
const RETIRED_HOSTS = /\bhetzner\b|\bnuremberg\b|\bn(?:ü|u)rnberg\b|\bfalkenstein\b/i;

/** The current application host, as `/trust` and `/privacy` state it. */
const CURRENT_HOST = /pointer\.gr|\bPointer\b/;

function visibleText(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * The whole document, including `<head>`. The og/twitter/JSON-LD half is where
 * #467's worst instance lived: a description is stripped of every sentence that
 * would date it, and it is what a search result shows.
 */
function wholeDocument(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

function builtPages(): { route: string; html: string }[] {
  const out: { route: string; html: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "index.html" || entry === "404.html")
        out.push({
          route: "/" + relative(DIST, full).replace(/\\/g, "/"),
          html: readFileSync(full, "utf-8"),
        });
    }
  };
  walk(DIST);
  return out;
}

/* ------------------------------------------------------------------ *
 * The buckets. Membership is derived; these say which kind each is.
 * ------------------------------------------------------------------ */

/**
 * Pages carrying the move as a legal representation. Their Hetzner budget is
 * already pinned by `legal-pages-facts.test.ts` (`ALLOWED`: 2 on `/trust`), so
 * this file does not re-assert it — it only accounts for them.
 */
const LEGAL_CHANGE_LOG = ["/trust/index.html"];

/**
 * Pages describing OUR OWN infrastructure during the Hetzner era. These must
 * carry a date frame — the founder's Option B on #467: date the record, do not
 * rewrite it, because a cost post that edits its own numbers after the fact is
 * not worth reading.
 */
const DATED_HISTORICAL = ["/blog/saas-12-euros/index.html"];

/**
 * Pages naming Hetzner as a VENDOR whose list price is quoted, or as the box a
 * dated benchmark ran on. Neither asserts where our production runs.
 *
 * ⚠️ Each entry is a claim that somebody read the sentence. If a page here
 * starts describing our production, this list is wrong and nothing else will
 * say so — which is the honest limit of an inventory guard.
 */
const VENDOR_OR_BENCHMARK: { route: string; reason: string }[] = [
  {
    route: "/blog/real-cost-modern-data-stack/index.html",
    reason:
      "Hetzner is the vendor whose €11.49 list price is quoted in a table costing " +
      "THE READER's 2026 stack. The post's one reference to our own bill links out " +
      "to /blog/saas-12-euros/ rather than naming a host.",
  },
  {
    route: "/blog/pricing-v2-math-and-why/index.html",
    reason:
      "A dated benchmark: 17,704 rows/second on a Hetzner CPX32, run 2026-04-16, " +
      "before the move. scripts/benchmark/results/pointer-2026-07-20.md records that " +
      "the CPX32 dataset remains the representative number, so restating it against " +
      "the new host would falsify a measurement.",
  },
];

const INVENTORY = [
  ...LEGAL_CHANGE_LOG,
  ...DATED_HISTORICAL,
  ...VENDOR_OR_BENCHMARK.map((v) => v.route),
];

describe("every published surface naming a host is accounted for (#467, #343)", () => {
  const pages = builtPages();

  it("dist/ exists and holds a plausible number of pages", () => {
    expect(existsSync(DIST), "run `npm run build` first").toBe(true);
    expect(pages.length).toBeGreaterThan(100);
  });

  /** Derived membership: whole document, so og/twitter/JSON-LD count. */
  const namesRetiredHost = pages
    .filter((p) => RETIRED_HOSTS.test(wholeDocument(p.html)))
    .map((p) => p.route)
    .sort();

  it("the sweep finds something (guards a dead walk or a dead regex)", () => {
    // If this ever legitimately reaches zero — every historical post retired —
    // it fails here rather than silently certifying an empty set. Deleting the
    // inventory is then a deliberate act, not an accident.
    expect(
      namesRetiredHost.length,
      "no built page names a retired host. Either the regex broke or the corpus " +
        "changed; both need a human, and neither is a pass.",
    ).toBeGreaterThan(0);
  });

  it("no page names a retired host without being in the inventory", () => {
    const unaccounted = namesRetiredHost.filter((r) => !INVENTORY.includes(r));
    expect(
      unaccounted,
      "These built pages name a host we no longer use and are in no bucket. Read the " +
        "sentence, then add the route to LEGAL_CHANGE_LOG, DATED_HISTORICAL, or " +
        "VENDOR_OR_BENCHMARK with a reason. If it describes where our production runs " +
        "TODAY, it is simply wrong — that is #343 and #467:\n" +
        unaccounted.map((r) => `  + ${r}`).join("\n"),
    ).toEqual([]);
  });

  it("no inventory entry has gone stale", () => {
    // An exemption that matches nothing is a claim about the site that quietly
    // stopped being true. `byte-pricing-surface-inventory` learned this first.
    const stale = INVENTORY.filter((r) => !namesRetiredHost.includes(r));
    expect(
      stale,
      `inventoried but no longer names a retired host — drop the entry: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  /**
   * The load-bearing assertion for the DATED_HISTORICAL bucket. Option B keeps
   * the historical rows; what makes that honest is the frame around them, and a
   * frame is exactly the thing a later editor tidies away.
   */
  it.each(DATED_HISTORICAL)(
    "%s carries a date frame and names the current host",
    (route) => {
      const page = pages.find((p) => p.route === route);
      expect(page, `${route} is inventoried but does not build`).toBeDefined();
      const text = visibleText(page!.html);

      // A dated update note: a month name with a 2026+ year, near the top.
      expect(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d\d\b/.test(
          text.slice(0, 4000),
        ),
        `${route} keeps historical hosting rows with no dated note framing them.`,
      ).toBe(true);

      // And it must say where production actually is, or the frame tells the
      // reader the post is old without telling them what is true.
      expect(
        CURRENT_HOST.test(text),
        `${route} dates its Hetzner rows but never names the current host.`,
      ).toBe(true);
    },
  );

  /**
   * 🚨 The metadata half, which is where #467's worst instance lived. A
   * description, og:title or JSON-LD headline is stripped of the sentences that
   * date the body, so it can assert the Hetzner era with no frame at all — and
   * it is what a search result renders.
   */
  it.each(DATED_HISTORICAL)("%s does not name a retired host in its metadata", (route) => {
    const page = pages.find((p) => p.route === route);
    const head = page!.html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? "";
    expect(head.length, "no <head> found — the assertion would be vacuous").toBeGreaterThan(200);
    expect(
      RETIRED_HOSTS.test(wholeDocument(head)),
      `${route}'s <head> (meta description, og:*, twitter:*, JSON-LD) names a retired ` +
        "host. Metadata carries no date frame and is what a search result shows.",
    ).toBe(false);
  });
});

/**
 * The positive half. Everything above is accounting; this is the claim.
 * Deliberately narrow: only the two pages that state the host as a legal
 * representation are required to name it, because those are the two `CLAUDE.md`
 * names as needing an update when the host changes.
 */
describe("the pages that state the host as a representation name the real one", () => {
  const pages = builtPages();

  it.each(["/privacy/index.html", "/trust/index.html"])("%s names the current host", (route) => {
    const page = pages.find((p) => p.route === route);
    expect(page, `${route} does not build`).toBeDefined();
    expect(
      CURRENT_HOST.test(visibleText(page!.html)),
      `${route} states our hosting arrangements and does not name pointer.gr.`,
    ).toBe(true);
  });
});

describe("controls", () => {
  it("RETIRED_HOSTS matches the real spellings and not the current host", () => {
    // Dead-regex control: a pattern that matches nothing produces the same
    // clean sweep as a clean site.
    for (const s of ["Hetzner", "hetzner", "Nuremberg", "Nürnberg", "Falkenstein"])
      expect(RETIRED_HOSTS.test(s), `${s} should match`).toBe(true);
    for (const s of ["Pointer", "pointer.gr", "Athens", "Aweb"])
      expect(RETIRED_HOSTS.test(s), `${s} must NOT match`).toBe(false);
  });

  it("CURRENT_HOST does not match a retired one", () => {
    expect(CURRENT_HOST.test("pointer.gr")).toBe(true);
    expect(CURRENT_HOST.test("Hetzner CPX31 (Nuremberg)")).toBe(false);
  });

  it("visibleText survives the renderer rather than a raw sample", () => {
    // GROWTH_RULES: a pattern proved against a hand-written string can still be
    // blind to what the renderer emits. Prove it on a real built page.
    const trust = builtPages().find((p) => p.route === "/trust/index.html");
    const text = visibleText(trust!.html);
    expect(text.length / trust!.html.length).toBeGreaterThan(0.05);
    expect(RETIRED_HOSTS.test(text), "/trust's change log must survive tag-stripping").toBe(true);
  });
});
