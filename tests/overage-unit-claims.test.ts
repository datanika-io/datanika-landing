import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, sep } from "path";

/**
 * Guardrail: no published route prices overage **per run**, and every route that
 * publishes the overage formula states the **rounding** (landing#410).
 *
 * ## What was wrong
 *
 * V2 bills bytes. Overage is computed **once per billing cycle on the summed
 * quantity**, then converted to whole GB by rounding up. From the biller itself,
 * `datanika-cloud/datanika_cloud/billing/tasks.py` (verified on `origin/dev`):
 *
 *   `_group_by_cycle()` — "bytes_processed writes one row per run
 *   (source_run_id set), so a cycle can accumulate many rows; overage — and
 *   therefore the charge/notice — is computed once per group on the summed
 *   quantity (cloud#76), **never per row**."
 *
 *   `_overage_price_cents()` — `gb = -(-overage_quantity // (1024**3))  # ceildiv`
 *
 * Five rendered surfaces said "overage per run" anyway — two on
 * `/features/volume-pricing`, two on `/why-cheaper`, one in the blog post whose
 * whole subject is the V2 math. **There is no per-run overage charge**, and the
 * phrasing is a direct echo of V1's real `$0.01/run` rate, which is precisely
 * the confusion the V2 cutover exists to remove.
 *
 * The concrete harm was `$0.40`: 0.8 GB × $0.50 is arithmetically right and is
 * **not a charge that can occur**, because the minimum non-zero overage is one
 * whole GB — $0.50. The monthly figures ($45 / $12) and the 3.75× headline are
 * correct, because 30 × 3 GB and 30 × 0.8 GB are whole numbers and the ceil
 * lands once at cycle level. So the defect was the *unit*, not the numbers, and
 * no number was changed to fix it.
 *
 * ## 🚨 Why `software-application.test.ts` did not catch this
 *
 * It already asserts *"no offer prices an overage per run — V2 bills bytes"* —
 * and it was **green through all five**, because it inspects `PLAN_OFFERS`, the
 * structured data, and nothing else. `docs/GROWTH_RULES.md`, verbatim: *"A guard
 * that names a file goes blind when the claim changes file."* That test is not
 * wrong; its scope is one artifact. This one reads `dist/` — every built route —
 * for the same claim.
 *
 * ## Why `dist/`, not `src/`
 *
 * Same reason as `byte-pricing-surface-inventory.test.ts`: the claim is what a
 * *reader* is told, and source→route is not one-to-one. A `//` comment renders
 * nowhere; `Pricing.astro` renders on two routes.
 *
 * ## The allowlist is for HISTORY, and it is narrow
 *
 * Two posts quote V1's `$0.01/run` as the thing we **replaced** — a migration
 * write-up and the V1-vs-V2 comparison table. Those must stay quotable: banning
 * the string outright would forbid describing our own pricing history. So the
 * *rate* pattern is allowlisted on exactly those two routes, while the
 * *phrase* ("overage per run") is banned everywhere, including there — no post
 * needs it to describe V1, which had a genuine per-run rate to name directly.
 */

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/**
 * "$0.01/run", "$1.50 per run" — a price whose denominator is a run.
 * V1 had exactly this and V2 has nothing like it.
 */
const PER_RUN_RATE = /\$\s?[\d.,]+\s*(?:\/|\s+per\s+)\s*run\b/i;

/**
 * The phrase, independent of any number. Banned on every route with no
 * exception: V1 can be described as "$0.01 per run", which the rate pattern
 * covers under the allowlist, so nothing legitimate needs this wording.
 */
const PER_RUN_PHRASE = /overage\s+per\s+run|per[-\s]run\s+overage/i;

/**
 * Routes permitted to quote a per-run RATE, because they are describing V1 as
 * history. Both render it inside an explicit before/after comparison.
 */
const HISTORICAL_V1_ROUTES = new Set([
  "/blog/billing-provider-migration",
  "/blog/pricing-v2-math-and-why",
]);

/**
 * Routes that publish the overage formula and must therefore state the
 * rounding. `/terms` is here because it is a **legal** page: it described V1
 * "model run overages" for four months after the V2 cutover (landing#410), and
 * legal-page drift is the class that went six weeks undetected in landing#343.
 *
 * This doubles as the control required by `docs/GROWTH_RULES.md` — "pin a
 * control sentence beside every count-is-zero sweep" — so a page that goes
 * silent fails here rather than quietly passing the zero-count assertions above.
 */
