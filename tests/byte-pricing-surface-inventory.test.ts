import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, sep } from "path";

/**
 * Guardrail: the V2 bytes-pricing surface — **which routes publish our byte
 * terms, and whether the terms they publish are the ones the product enforces**
 * (landing#403, landing#396, core#713).
 *
 * ## What changed on 2026-09-01, and why this file was rewritten
 *
 * The first version of this guard was an inventory of eighteen built routes,
 * selected by a hand-written list of twelve exact strings (`"$0.50/GB"`,
 * `"includes 100 GB"`, …). It caught the thing it was written for. It also
 * carried, one level down, **the exact defect it exists to prevent**: the
 * *scope* was a list somebody maintains. A route quoting our terms in any
 * spelling that was not one of the twelve was invisible to it — and two were:
 *
 *   - `/blog/postgresql-to-bigquery` — *"Datanika's Free plan includes 10 GB of
 *     processed volume per month … Pro ($79/mo) raises that to 100 GB and
 *     15,000 runs."* The literal is `includes 10 GB of processed volume`; the
 *     list had `includes 100 GB` and `10 GB/mo`, neither of which matches. This
 *     post is **syndicated to dev.to**, so the miss had already left the site.
 *   - `/docs/connectors/sqlite` — matched on the widened pattern and is a false
 *     positive, allowed below with its reason. Recorded because a guard that
 *     cries wolf gets deleted rather than fixed.
 *
 * `docs/GROWTH_RULES.md`, which the first version quoted at itself and then did
 * not apply: *"A guard's scope should be derived from the artifact, never listed
 * by hand. Ask what makes the members of your set members, and test for that."*
 *
 * **What makes a route a member:** it prints money per byte-unit, or it prints
 * one of the product's three volume allowances in an allowance context. Both are
 * now derived — the rates and the allowance labels are **computed from
 * `PRODUCT`** below, and the route set is computed from `dist/`.
 *
 * ## The rule this file is built around
 *
 * From `docs/GROWTH_RULES.md`, earned three times (`overage-unit-claims`
 * blind to `model run overages`; `legal-pages-facts` with its two-page map;
 * the burst-column ban walked past by a sentence printing the value):
 *
 *   **"must state X" is an exact computed substring; "must NOT print X" is a
 *   broad pattern.**
 *
 * So the two directions use two different instruments, deliberately:
 *
 *   - The **inventory and the ban** (`RATE_SHAPE`, `VOLUME`) are shape patterns.
 *     They match any spelling of a per-byte rate or a byte allowance, including
 *     ones nobody has written yet.
 *   - The **must-state** assertions are exact substrings *computed* from
 *     `PRODUCT` — never typed. A tier edit fails loudly instead of leaving a
 *     stale-but-present number green.
 *
 * ## 🚨 What this file does and does not know
 *
 * It reads `PRODUCT` from a constant, and a constant in this repo cannot see the
 * production database. What binds it to the enforcing artifact is
 * `.github/workflows/pricing-catalogue-parity.yml` — a **daily cron**, not a
 * required check, because the thing that breaks us lives in `datanika-core` and
 * a PR-time check in `datanika-landing` could never see it (`GROWTH_RULES`: *"A
 * cron beats a PR check when the thing that breaks you lives in another
 * repo."*). That job reads core's seed migration at `master` and files an issue
 * when it and `PRODUCT` disagree.
 *
 * It still does **not** know whether a claim is *charged*. `bytes_quota_enforce`
 * and `overage_charge_enable` are environment variables on the production box,
 * both defaulting `False` in `datanika_cloud/billing/config.py`, and CI cannot
 * read them. Green here means *the page agrees with the plan catalogue*, never
 * *the customer is billed this*.
 */

