import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, relative } from "path";
import { pricingFaq } from "../src/data/pricing-faq";
import { tiers } from "../src/data/pricing-tiers";

/**
 * Free is capped on **two** metered dimensions and both are enforced in
 * production today. This guard exists because we published one of them.
 *
 * ## The measurement this file is derived from
 *
 * Read off the production `plans` table and the serving container on
 * **2026-09-07** (landing#396). Re-derive rather than trusting this block —
 * `CLAUDE.md`'s copy of the same table has drifted twice in one day:
 *
 * ```bash
 * ssh -i ~/.ssh/id_ed25519 root@185.25.22.188 \
 *   'docker exec datanika-postgres bash -c "psql -A -F\"|\" -U \$POSTGRES_USER \
 *      -d \$POSTGRES_DB -c \"SELECT slug, runs_included, hard_cap_runs, \
 *      bytes_included, hard_cap_bytes, overage_bytes_price_cents_per_gb \
 *      FROM plans ORDER BY id\""'
 * ```
 *
 * | slug | runs_included | hard_cap_runs | bytes_included | hard_cap_bytes | ¢/GB |
 * |---|---|---|---|---|---|
 * | `free`               | 500    | **t** | 10 GiB  | **t** | NULL |
 * | `pro-monthly`        | 15000  | f     | 100 GiB | f     | 50   |
 * | `pro-annual`         | 15000  | f     | 100 GiB | f     | 50   |
 * | `enterprise-monthly` | 50000  | f     | 1 TiB   | f     | 25   |
 * | `enterprise-annual`  | 50000  | f     | 1 TiB   | f     | 25   |
 *
 * And on the serving image (`datanika-app-b`, `datanika-celery`):
 * `bytes_quota_enforce=True`, `overage_charge_enable=True`,
 * `paddle_environment=production`. `check_run_quota` raises at
 * `usage >= runs_included` whenever `hard_cap_runs`; `check_bytes_quota`
 * returns at `if not plan.hard_cap_bytes` — **alone**, since core#1071 removed
 * the companion `overage_bytes_price_cents_per_gb` condition — so Pro and
 * Enterprise never reach the enforcement flag at all.
 *
 * ## What went wrong, and why the obvious guard would not have caught it
 *
 * landing#396's option (c) made the four originally-false claims true. It did
 * **not** fix the issue's own point #1: every FAQ answer that enumerates
 * Free's limits named the 10 GB and omitted the 500 runs, so a Free user
 * blocked on runs read the answer and learned nothing. Worse, one answer said
 * *"Runs still exist as a secondary fair-use limit"* — true of four plan rows
 * and **false of the one every visitor starts on** — and it shipped inside the
 * `FAQPage` JSON-LD, i.e. machine-readable.
 *
 * A self-consistency guard goes green on all of that: the page and its
 * structured data agreed with each other perfectly. That is exactly the trap
 * recorded on landing#391 and in `docs/GROWTH_RULES.md` — *binding a claim to
 * what landing believes rather than to what production enforces.*
 *
 * ## Assertion style: PRESENCE, never absence
 *
 * `WORKFLOW_RULES.md` §4: *"a negative assertion banning a phrase is satisfied
 * by the phrase's own denial."* A ban on "fair-use" would be satisfied by a
 * sentence reading *"runs are not merely a fair-use limit on Free"* — which is
 * the corrected copy. So every rule below asserts that the **right** thing is
 * present, and the arming block at the bottom proves each can still go red.
 */

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/** The two enforced Free ceilings, as the copy is entitled to spell them. */
const FREE_VOLUME = /\b10\s*GB\b/i;
const FREE_RUNS = /\b500\b[^.]{0,40}\bruns?\b|\bruns?\b[^.]{0,40}\b500\b/i;

/** Any mention of Free by name. */
const NAMES_FREE = /\bFree\b/;

