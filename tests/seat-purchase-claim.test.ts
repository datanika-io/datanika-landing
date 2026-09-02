import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative } from "path";

/**
 * The pricing page may not describe a seat purchase the product cannot complete.
 *
 * ## What was wrong
 *
 * `/pricing/` and the homepage sold *"Extra seats at $25/mo each."* The **price**
 * is right — `plans.extra_seat_price_cents` is 2500 on both Enterprise rows,
 * measured off prod 2026-09-02T09:31Z. The **purchase** is what does not exist:
 * `BillingService.check_seat_quota` raises `QuotaExceededError` at
 * `len(memberships) >= seats_included` and never bills, and `seats_included`
 * lives on the *plan*, shared by every subscriber on it — so there is no action
 * a buyer can take that raises their own seat count. The sentence described a
 * self-serve checkout that exists in no form. (landing#368)
 *
 * Whether we build seat billing or stop selling seats is Product's call. This
 * guard only holds the interim: while no self-serve path exists, a published
 * per-seat price must name the channel that a human can actually complete.
 *
 * ## 🔑 Why this reads `dist/` and not `src/`
 *
 * A `grep` of `src/data/` for the seat claim found **one** call site. A `grep` of
 * `dist/` found **three pages**, because `/features/volume-pricing/` keeps a
 * hand-maintained second copy of the tier table and spells the same claim
 * `+$25/seat` instead of `Extra seats at $25/mo each`.
 *
 * That is landing#443's connector-count lesson arriving by a different route: a
 * guard bound to one source file, or to one spelling, is blind by construction to
 * every call site that phrases it differently. `dist/` is where the claim is
 * actually published, so `dist/` is what gets quantified over.
 *
 * ⚠️ Requires a build. `npm run build` runs before `vitest` in CI's `build` job;
 * if `dist/` is absent the suite fails loudly rather than passing vacuously.
 */

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/**
 * `dist/blog/` is excluded, and the first run is why. Six hits came back and all
 * six were **competitors' seat prices** quoted in comparison posts — dbt Cloud at
 * `$100/seat/month`, a 5-seat Fivetran Starter team at `$500/mo`, Airbyte's
 * `$10/month`. §4.3's sibling rule already draws this line: a guard on how we
 * describe *our own* commercial terms must not fire on someone else's, or it
 * becomes a tax people silence.
 *
 * Our seat offer is published by the pricing surfaces, and `MUST_CARRY` below
 * asserts they still carry it — so excluding the blog narrows the scan without
 * letting the claim disappear unnoticed.
 */
const SKIP = /^dist[\\/]blog[\\/]/;

/**
 * A published per-seat price, in any spelling we have shipped or might ship:
 * `$25/mo each` beside the word "seats", `+$25/seat`, `$25 per seat`.
 * Deliberately matches the PRICE, not the sentence — a new spelling of the
 * sentence is exactly what this is meant to catch.
 */
const SEAT_PRICE = /\$\s?\d+(?:\.\d+)?\s*(?:\/\s*seat|per\s+seat|\/\s*mo(?:nth)?\b|per\s+mo(?:nth)?\b)/gi;

/** The claim only counts when a seat is what is being priced. */
const SEAT_WORD = /\bseats?\b/i;

/**
 * How close "seat" must sit to the price. A plan price and the word "seats" share
 * a paragraph on every pricing page ever written — `$79/mo` two sentences from
 * "5 team members, seats" is not a seat price. 35 characters is the distance at
 * which the two are one phrase.
 */
const SEAT_PROXIMITY = 35;

/**
 * The surfaces that render `src/data/pricing-tiers.ts`. If the claim vanishes
 * from one of these, the qualifier assertion below goes vacuously green — this is
 * the control that stops that, and it is stronger than counting pages.
 */
const MUST_CARRY = ["dist/index.html", "dist/pricing/index.html"];

/**
 * The channel a human can complete today. Enterprise's CTA is already
 * `mailto:info@datanika.io`, so this is not a new promise — it is the one the
 * tier already makes.
 */
const CONTACT_QUALIFIER = /\bcontact us\b/i;

/** How much rendered text around the price counts as "the same claim". */
const WINDOW = 120;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (extname(full) === ".html") out.push(full);
  }
  return out;
}

/** Rendered text, so a tag boundary cannot hide the qualifier from the window. */
function toText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#36;/g, "$")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

interface Hit {
  page: string;
  price: string;
  window: string;
  qualified: boolean;
}

let PAGES: string[] = [];
let HITS: Hit[] = [];

beforeAll(() => {
  expect(
    existsSync(DIST),
    "dist/ is missing — run `npm run build` first. This guard reads what ships, " +
      "not what the source says, so it cannot run without a build.",
  ).toBe(true);

  PAGES = walk(DIST);

  for (const file of PAGES) {
    const page = relative(ROOT, file).replace(/\\/g, "/");
    if (SKIP.test(relative(ROOT, file))) continue;
    const text = toText(readFileSync(file, "utf-8"));
    for (const m of text.matchAll(SEAT_PRICE)) {
      const at = m.index ?? 0;
      const near = text.slice(
        Math.max(0, at - SEAT_PROXIMITY),
        at + m[0].length + SEAT_PROXIMITY,
      );
      if (!SEAT_WORD.test(near)) continue; // a $79/mo plan price is not a seat price
      const win = text.slice(Math.max(0, at - WINDOW), at + m[0].length + WINDOW);
      HITS.push({
        page,
        price: m[0].trim(),
        window: win.trim(),
        qualified: CONTACT_QUALIFIER.test(win),
      });
    }
  }
});

describe("a published per-seat price names a channel we can complete (landing#368)", () => {
  it("walks a non-trivial number of built pages (positive control)", () => {
    // A walk that reads nothing passes every assertion below it.
    expect(PAGES.length).toBeGreaterThan(100);
  });

  it("the pricing surfaces still carry the seat claim (vacuity control)", () => {
    // If the claim disappears from the pages that render `pricing-tiers.ts`, the
    // qualifier assertion below becomes vacuously true — and a guard that is
    // green because it found nothing is the failure mode this project keeps
    // paying for. Naming the pages is stronger than counting them: a count of 2
    // is satisfied by any two pages, including two that are not ours.
    const pages = new Set(HITS.map((h) => h.page));
    const missing = MUST_CARRY.filter((p) => !pages.has(p));
    expect(
      missing,
      `These pages render src/data/pricing-tiers.ts and no longer publish a ` +
        `per-seat price: ${missing.join(", ")}. Found on: ${[...pages].join(", ") || "(nothing)"}. ` +
        `If seats were deliberately removed from the pricing copy, delete this ` +
        `guard in the same PR rather than editing this list.`,
    ).toEqual([]);
  });

  it("every published per-seat price says how to buy one", () => {
    const bare = HITS.filter((h) => !h.qualified);
    expect(
      bare,
      `A per-seat price is published with no way to act on it. \`check_seat_quota\` ` +
        `raises rather than bills and \`seats_included\` is on the plan, so there is ` +
        `no self-serve path — the copy must name the contact channel until Product ` +
        `builds one (landing#368):\n` +
        bare.map((h) => `  ${h.page}: "${h.price}" in "...${h.window}..."`).join("\n"),
    ).toEqual([]);
  });
});