/* ------------------------------------------------------------------ *
 * PRODUCT — the plan catalogue, in the biller's own units.
 *
 * Transcribed from the two artifacts that enforce it, both on the SHA that is
 * deployed:
 *
 *   datanika-core@master
 *     datanika/migrations/versions/c1d2e3f4a5b6_seed_plan_byte_allotments.py
 *     `_CATALOGUE` — free 10*1024**3 / pro-monthly+annual 100*1024**3 @ 50c /
 *     enterprise-monthly+annual 1024**4 @ 25c, and
 *     `UPDATE plans SET hard_cap_runs = false` for all four paid slugs.
 *
 *   datanika-cloud@master
 *     datanika_cloud/billing/tasks.py:178
 *     `gb = -(-overage_quantity // (1024**3))  # ceildiv`
 *     — the biller's "GB" is 2^30 bytes. This is why the effective Enterprise
 *     rate is 399/1024 = $0.39 and not 399/1000 = $0.40; publishing $0.40 was a
 *     real defect once (GROWTH_RULES, "check the denominator against the
 *     biller").
 *
 * Reached production in `deploy-pointer.yml` on core `master b1a5fc25`,
 * 2026-08-31T15:15:55Z, conclusion `success`.
 *
 * ⚠️ Do NOT "tidy" these to decimal GB. 100 GB here is 107,374,182,400 bytes
 * because that is the number `check_bytes_quota` compares against.
 * ------------------------------------------------------------------ */
const GIB = 1024 ** 3;
const TIB = 1024 ** 4;

interface PlanFacts {
  /** `plans.bytes_included` */
  bytesIncluded: number;
  /** `plans.overage_bytes_price_cents_per_gb`; null = no overage (hard cap) */
  overageCentsPerGib: number | null;
  /** `plans.hard_cap_bytes` */
  hardCapBytes: boolean;
  /** `plans.hard_cap_runs` — false means `check_run_quota` returns immediately */
  hardCapRuns: boolean;
  /** `plans.runs_included` */
  runsIncluded: number;
  /** list price in cents/month, 0 for Free; used for the effective per-GB rate */
  baseCentsPerMonth: number;
}

const PRODUCT: Record<"Free" | "Pro" | "Enterprise", PlanFacts> = {
  Free: {
    bytesIncluded: 10 * GIB,
    overageCentsPerGib: null,
    hardCapBytes: true,
    hardCapRuns: true,
    runsIncluded: 500,
    baseCentsPerMonth: 0,
  },
  Pro: {
    bytesIncluded: 100 * GIB,
    overageCentsPerGib: 50,
    hardCapBytes: false,
    hardCapRuns: false,
    runsIncluded: 15_000,
    baseCentsPerMonth: 7_900,
  },
  Enterprise: {
    bytesIncluded: TIB,
    overageCentsPerGib: 25,
    hardCapBytes: false,
    hardCapRuns: false,
    runsIncluded: 50_000,
    baseCentsPerMonth: 39_900,
  },
};

/* ---------- every rendered spelling below is COMPUTED, never typed ---------- */

/** `10 * GIB` -> `"10 GB"`, `TIB` -> `"1 TB"` — the label a reader sees. */
function volumeLabel(bytes: number): string {
  return bytes % TIB === 0 ? `${bytes / TIB} TB` : `${bytes / GIB} GB`;
}

/** `50` -> `"$0.50"`. Two decimals, because that is how the site renders money. */
function money(cents: number): string {
  return "$" + (cents / 100).toFixed(2);
}

/**
 * The *effective* per-GB price of a plan's included volume — what the
 * `/compare/*` tables publish in the `datanikaPerGB` column. Enterprise is the
 * reason this is a function and not two more literals: 39900 / 1024 = 38.96,
 * and the digit that comes out of that division is the whole finding.
 */
function effectiveRate(p: PlanFacts): string {
  return money(Math.round(p.baseCentsPerMonth / (p.bytesIncluded / GIB)));
}

const PLANS = Object.entries(PRODUCT) as [keyof typeof PRODUCT, PlanFacts][];

/** `[10 * GIB, 100 * GIB, TIB]` */
const ALLOWANCE_BYTES = PLANS.map(([, p]) => p.bytesIncluded);
/** `["10 GB", "100 GB", "1 TB"]` */
const ALLOWANCE_LABELS = ALLOWANCE_BYTES.map(volumeLabel);
/** `["$0.50", "$0.25", "$0.79", "$0.39"]` — overage rates plus effective rates. */
const OUR_RATES = new Set<string>([
  ...PLANS.filter(([, p]) => p.overageCentsPerGib !== null).map(([, p]) =>
    money(p.overageCentsPerGib as number),
  ),
  ...PLANS.filter(([, p]) => p.baseCentsPerMonth > 0).map(([, p]) => effectiveRate(p)),
]);