const FORMULA_ROUTES = ["/terms", "/features/volume-pricing", "/why-cheaper"];

const ROUNDING = /round(?:ed|s|ing)?\s+up|next whole GB|\bceil\b/i;

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
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ");
        out.push({ route, text });
      }
    }
  };
  walk(DIST);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

describe("overage is billed per GB per cycle, never per run (landing#410)", () => {
  // Hard-fail rather than skip: a harness that quietly does nothing when its
  // input is missing is the failure mode this repo keeps re-learning.
  it("has a built site to read", () => {
    expect(
      existsSync(DIST),
      "dist/ is absent — run `npm run build` first. This test reads the built " +
        "artifact on purpose; it must not silently pass without one.",
    ).toBe(true);
  });

  it("no route uses the phrase 'overage per run'", () => {
    const offenders = builtRoutes()
      .filter(({ text }) => PER_RUN_PHRASE.test(text))
      .map(({ route, text }) => {
        const m = text.match(
          new RegExp(`.{0,70}(?:${PER_RUN_PHRASE.source}).{0,70}`, "i"),
        );
        return `  ${route}\n      …${m ? m[0].trim() : ""}…`;
      });

    expect(
      offenders,
      "Overage is computed once per billing cycle on the cycle's summed bytes " +
        "(datanika-cloud billing/tasks.py `_group_by_cycle`), never per run. " +
        "Quote the rate as $/GB and the cost as a monthly total:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("only the two historical V1 posts quote a per-run RATE", () => {
    const offenders = builtRoutes()
      .filter(({ route, text }) => PER_RUN_RATE.test(text) && !HISTORICAL_V1_ROUTES.has(route))
      .map(({ route, text }) => {
        const m = text.match(
          new RegExp(`.{0,70}(?:${PER_RUN_RATE.source}).{0,70}`, "i"),
        );
        return `  ${route}\n      …${m ? m[0].trim() : ""}…`;
      });

    expect(
      offenders,
      "V1's $0.01/run overage was replaced outright by per-GB overage on " +
        "2026-04-20. Only a post explicitly describing V1 as history may quote " +
        "a per-run rate; add it to HISTORICAL_V1_ROUTES with a reason if so:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("the allowlist has not gone stale — each historical route still quotes V1", () => {
    // An exemption nobody re-checks becomes a hole. If a post stops quoting the
    // V1 rate, its exemption must go, or it silently licenses a future defect.
    const routes = builtRoutes();
    for (const allowed of HISTORICAL_V1_ROUTES) {
      const page = routes.find((r) => r.route === allowed);
      expect(page, `Allowlisted route ${allowed} is not in dist/ — drop it.`).toBeDefined();
      expect(
        PER_RUN_RATE.test(page!.text),
        `${allowed} no longer quotes a per-run rate, so its exemption is dead ` +
          "weight. Remove it from HISTORICAL_V1_ROUTES.",
      ).toBe(true);
    }
  });

  it("every route publishing the overage formula states the rounding", () => {
    const routes = builtRoutes();
    const missing: string[] = [];
    for (const want of FORMULA_ROUTES) {
      const page = routes.find((r) => r.route === want);
      if (!page) {
        missing.push(`  ${want} — ABSENT from dist/ (route renamed or deleted?)`);
        continue;
      }
      if (!ROUNDING.test(page.text)) missing.push(`  ${want} — no rounding stated`);
    }

    expect(
      missing,
      "The biller ceils overage to whole GB — `-(-overage_quantity // 1024**3)`. " +
        "A published formula that omits it understates a real charge: 0.8 GB of " +
        "overage bills as 1 GB. State the round-up wherever the formula is " +
        "published:\n" +
        missing.join("\n"),
    ).toEqual([]);
  });

  it("no route defines a GB as a decimal billion bytes — we bill in binary GB", () => {
    // The biller divides by 1024**3 (1,073,741,824). The FAQ said "1 billion
    // bytes". Every consequence ran in the customer's favour — a bigger
    // allowance and a lower price per byte — so it was not mis-selling, but a
    // published definition contradicting the biller is a defect either way.
    const offenders = builtRoutes()
      .filter(({ text }) => /a GB is 1 billion bytes|GB is one billion bytes/i.test(text))
      .map(({ route }) => `  ${route}`);

    expect(
      offenders,
      "We meter in binary GB (1,073,741,824 bytes). Correct the definition, " +
        "not the billing unit — the allowances and the $0.39/GB on the " +
        "/compare/* pages are all derived from 1024:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });
});