/**
 * "This sentence is enumerating what Free gives you." Deliberately keyed on the
 * *volume* ceiling rather than on the word Free alone: an answer may mention
 * Free in passing ("upgrade from Free") without listing its limits, and forcing
 * a run count into those would be noise. The moment copy states Free's 10 GB,
 * it has taken on the job of describing Free's ceilings — and then it owes the
 * reader both of them.
 */
function enumeratesFreeLimits(text: string): boolean {
  return NAMES_FREE.test(text) && FREE_VOLUME.test(text);
}

// ---------------------------------------------------------------------------
// 1. Source data — the FAQ, which is also the FAQPage JSON-LD
// ---------------------------------------------------------------------------

describe("Free's two enforced caps are published together (landing#396)", () => {
  it("every FAQ answer stating Free's 10 GB also states its 500-run cap", () => {
    const offenders = pricingFaq
      .filter((f) => enumeratesFreeLimits(f.answer))
      .filter((f) => !FREE_RUNS.test(f.answer))
      .map((f) => f.question);
    expect(offenders).toEqual([]);
  });

  /**
   * The claim that broke. Runs ARE fair-use on the four paid rows; on `free`
   * they hard-block. A surface may say the first only if it says the second.
   */
  it("no FAQ answer calls runs fair-use without naming Free's hard cap", () => {
    const FAIR_USE = /\bfair[- ]use\b|\bsecondary\b[^.]{0,30}\blimit\b/i;
    const offenders = pricingFaq
      .filter((f) => FAIR_USE.test(f.answer))
      .filter((f) => !(NAMES_FREE.test(f.answer) && /hard cap/i.test(f.answer)))
      .map((f) => f.question);
    expect(offenders).toEqual([]);
  });

  it("the answers still fit the 200-character rich-snippet budget", () => {
    const over = pricingFaq
      .filter((f) => f.answer.length > 200)
      .map((f) => `${f.question} (${f.answer.length})`);
    expect(over).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Tier bullets — the two that rendered identically and meant opposites
// ---------------------------------------------------------------------------

describe("the run bullet says which kind of limit it is", () => {
  /** `tiers` is the single source for BOTH the homepage and `/pricing/`. */
  function runBullet(tierName: string): string {
    const t = tiers.find((x) => x.name === tierName);
    if (!t) throw new Error(`No tier named "${tierName}"`);
    const hit = t.features.find((f) => /model runs/i.test(f));
    if (!hit) throw new Error(`Tier "${tierName}" has no model-runs feature`);
    return hit;
  }

  it("Free's run bullet is marked as a hard cap (hard_cap_runs = t)", () => {
    expect(runBullet("Free")).toMatch(/hard cap/i);
  });

  it("Pro's and Enterprise's run bullets are marked fair use (hard_cap_runs = f)", () => {
    expect(runBullet("Pro")).toMatch(/fair use/i);
    expect(runBullet("Enterprise")).toMatch(/fair use/i);
  });

  /**
   * The defect was that the three bullets were *indistinguishable*. Pin the
   * distinction itself, so deleting one parenthetical fails even if the other
   * survives.
   */
  it("Free's run bullet is not phrased like the paid ones", () => {
    expect(runBullet("Free")).not.toMatch(/fair use/i);
    expect(runBullet("Pro")).not.toMatch(/hard cap/i);
    expect(runBullet("Enterprise")).not.toMatch(/hard cap/i);
  });
});

// ---------------------------------------------------------------------------
// 3. The built artifact — what a reader and a crawler actually receive
// ---------------------------------------------------------------------------

/**
 * Read `dist/`, not `src/`, for the same reason `pricing-claims.test.ts` does:
 * an Astro frontmatter comment never reaches a reader, and JSON-LD does. Both
 * `/` and `/pricing/` render `Pricing.astro`, so both carry these bullets.
 */
function builtPages(): { route: string; html: string }[] {
  const out: { route: string; html: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "index.html")
        out.push({
          route: "/" + relative(DIST, full).replace(/\\/g, "/"),
          html: readFileSync(full, "utf-8"),
        });
    }
  };
  walk(DIST);
  return out;
}

describe("the built pages carry the corrected claims", () => {
  it("dist/ exists — run `npm run build` first", () => {
    expect(existsSync(DIST)).toBe(true);
  });

  const ROUTES = ["/index.html", "/pricing/index.html"];

  it("every page rendering the tier table disambiguates the run bullets", () => {
    const pages = builtPages().filter((p) => ROUTES.includes(p.route));
    expect(pages.length).toBe(ROUTES.length);
    for (const { route, html } of pages) {
      expect(html, `${route} must mark Free's runs as a hard cap`).toMatch(
        /500 model runs[^<]*hard cap/i,
      );
      expect(html, `${route} must mark Pro's runs as fair use`).toMatch(
        /15,000 model runs[^<]*fair use/i,
      );
    }
  });

  /**
   * The JSON-LD half. The fair-use sentence was machine-readable, which is what
   * made it worse than a page typo — a rich result can surface it alone, with
   * no tier table beside it to qualify it.
   */
  it("the FAQPage JSON-LD carries no unqualified fair-use claim", () => {
    const pricing = builtPages().find((p) => p.route === "/pricing/index.html");
    expect(pricing).toBeDefined();
    const ld = pricing!.html.match(/"@type":"FAQPage"[\s\S]*?<\/script>/)?.[0] ?? "";
    expect(ld.length).toBeGreaterThan(200);
    if (/fair-use/i.test(ld)) {
      expect(ld, "a fair-use claim in JSON-LD must name Free's hard cap").toMatch(
        /hard cap/i,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Arming — every rule above must be able to go red
// ---------------------------------------------------------------------------

/**
 * `WORKFLOW_RULES.md`: *"a passing check is not evidence until you have seen it
 * fail."* These run the real predicates against the **pre-fix** strings that
 * actually shipped, so the controls carry the shape that motivated the guard
 * rather than a fixture invented alongside it.
 */
describe("arming: the predicates reject the copy that shipped", () => {
  const SHIPPED_BEFORE = {
    freeEnumeration:
      "Yes — Free tier includes 1 seat, 5 connections, 2 schedules, and 10 GB/mo processed (hard-capped). No credit card required.",
    fairUse:
      "No. V2 replaces flat run-based pricing with GB-based volume tiers. Runs still exist as a secondary fair-use limit, but GB is the primary billing dimension.",
    runBullet: "500 model runs / month",
  };

  it("catches a Free enumeration that omits the run cap", () => {
    expect(enumeratesFreeLimits(SHIPPED_BEFORE.freeEnumeration)).toBe(true);
    expect(FREE_RUNS.test(SHIPPED_BEFORE.freeEnumeration)).toBe(false);
  });

  it("catches an unqualified fair-use claim", () => {
    const FAIR_USE = /\bfair[- ]use\b|\bsecondary\b[^.]{0,30}\blimit\b/i;
    expect(FAIR_USE.test(SHIPPED_BEFORE.fairUse)).toBe(true);
    expect(/hard cap/i.test(SHIPPED_BEFORE.fairUse)).toBe(false);
  });

  it("catches an unmarked run bullet", () => {
    expect(/hard cap/i.test(SHIPPED_BEFORE.runBullet)).toBe(false);
    expect(/fair use/i.test(SHIPPED_BEFORE.runBullet)).toBe(false);
  });

  /**
   * The other direction, which is the half people skip: a predicate narrowed
   * until it stops matching real failures is worse than the bug it replaced.
   * These prove the matchers still fire on correct copy.
   */
  it("accepts the corrected copy", () => {
    const fixed =
      "Free is hard-capped on both dimensions — 10 GB and 500 model runs.";
    expect(enumeratesFreeLimits(fixed)).toBe(true);
    expect(FREE_RUNS.test(fixed)).toBe(true);
  });
});