/* ------------------------------------------------------------------ *
 * The shape patterns. These are the "must NOT print" half, so they are
 * deliberately broad — they must match spellings nobody has written yet.
 * ------------------------------------------------------------------ */

/**
 * Money per byte-unit, in any spelling. Group 1 is the approximation marker,
 * which is what separates a competitor estimate from a claim about us: every
 * competitor figure on every `/compare/*` page is rendered `~$NN / GB`, and none
 * of ours ever is. That is an intrinsic property of the copy, not a list.
 */
const RATE_SHAPE =
  /(~\s*|about\s+|approx\.?\s*|roughly\s+|around\s+)?\$\s*([0-9]+(?:\.[0-9]+)?)\s*(?:\/|\s+per\s+)\s*(?:GB|GiB|TB|TiB)\b/gi;

/** Any byte volume, in any spelling. Narrowed to *our* allowances numerically. */
const VOLUME = /\b([0-9][0-9.,]*)\s*(GB|GiB|TB|TiB)\b/gi;

/**
 * Words that turn a byte volume into an *allowance claim* rather than a size.
 * Broad on purpose; the false positives it produces are allowed by name below,
 * with reasons, which is cheaper than a pattern nobody can predict the reach of.
 */
const ALLOWANCE_CONTEXT =
  /includ|processed|allowance|caps?\b|capped|quota|\/\s*mo\b|\/\s*month\b|per month|free tier|Free plan/i;

/** How far either side of a volume we look for that context. */
const CONTEXT_CHARS = 70;

/**
 * The marker that unlocks the historical carve-out below. An exact date format,
 * deliberately: this is the one place where a *ban* is escaped, and an escape
 * hatch has to be a "must state" — a broad pattern here would let any hedge
 * ("this may be out of date") reopen the hole the ban exists to close.
 */
const DATED_CORRECTION = /Corrected\s+20[0-9]{2}-[0-9]{2}-[0-9]{2}/;

/**
 * Routes whose byte volume is one of ours but is not a pricing claim.
 *
 * Required by `GROWTH_RULES` ("keep an ALLOWED list with reasons, and test that
 * no exemption has gone stale") and by the false-positive rule beside it: a
 * guard that flags correct copy gets deleted rather than fixed, so the
 * false-positive rate is a correctness property. One in 162 routes, named.
 */
const ALLOWED_NON_CLAIMS: { route: string; because: RegExp; reason: string }[] = [
  {
    route: "/docs/connectors/sqlite",
    because: /no hard cap on SQLite file size/i,
    reason:
      "Size guidance for a source file, not a plan allowance. It matches only " +
      "because 'hard cap' and '~10 GB' sit in the same sentence — the same " +
      "adjacency family as the /trust 'c-overage' false positive in " +
      "GROWTH_RULES. Nothing here is a commercial claim.",
  },
];

/* ------------------------------------------------------------------ *
 * The inventory. Membership is DERIVED (above); these three lists are the
 * checklist — they say which bucket a member belongs to, so that a partial
 * #396 sweep fails naming exactly what it missed.
 * ------------------------------------------------------------------ */

/** The three routes #396 names. Kept separate: the finding is the difference. */
const INVENTORIED_BY_396 = ["/", "/pricing", "/features/volume-pricing"];

/**
 * Evergreen commercial pages asserting the terms in the present tense, which
 * #396 does not name. `/why-cheaper` is the sharpest: it does not state the
 * rate, it computes a personalised dollar figure from it.
 */
const EVERGREEN_UNINVENTORIED = [
  "/compare/airbyte",
  "/compare/fivetran",
  "/compare/hevo",
  "/compare/stitch",
  "/why-cheaper",
];

