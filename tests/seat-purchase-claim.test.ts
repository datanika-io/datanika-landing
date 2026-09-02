import { describe, it, expect, beforeAll } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, extname, relative } from "path";

/**
 * We do not publish a per-seat price, because there is nothing behind one.
 *
 * ## The two wrong answers this guard exists to keep out
 *
 * 1. **"Extra seats at $25/mo each"** — live until 2026-09-02. The *price* was
 *    right (`plans.extra_seat_price_cents` = 2500 on both Enterprise rows,
 *    measured off prod 2026-09-02T09:31Z); the *purchase* existed in no form.
 *    `check_seat_quota` raises `QuotaExceededError` at
 *    `len(memberships) >= seats_included` and never bills.
 * 2. 🚨 **"Additional seats $25/mo each — contact us to add them"** — my own
 *    replacement, and **also untrue**. `seats_included` is a **plan** column,
 *    shared by every org on that slug, and `Subscription` has no allowance column
 *    at all — the billing page's `sub.seats_included` is a view-model field
 *    filled from the plan, which is exactly what makes it look like one. So there
 *    is **no operator action** behind a contact request either: we cannot give one
 *    customer a bespoke seat count without a custom plan row. (cloud#150)
 *
 * The second is the more instructive failure. It is the shape you reach for when
 * a claim is unfulfillable — *route it to a human* — and it fails **less
 * visibly** than the first: nobody discovers it until a real buyer asks and the
 * founder has nothing to do. A promise routed to a human is still a promise.
 *
 * ## Why seats are not simply "not billed yet"
 *
 * Product's decision on landing#396: seats should **not** become a metered
 * dimension. Every billed dimension here has five parts — `*_included`,
 * `hard_cap_*`, `overage_*_price`, a `METERED_METRICS` entry and a `meter.py`
 * call site — and seats have two. More decisively, runs and bytes *accrue* and
 * are only knowable afterwards, while a seat changes discretely by a deliberate
 * act, and Paddle already models that as an item quantity. Billing seats as
 * overage would mean you invite a colleague and learn the price at cycle end —
 * the exact "surprise mid-cycle" shape our own pricing FAQ promises we avoid.
 *
 * So this guard is not a placeholder awaiting a feature. Publishing a per-seat
 * price is the thing we decided against.
 *
 * ## 🔑 Why it reads `dist/` and not `src/`
 *
 * A `grep` of `src/data/` for the seat claim found **one** call site. A `grep` of
 * `dist/` found **three pages**: `/features/volume-pricing/` keeps a
 * hand-maintained second copy of the tier table and spelled it `+$25/seat`.
 * Landing#443's connector-count lesson by a different route — there a guard
 * matched a literal digit against a template expression, here one phrasing
 * against two. Quantify over built output and over the **price**, never the
 * sentence.
 *
 * ⚠️ Requires a build. `npm run build` runs before `vitest` in CI's `build` job;
 * if `dist/` is absent this fails loudly rather than passing vacuously.
 */

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/**
 * `dist/blog/` is excluded, and the first run of the earlier version is why: six
 * hits came back and all six were **competitors'** seat prices in comparison
 * posts — dbt Cloud at `$100/seat/month`, a 5-seat Fivetran Starter team at
 * `$500/mo`, Airbyte's `$10/month`. A rule about how we describe *our own*
 * commercial terms must not fire on someone else's, or it becomes a tax people
 * silence. `MUST_READ` below keeps the narrowing honest.
 */
const SKIP = /^dist[\\/]blog[\\/]/;

/** A per-seat price in any spelling we have shipped: `$25/seat`, `$25 per seat`, `$25/mo` beside "seats". */
const SEAT_PRICE = /\$\s?\d+(?:\.\d+)?\s*(?:\/\s*seat|per\s+seat|\/\s*mo(?:nth)?\b|per\s+mo(?:nth)?\b)/gi;

/** The claim only counts when a seat is what is being priced. */
const SEAT_WORD = /\bseats?\b/i;

/**
 * How close "seat" must sit to the price. A plan price and the word "seats" share
 * a paragraph on every pricing page ever written — `$79/mo` two sentences from
 * "5 team members" is not a seat price. 35 characters is the distance at which
 * the two are one phrase.
 */
const SEAT_PROXIMITY = 35;

/**
 * 🚨 The control for a count-is-zero sweep (`docs/GROWTH_RULES.md`).
 *
 * This test's main assertion is "no hits", which is satisfied just as well by a
 * walk that reads nothing, a `dist/` built from a broken source, or a regex that
 * matches nothing anywhere. These two pages MUST be read and MUST still contain
 * the tier copy — so the sweep is demonstrably looking at the documents where a
 * seat price would appear if anyone re-added one.
 */
const MUST_READ: { page: string; contains: string }[] = [
  { page: "dist/pricing/index.html", contains: "10 team members included" },
  { page: "dist/index.html", contains: "10 team members included" },
  { page: "dist/features/volume-pricing/index.html", contains: "10 team members included" },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (extname(full) === ".html") out.push(full);
  }
  return out;
}

/** Rendered text, so a tag boundary cannot hide a price from the matcher. */
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
}

let PAGES: string[] = [];
let SCANNED: string[] = [];
let HITS: Hit[] = [];
let TEXT = new Map<string, string>();

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
    SCANNED.push(page);
    const text = toText(readFileSync(file, "utf-8"));
    TEXT.set(page, text);
    for (const m of text.matchAll(SEAT_PRICE)) {
      const at = m.index ?? 0;
      const near = text.slice(Math.max(0, at - SEAT_PROXIMITY), at + m[0].length + SEAT_PROXIMITY);
      if (!SEAT_WORD.test(near)) continue; // a $79/mo plan price is not a seat price
      HITS.push({
        page,
        price: m[0].trim(),
        window: text.slice(Math.max(0, at - 120), at + m[0].length + 120).trim(),
      });
    }
  }
});

describe("no per-seat price is published — there is no purchase behind one (landing#396)", () => {
  it("walks a non-trivial number of built pages (positive control)", () => {
    expect(PAGES.length).toBeGreaterThan(100);
  });

  it("actually reads the pages a seat price would appear on (control)", () => {
    const broken = MUST_READ.filter(
      (m) => !TEXT.has(m.page) || !TEXT.get(m.page)!.includes(m.contains),
    );
    expect(
      broken,
      `A "zero hits" assertion is worthless if the sweep never read the pricing ` +
        `pages. These were not read, or no longer carry the tier copy this test ` +
        `keys on: ${JSON.stringify(broken)}. If the copy was reworded, update ` +
        `\`contains\` — do not delete the control.`,
    ).toEqual([]);
  });

  it("publishes no per-seat price anywhere on our own pages", () => {
    expect(
      HITS,
      `A per-seat price is published, and nothing can fulfil it. \`check_seat_quota\` ` +
        `raises rather than bills, and \`seats_included\` is a PLAN column shared by ` +
        `every org on the slug — so "contact us" is not a fix either, there is no ` +
        `operator action behind it (cloud#150). Seats are deliberately not a metered ` +
        `dimension (landing#396). Remove the price:\n` +
        HITS.map((h) => `  ${h.page}: "${h.price}" in "...${h.window}..."`).join("\n"),
    ).toEqual([]);
  });
});