/**
 * Dated blog posts. A weaker claim than an evergreen commercial page, but
 * inventoried rather than ignored, because "we did not know it was there" is
 * the failure being fixed.
 *
 * 🚨 `plans/growth/scripts/devto_crosspost.py` parses this array by name as its
 * gate 2 — a post here is withheld from syndication. Renaming the constant
 * silently un-gates the lot. `/blog/postgresql-to-bigquery` was added
 * 2026-09-01 and **is already live on dev.to** (article 4539606); gate 2 stops
 * the next batch, not the last one.
 *
 * `/blog/billing-provider-migration` entered this list on 2026-09-01 for a
 * reason worth keeping: the **dated correction added to it in the same commit**
 * is what put it in scope. Its V1 table never quoted a per-GB rate; the note
 * explaining what V2 does instead quotes all three. Correcting a page can
 * enlarge the surface — the guard said so within a minute of the edit, which is
 * the whole argument for deriving scope from the artifact rather than editing a
 * list by hand and believing it.
 */
const DATED_POSTS = [
  "/blog/billing-provider-migration",
  "/blog/claude-built-a-data-pipeline",
  "/blog/datanika-mcp-server-launch",
  "/blog/datanika-vs-modern-data-stack",
  "/blog/dlt-arrow-5x-faster-pipeline",
  "/blog/mcp-write-tools-consent-scope",
  "/blog/postgresql-to-bigquery",
  "/blog/pricing-v2-math-and-why",
  "/blog/self-hosting-datanika-docker-compose",
  "/blog/sso-saml-oidc-enterprise",
  "/blog/stripe-revenue-dashboard-dbt",
  "/blog/why-we-built-datanika",
];

const INVENTORY = [...INVENTORIED_BY_396, ...EVERGREEN_UNINVENTORIED, ...DATED_POSTS].sort();

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

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
          .replace(/&nbsp;|&#160;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ");
        out.push({ route, text });
      }
    }
  };
  walk(DIST);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/** Non-approximate money-per-byte-unit figures on a page, as `"$0.50"`. */
function ourRateHits(text: string): string[] {
  return [...text.matchAll(RATE_SHAPE)]
    .filter((m) => !m[1])
    .map((m) => money(Math.round(parseFloat(m[2]) * 100)));
}

/** Approximation-marked money-per-byte-unit figures, as `"$20.00"`. */
function approxRateHits(text: string): string[] {
  return [...text.matchAll(RATE_SHAPE)]
    .filter((m) => m[1])
    .map((m) => money(Math.round(parseFloat(m[2]) * 100)));
}

/** Product allowance volumes rendered in an allowance context, as `"10 GB"`. */
function allowanceHits(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(VOLUME)) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    const bytes = m[2].toLowerCase().startsWith("t") ? n * TIB : n * GIB;
    if (!ALLOWANCE_BYTES.includes(bytes)) continue;
    const i = m.index ?? 0;
    const window = text.slice(Math.max(0, i - CONTEXT_CHARS), i + m[0].length + CONTEXT_CHARS);
    if (ALLOWANCE_CONTEXT.test(window)) out.push(volumeLabel(bytes));
  }
  return out;
}

function inScope(r: { route: string; text: string }): boolean {
  const allowed = ALLOWED_NON_CLAIMS.find((a) => a.route === r.route);
  if (allowed && allowed.because.test(r.text) && ourRateHits(r.text).length === 0) return false;
  return ourRateHits(r.text).length > 0 || allowanceHits(r.text).length > 0;
}

const label = (r: string) =>
  INVENTORIED_BY_396.includes(r)
    ? "named by #396"
    : EVERGREEN_UNINVENTORIED.includes(r)
      ? "evergreen, NOT named by #396"
      : DATED_POSTS.includes(r)
        ? "dated post"
        : "NOT INVENTORIED";

describe("V2 byte-pricing surface inventory (landing#403 / #396)", () => {
  // Hard-fail rather than skip. A harness that quietly does nothing when its
  // input is missing is the failure mode this repo keeps re-learning
  // (landing#354, landing#339). CI builds before it tests.
  it("has a built site to read", () => {
    expect(
      existsSync(DIST),
      "dist/ is absent — run `npm run build` first. This test reads the built " +
        "artifact on purpose; it must not silently pass without one.",
    ).toBe(true);
  });

  it("the inventory is exactly the set of routes the artifact puts in scope", () => {
    const found = builtRoutes().filter(inScope).map((r) => r.route).sort();
    const added = found.filter((r) => !INVENTORY.includes(r));
    const removed = INVENTORY.filter((r) => !found.includes(r));

    expect(
      added,
      "A route started publishing our byte-pricing terms and is in no bucket. " +
        "Either correct the copy, add it to the right list, or — if it is not a " +
        "commercial claim — add it to ALLOWED_NON_CLAIMS with a reason:\n" +
        added.map((r) => `  + ${r}`).join("\n"),
    ).toEqual([]);

    expect(
      removed,
      "An inventoried route no longer publishes byte terms. If you are executing " +
        "#396 this is expected — delete these as you go. The routes STILL " +
        "publishing them are below; a partial sweep is not a finished one:\n" +
        removed.map((r) => `  - ${r} (${label(r)})`).join("\n") +
        "\n  --- still publishing: ---\n" +
        found.map((r) => `  * ${r} (${label(r)})`).join("\n"),
    ).toEqual([]);
  });

  it("every per-byte rate we publish is a rate the plan catalogue charges", () => {
    // The broad half, and the one that would have caught $0.40/GB. Any
    // non-approximate money-per-byte figure anywhere on the site must be one of
    // the four computed from PRODUCT. A new tier, a typo, or a stale rate that
    // survives a sweep all land here, in any spelling.
    const offenders: string[] = [];
    for (const { route, text } of builtRoutes()) {
      for (const rate of new Set(ourRateHits(text))) {
        if (!OUR_RATES.has(rate)) offenders.push(`  ${route}: ${rate} / GB`);
      }
    }
    expect(
      offenders,
      "A per-byte rate is published that the plan catalogue does not charge. " +
        `Rates PRODUCT supports: ${[...OUR_RATES].join(", ")} (overage rates, ` +
        "plus each paid plan's list price divided by its included GiB). If this " +
        "is a competitor estimate it must be marked approximate (`~$NN / GB`), " +
        "which is how every other competitor figure on /compare/* reads:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("the approximation marker is doing work, and is not shielding our own rates", () => {
    // Controls on the exemption above, both directions. Without the first, the
    // `~` branch could match nothing and the test would still pass; without the
    // second, a competitor column quoting OUR price would be waved through.
    const all = builtRoutes();
    const approx = all.flatMap(({ route, text }) =>
      approxRateHits(text).map((r) => ({ route, r })),
    );
    expect(
      approx.length,
      "No approximation-marked per-byte rate exists anywhere. Either the " +
        "/compare/* estimates lost their `~`, or RATE_SHAPE stopped matching " +
        "them — in which case the exemption is inert and this test proves nothing.",
    ).toBeGreaterThan(0);

    const shielded = approx.filter(({ r }) => OUR_RATES.has(r));
    expect(
      shielded,
      "A rate marked as an approximate competitor estimate is one of OUR rates. " +
        "Either a competitor row is quoting our price, or one of our own rates " +
        "picked up a `~` and is now exempt from the check above:\n" +
        shielded.map((s) => `  ${s.route}: ~${s.r} / GB`).join("\n"),
    ).toEqual([]);
  });

  it("every ALLOWED_NON_CLAIMS exemption still corresponds to real copy", () => {
    // An exemption that has gone stale is a hole with a comment over it.
    const pages = new Map(builtRoutes().map((r) => [r.route, r.text]));
    for (const a of ALLOWED_NON_CLAIMS) {
      const text = pages.get(a.route);
      expect(text, `ALLOWED_NON_CLAIMS names ${a.route}, which no longer builds.`).toBeTruthy();
      expect(
        a.because.test(text as string),
        `ALLOWED_NON_CLAIMS exempts ${a.route} on the strength of copy that is ` +
          `no longer there (${a.because}). Re-read the page and delete the ` +
          "exemption, or fix its pattern — it is currently exempting the whole " +
          "route on a stale premise.",
      ).toBe(true);
    }
  });

  it("each bucket holds what its name says", () => {
    // Derived, not listed: a dated post is one served under /blog/. This stops a
    // compare page from being quietly reclassified as a blog post to shrink the
    // finding, and stops a post from hiding among the evergreen surfaces.
    expect(DATED_POSTS.filter((r) => !r.startsWith("/blog/"))).toEqual([]);
    expect(
      [...INVENTORIED_BY_396, ...EVERGREEN_UNINVENTORIED].filter((r) => r.startsWith("/blog/")),
    ).toEqual([]);
    expect(new Set(INVENTORY).size, "an entry is in two buckets").toBe(INVENTORY.length);
    // The headline number in #403: five evergreen surfaces #396 does not name.
    expect(EVERGREEN_UNINVENTORIED.length).toBe(5);
  });
});

describe("the published terms are the terms the plan catalogue holds", () => {
  /**
   * The exact-computed half. Every expected string here is built from `PRODUCT`,
   * so editing a tier fails the test rather than leaving a stale-but-present
   * number green — the parity-not-existence lesson from `rate-limit-claims`.
   *
   * Scoped to the two routes `Pricing.astro` renders on, because those are the
   * offer: `/pricing` is the page a buyer reads and `/` is the same component.
   */
  const OFFER_ROUTES = ["/", "/pricing"];

  it("states every plan's included volume", () => {
    const pages = new Map(builtRoutes().map((r) => [r.route, r.text]));
    for (const route of OFFER_ROUTES) {
      const text = pages.get(route) as string;
      expect(text, `${route} did not build`).toBeTruthy();
      for (const [name, p] of PLANS) {
        expect(
          text,
          `${route} does not state ${name}'s included volume, which the plan ` +
            `catalogue holds as ${p.bytesIncluded.toLocaleString("en-US")} bytes.`,
        ).toContain(volumeLabel(p.bytesIncluded));
      }
    }
  });

  it("states every overage rate the catalogue charges", () => {
    const pages = new Map(builtRoutes().map((r) => [r.route, r.text]));
    for (const route of OFFER_ROUTES) {
      const text = pages.get(route) as string;
      for (const [name, p] of PLANS) {
        if (p.overageCentsPerGib === null) continue;
        expect(
          text,
          `${route} does not state ${name}'s overage rate ` +
            `(${p.overageCentsPerGib}c per GiB in the catalogue).`,
        ).toContain(money(p.overageCentsPerGib));
      }
    }
  });

  it("says what a GB is, where the rate is defined and where it is computed", () => {
    /**
     * The biller divides by 2^30, so our "GB" is 7.4% larger than the decimal GB
     * a warehouse console reports. `/pricing`'s FAQ says so. `/why-cheaper` is
     * the page that turns the rate into a personalised dollar figure, and a
     * reader typing a decimal-GB number into it is quoted a figure the biller
     * would not produce — so the definition has to be on the page doing the
     * arithmetic, not only on the page defining the rate.
     *
     * A floor, not a pin: adding the sentence to more pages must never go red.
     * The wider gap — the disclosure reaches 2 of the 11 routes that publish a
     * per-byte rate — is recorded on landing#403, not asserted here.
     */
    const expected = GIB.toLocaleString("en-US"); // "1,073,741,824"
    const pages = new Map(builtRoutes().map((r) => [r.route, r.text]));
    for (const route of ["/pricing", "/why-cheaper"]) {
      expect(
        pages.get(route),
        `${route} publishes a per-GB rate without saying that a GB is ` +
          `${expected} bytes. The biller's divisor is 1024**3 ` +
          "(datanika-cloud billing/tasks.py); a decimal reading of the same " +
          "number is a different bill.",
      ).toContain(expected);
    }
  });

  it("does not describe an unenforced run allowance as something that stops runs", () => {
    /**
     * 🚨 The difference the 2026-08-31 promotion created, and the reason this
     * block exists.
     *
     * `c1d2e3f4a5b6` set `hard_cap_runs = false` on pro-monthly, pro-annual,
     * enterprise-monthly and enterprise-annual, and `check_run_quota` returns
     * immediately when that column is false. Free is still `true`. So Free's 500
     * runs stop a pipeline and Pro's 15,000 and Enterprise's 50,000 no longer
     * do — nothing blocks them and, in V2, nothing bills them either.
     *
     * Which plans are exempt is DERIVED from `hardCapRuns`, not listed: if
     * Engineering ever caps Pro again, this assertion narrows on its own instead
     * of going red on the correct change.
     *
     * "must NOT print" — so the pattern is broad, and matches the claim in any
     * spelling within one sentence of the plan's own run figure.
     *
     * One carve-out, in the shape `overage-unit-claims.test.ts` already
     * established for the retired V1 rate: a **dated post** may print the claim
     * if the page carries a dated correction, because deleting a dated post's
     * own history is not honesty. The exemption is derived, not listed — a dated
     * post is one served under `/blog/` — and the marker is an exact date
     * format, not a phrasing, so a vague "this may be out of date" does not
     * unlock it. Its own control is the test below.
     */
    const BLOCKS = /hard[-\s]cap|runs stop|stop once you hit|pipelines? (?:pause|stop)|no billing surprises/i;
    const offenders: string[] = [];
    for (const { route, text } of builtRoutes()) {
      if (route.startsWith("/blog/") && DATED_CORRECTION.test(text)) continue;
      for (const [name, p] of PLANS) {
        if (p.hardCapRuns) continue; // Free: the claim is true, so it is allowed
        const figure = p.runsIncluded.toLocaleString("en-US");
        for (const m of text.matchAll(new RegExp(figure.replace(/,/g, "[,]?"), "g"))) {
          const i = m.index ?? 0;
          const window = text.slice(Math.max(0, i - 160), i + 160);
          if (BLOCKS.test(window)) {
            offenders.push(`  ${route}: ${name} ${figure} runs — "${window.trim()}"`);
          }
        }
      }
    }
    expect(
      offenders,
      "A route says a plan's model-run allowance stops runs, for a plan whose " +
        "`hard_cap_runs` is false in the seeded catalogue. Since core master " +
        "b1a5fc25 (2026-08-31) that is not what the product does. If the copy " +
        "is describing V1 as history, date the correction visibly on the page " +
        "so a reader can see it is not current:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("the historical carve-out is exercised, and names what it exempts", () => {
    /**
     * The control on the exemption above. Without it, the carve-out could match
     * nothing — or everything — and the ban would still read green. Both failure
     * directions are checked: an inert exemption, and one that has quietly grown
     * to cover a post that no longer says what it is correcting.
     */
    const BLOCKS =
      /hard[-\s]cap|runs stop|stop once you hit|pipelines? (?:pause|stop)|no billing surprises/i;
    const exempted: string[] = [];
    for (const { route, text } of builtRoutes()) {
      if (!route.startsWith("/blog/") || !DATED_CORRECTION.test(text)) continue;
      const trips = PLANS.some(([, p]) => {
        if (p.hardCapRuns) return false;
        const figure = p.runsIncluded.toLocaleString("en-US");
        return [...text.matchAll(new RegExp(figure.replace(/,/g, "[,]?"), "g"))].some((m) => {
          const i = m.index ?? 0;
          return BLOCKS.test(text.slice(Math.max(0, i - 160), i + 160));
        });
      });
      if (trips) exempted.push(route);
    }

    expect(
      exempted.length,
      "No dated post is using the historical carve-out, so the carve-out is " +
        "inert and the ban above proves nothing about it. If the last V1 post " +
        "was swept, delete DATED_CORRECTION and the `continue` beside it rather " +
        "than leaving an unexercised escape hatch in a ban.",
    ).toBeGreaterThan(0);

    // Every post taking the exemption must actually say what changed, not just
    // carry a date. `V1` is the exact token the correction blocks use.
    const pages = new Map(builtRoutes().map((r) => [r.route, r.text]));
    for (const route of exempted) {
      expect(
        pages.get(route),
        `${route} takes the historical carve-out on the strength of a date, but ` +
          "does not say the figures are V1. A date alone does not tell a reader " +
          "which half of the page is history.",
      ).toMatch(/\bV1\b/);
    }
  });

  it("still explains that green does not mean the customer is billed this", () => {
    // The docstring is load-bearing: this file is the most likely place for a
    // future reader to conclude the pricing claims are verified end to end.
    const self = readFileSync(resolve(__dirname, "byte-pricing-surface-inventory.test.ts"), "utf-8");
    expect(self).toContain("never *the customer is billed this*");
    expect(self).toContain('"must state X" is an exact computed substring');
  });
});
