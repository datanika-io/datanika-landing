/**
 * Guardrail: the COMMERCIAL claims on every dated legal page — the billing
 * model they describe, the plan names they claim exist, the figures they
 * restate, and the design rule that they must not restate rates.
 *
 * ## Why this exists
 *
 * `legal-pages-facts.test.ts` pins `/privacy` and `/trust`. It was written for
 * landing#343, where both pages named the wrong host for six weeks with every
 * build green. It names its two pages in a hardcoded map — so `/terms` and
 * `/refund` were never in the net at all.
 *
 * `/terms` then carried **two** false claims simultaneously for four months
 * (landing#410), on a page whose sentences are terms of sale:
 *
 *   - `<li>Usage-based charges (model run overages) are billed at the end of
 *     each billing cycle.</li>` — V1 pricing, replaced by per-GB volume
 *     overage on 2026-04-20.
 *   - `<li>Paid features are available through subscription plans (Starter,
 *     Pro, Enterprise).</li>` — **there is no Starter plan and never has been.**
 *
 * Nothing was watching. Both were found by reading the rendered page, not by
 * any check.
 *
 * ## 🚨 Why this reads `dist/` and not `src/`
 *
 * This is the sharpest lesson available in this repo, and it is the reason this
 * file exists in the shape it does.
 *
 * `software-application.test.ts` **already asserted exactly the right
 * invariant** — *"no offer prices an overage per run"* — and was **green
 * through all five violations of it**, because it inspects `PLAN_OFFERS`, the
 * structured data, and nothing else. A correct invariant, scoped to one
 * artifact, went blind to the same claim on five rendered routes.
 *
 * A legal representation is what a *reader* is served. So every assertion below
 * reads the built HTML. Source→route is not one-to-one in Astro: a `//` comment
 * renders nowhere, and one component renders on many routes.
 *
 * ## The scope is DERIVED, not listed
 *
 * The root cause of the `/terms` gap was a hand-maintained list of two pages.
 * Adding `/terms` to a hand-maintained list of two would produce a
 * hand-maintained list of three and leave `/refund` — a footer-linked page of
 * sale — outside it, plus whatever legal page is written next.
 *
 * So the set of legal pages is derived from the built site: a page carrying a
 * dated-revision marker ("Last updated" / "Change log") in its `<main>`. That
 * is the intrinsic signature of a policy document, and it selects exactly
 * `/privacy`, `/refund`, `/terms`, `/trust` out of 160 built routes. The
 * blanket rules below then apply to every such page automatically, and the
 * coverage test fails when a new one appears that no guard makes page-specific
 * assertions about.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, sep } from "path";

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

type Page = {
  route: string;
  /** Raw built HTML, for href and JSON-LD checks. */
  html: string;
  /** Visible text of `<main>` only — no navbar, no footer. */
  text: string;
  /** Raw HTML of `<main>` only. */
  mainHtml: string;
};

const strip = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#36;/g, "$")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

function builtRoutes(): Page[] {
  const out: Page[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = resolve(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry === "index.html") {
        const rel = p.slice(DIST.length + 1).split(sep).join("/");
        const route = "/" + rel.replace(/index\.html$/, "").replace(/\/$/, "");
        const html = readFileSync(p, "utf-8");
        const m = html.match(/<main[\s\S]*?<\/main>/);
        const mainHtml = m ? m[0] : "";
        out.push({ route, html, mainHtml, text: strip(mainHtml) });
      }
    }
  };
  walk(DIST);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * A policy document says when it was last revised. Marketing copy does not.
 *
 * Scoped to `<main>` deliberately: chrome is identical on all 160 routes, so a
 * marker in the navbar or footer would select the whole site.
 */
const REVISION_MARKER = /Last updated|Change log/i;

const ALL = builtRoutes();
const LEGAL = ALL.filter((p) => REVISION_MARKER.test(p.text));
const legalRoute = (r: string) => LEGAL.find((p) => p.route === r);

/**
 * Fixed-width windows around a trigger, rather than sentence splitting.
 *
 * Sentence splitting on `.` is wrong on exactly these pages: "Paddle.com",
 * "5–10 business days", and every abbreviation in a legal document break it.
 */
function windows(text: string, trigger: RegExp, width: number): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(trigger.source, "gi"))) {
    out.push(
      text.slice(Math.max(0, m.index! - width), m.index! + m[0].length + width),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Scope and coverage
 * ------------------------------------------------------------------ */

/**
 * Pages this file makes page-specific assertions about. The blanket rules
 * apply to every derived legal page regardless of this list.
 */
const PAGE_SPECIFIC_HERE = ["/terms", "/refund", "/privacy"];

/** The sibling guard, read as text so the two files cannot drift apart. */
const SIBLING = resolve(ROOT, "tests/legal-pages-facts.test.ts");

describe("legal pages: the guard knows which pages are legal pages", () => {
  it("has a built site to read", () => {
    expect(
      existsSync(DIST),
      "dist/ is absent — run `npm run build` first. This suite reads the built " +
        "artifact on purpose and must never pass without one.",
    ).toBe(true);
    expect(ALL.length, "dist/ has almost no routes in it").toBeGreaterThan(100);
  });

  it("derives exactly the four dated policy documents from the built site", () => {
    // Pinned as a control, not as the source of truth: the derivation is the
    // mechanism, and this asserts the mechanism still selects what we think.
    // A new legal page SHOULD break this — that is the point. Add it here and
    // give it page-specific assertions below.
    expect(LEGAL.map((p) => p.route).sort()).toEqual([
      "/privacy",
      "/refund",
      "/terms",
      "/trust",
    ]);
  });

  it("every legal page is linked from the site footer", () => {
    // A policy page nobody can reach is its own defect, and an unlinked page is
    // also one this derivation would keep selecting long after it went dead.
    const footer = ALL[0].html.match(/<footer[\s\S]*?<\/footer>/);
    expect(footer, "no <footer> in the built HTML").toBeTruthy();
    const linked = new Set(
      [...footer![0].matchAll(/href="(\/[^"#]*)"/g)].map((m) =>
        m[1].replace(/\/$/, ""),
      ),
    );
    for (const p of LEGAL) {
      expect(
        linked.has(p.route),
        `${p.route} is a dated policy document but the footer does not link it.`,
      ).toBe(true);
    }
  });

  it("no legal page is outside the net — every one has a page-specific guard", () => {
    /**
     * 🚨 This is the test that would have caught `/terms`.
     *
     * The gap was never a wrong assertion. It was that `legal-pages-facts.ts`
     * names two pages in a map, and nothing anywhere said the other legal pages
     * existed. Reading the sibling's source rather than restating its list is
     * the same technique the dev.to gate uses against
     * `byte-pricing-surface-inventory.test.ts`: two lists that cannot drift,
     * because there is only one.
     */
    const sibling = readFileSync(SIBLING, "utf-8");
    const coveredThere = LEGAL.map((p) => p.route).filter((r) =>
      sibling.includes(`src/pages${r}.astro`),
    );
    const covered = new Set([...coveredThere, ...PAGE_SPECIFIC_HERE]);
    const uncovered = LEGAL.map((p) => p.route).filter((r) => !covered.has(r));

    expect(
      uncovered,
      "These pages carry a dated revision marker — they are legal documents — " +
        "but no guard makes any page-specific assertion about them:\n" +
        uncovered.map((r) => `  ${r}`).join("\n") +
        "\nThat is exactly how /terms shipped V1 overage language and a " +
        "'Starter' plan that never existed (landing#410). Decide what is " +
        "load-bearing on the page and pin it — the billing model, the plan " +
        "names, and any figure it restates.",
    ).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 1. Plan names
 * ------------------------------------------------------------------ */

/**
 * The plans that exist. Re-derive from the biller, never from landing's own
 * data files:
 *
 *   psql -c "select name from plans order by id"        # seeded plans
 *   grep -n 'name=' datanika-cloud/.../plans seed
 *
 * ⚠️ Deliberately NOT derived from `src/data/software-application.ts`. Binding
 * a published claim to landing's own belief converts a visible mismatch into a
 * coherent machine-readable assertion of something untrue, and a
 * self-consistency guard goes green on all of it. If someone adds a "Starter"
 * to `PLAN_OFFERS`, this test must still fail.
 */
const REAL_PLAN_FAMILIES = ["Free", "Pro", "Enterprise"];

/**
 * Tier names common enough in SaaS that someone could write one from muscle
 * memory. "Starter" is here because it actually happened.
 *
 * ⚠️ Matched only inside a plan context — never as a bare word sweep. `/trust`
 * and `/privacy` both legitimately contain "Standard" ("Standard Contractual
 * Clauses", the GDPR transfer mechanism) and "Plus" ("Resend (Plus Five Five,
 * Inc.)", the vendor's legal name). A bare ban would fire on both and get this
 * test deleted. `docs/GROWTH_RULES.md`: *a banned-word rule needs the context,
 * not just the word.*
 */
const ABSENT_TIER_NAMES = [
  "Starter", "Team", "Business", "Basic", "Premium", "Standard", "Plus",
  "Growth", "Scale", "Startup", "Essentials", "Advanced", "Ultimate",
  "Developer",
];

const PLAN_CONTEXT = /(?:subscription\s+)?plans?\b|\btiers?\b/;
const PLAN_WINDOW = 90;

describe("legal pages: the plans they claim exist are the plans that exist", () => {
  it("names no plan tier that does not exist", () => {
    const offenders: string[] = [];
    for (const page of LEGAL) {
      for (const w of windows(page.text, PLAN_CONTEXT, PLAN_WINDOW)) {
        for (const tier of ABSENT_TIER_NAMES) {
          if (new RegExp(`\\b${tier}\\b`).test(w)) {
            offenders.push(`  ${page.route} — "${tier}" in: …${w.trim()}…`);
          }
        }
      }
    }
    expect(
      offenders,
      `A legal page names a plan tier that does not exist. The plans are ` +
        `${REAL_PLAN_FAMILIES.join(", ")} — re-derive from the seeded plans in ` +
        `the biller, not from landing's own data files:\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("the pages of sale still name the real plans (control)", () => {
    // The check above is a count-is-zero sweep, and an empty page satisfies it.
    // `docs/GROWTH_RULES.md`: pin a control sentence beside every such sweep.
    for (const route of ["/terms", "/refund"]) {
      const page = legalRoute(route);
      expect(page, `${route} is missing from dist/`).toBeDefined();
      const ctx = windows(page!.text, PLAN_CONTEXT, PLAN_WINDOW).join(" | ");
      for (const family of REAL_PLAN_FAMILIES) {
        expect(
          new RegExp(`\\b${family}\\b`).test(ctx),
          `${route} no longer names the ${family} plan anywhere near plan ` +
            `vocabulary. The zero-count check above would pass on a page that ` +
            `said nothing at all, so this is what stops it passing vacuously.`,
        ).toBe(true);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. The billing model
 * ------------------------------------------------------------------ */

/**
 * ⚠️ `\b` boundaries are load-bearing, not tidiness.
 *
 * Without them `/overages?/` matches inside **"c-overage"**, and `/trust`'s
 * sentence about "wrong_org coverage in every service test module" became a
 * false positive naming a page that has nothing to do with billing. Measured,
 * not hypothetical: it was 1 window on /trust before the boundaries and 0
 * after, with /terms unchanged at 5.
 */
const USAGE_CHARGE = /\busage-based charges?\b|\boverages?\b|\bmetered\b/;
const CHARGE_WINDOW = 120;

/** What V2 bills. */
const VOLUME_VOCAB = /data volume|volume of data|\bGB\b|gigabytes?|\bbytes\b/i;

describe("legal pages: usage-based charges are priced on data volume, never runs", () => {
  it("no charge sentence is denominated in runs", () => {
    /**
     * The defect this replaces, verbatim from the shipped page:
     *
     *   "Usage-based charges (model run overages) are billed at the end of
     *    each billing cycle."
     *
     * V2 bills bytes. Overage is computed once per billing cycle on the summed
     * quantity and ceiled to whole GB — `datanika-cloud/billing/tasks.py`,
     * `_group_by_cycle()` and `_overage_price_cents()`. There is no per-run
     * charge of any kind.
     */
    const offenders: string[] = [];
    for (const page of LEGAL) {
      for (const w of windows(page.text, USAGE_CHARGE, CHARGE_WINDOW)) {
        if (/\brun(?:s|ning)?\b/i.test(w)) {
          offenders.push(`  ${page.route} — …${w.trim()}…`);
        }
      }
    }
    expect(
      offenders,
      "A legal page describes usage-based charges in terms of runs. V1's " +
        "per-run overage was replaced outright by per-GB volume overage on " +
        "2026-04-20; the biller meters `bytes_processed` and nothing else " +
        "(METERED_METRICS in datanika-cloud/billing/tasks.py). This is a term " +
        "of sale, not marketing copy:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("a page that describes usage-based charges says what is measured", () => {
    // Page-level rather than window-level on purpose. "The Free plan carries no
    // usage-based charges" is >120 chars from the nearest "GB", and requiring
    // the unit inside every window would fire on a correct sentence.
    const offenders = LEGAL.filter(
      (p) =>
        windows(p.text, USAGE_CHARGE, CHARGE_WINDOW).length > 0 &&
        !VOLUME_VOCAB.test(p.text),
    ).map((p) => `  ${p.route}`);

    expect(
      offenders,
      "This page prices usage above an allowance but never says what is " +
        "measured. The pre-fix /terms did exactly this — it charged for " +
        '"overages" and named no unit anywhere on the page:\n' +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("/privacy discloses data volume as usage data it collects", () => {
    /**
     * Found while writing this guard, and it is the same class as the /terms
     * defect — a legal page still describing usage in V1's terms.
     *
     * `/privacy` listed "Feature usage metrics (model runs, connections,
     * schedules) for billing" and named data volume **nowhere on the page**.
     * But `bytes_processed` is written to `UsageLedger` per run and is the
     * *only* entry in `METERED_METRICS`. A privacy policy has to disclose what
     * it collects, and the metered quantity was undisclosed.
     *
     * Neither existing guard could see it: it quotes no rate and never says
     * "overage per run", so `overage-unit-claims.test.ts` passes it, and it is
     * not an infrastructure fact, so `legal-pages-facts.test.ts` passes it too.
     */
    const privacy = legalRoute("/privacy");
    expect(privacy, "/privacy is missing from dist/").toBeDefined();
    expect(
      /data volume/i.test(privacy!.text),
      "/privacy no longer discloses data volume as collected usage data. It " +
        "is the metered quantity — `bytes_processed` is the only entry in " +
        "METERED_METRICS — so omitting it understates what we collect.",
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Rates are published in exactly one place
 * ------------------------------------------------------------------ */

/**
 * The design rule, and the reason `/terms` links to `/pricing` instead of
 * repeating the numbers: **a legal page must never become a second surface for
 * a rate to drift on.**
 *
 * Rates already appear on `/pricing`, `/why-cheaper`, four `/compare/*` pages,
 * `/features/volume-pricing` and the JSON-LD. Adding a legal page to that set
 * buys nothing and creates a surface where being wrong is a term of sale rather
 * than a marketing error — and legal-page drift is the class that ran six weeks
 * undetected in landing#343.
 */
const RATE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "a currency amount", re: /\$\s?\d/ },
  { label: "a USD amount", re: /\bUSD\s?\d/ },
  { label: "a per-GB rate", re: /[\d.]\s*(?:\/|\s+per\s+)\s*GB\b/i },
  { label: "a per-gigabyte rate", re: /\bper[-\s]gigabytes?\b/i },
  { label: "an amount in cents", re: /\b\d+\s*cents?\b/i },
];

describe("legal pages: rates live on /pricing and nowhere else", () => {
  it.each(RATE_PATTERNS)("no legal page restates $label", ({ re, label }) => {
    const offenders: string[] = [];
    for (const page of LEGAL) {
      const m = page.text.match(new RegExp(`.{0,80}(?:${re.source}).{0,80}`, "i"));
      if (m) offenders.push(`  ${page.route} — …${m[0].trim()}…`);
    }
    expect(
      offenders,
      `A legal page restates ${label}. Rates are published on /pricing; a ` +
        `legal page must link there rather than repeat them, so that a price ` +
        `change cannot leave a stale number in a term of sale:\n` +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("/terms links to /pricing from its body, which is what makes the rule workable", () => {
    /**
     * ⚠️ Scope to `<main>`. Measured: the whole document contains 2 matches for
     * `href="/pricing"` on **every** page on the site, because the navbar and
     * footer link it. A document-level count would therefore pass on a page
     * that had deleted the reference entirely — the check would record the
     * chrome and nothing else.
     *
     * Inside `<main>`: /terms 1, /privacy 0, /trust 0, /refund 0.
     */
    const terms = legalRoute("/terms");
    expect(terms, "/terms is missing from dist/").toBeDefined();
    expect(
      /href="\/pricing\/?"/.test(terms!.mainHtml),
      "/terms no longer links to /pricing from its body. Not restating rates " +
        "is only honest if the page points at where they are published — " +
        "otherwise the allowance and overage terms reference a rate the reader " +
        "cannot find.",
    ).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Figures restated in more than one place must agree
 * ------------------------------------------------------------------ */

describe("legal pages: a figure restated in two places must say the same thing", () => {
  /**
   * ⚠️ Only figures that are the SAME commitment are coupled here.
   *
   * `/privacy` and `/refund` both say "14 days" and they are unrelated —
   * web-server access log rotation and the refund window. Coupling them because
   * they share a number would make a correct edit to either one fail. Likewise
   * `/terms` says "30 days" three times for three different commitments
   * (price-change notice, termination notice, data deletion) and only the third
   * is the one below.
   */
  const DELETION_WINDOW =
    /(?:personal data is removed|delete your data|data is removed) within (\d+) days/i;

  it("the data-deletion window is 30 days on every page that states it", () => {
    /**
     * 🚨 Load-bearing across three teams. `/privacy`'s half is already pinned
     * by `legal-pages-facts.test.ts`; `/terms` and `/trust` were not, so the
     * three could disagree.
     *
     * The promise is satisfiable only because off-site backup retention is
     * exactly 30 days (`REMOTE_KEEP_DAYS=30` in `backup-offsite.sh`), and
     * SPEC_PII_SEPARATION D7 is built to it. Changing it means changing the
     * backup retention first, then the spec, then all three pages.
     */
    const stated = LEGAL.map((p) => ({
      route: p.route,
      days: p.text.match(DELETION_WINDOW)?.[1],
    })).filter((x) => x.days !== undefined);

    expect(
      stated.length,
      "No legal page states a data-deletion window any more. Three did " +
        "(/terms, /privacy, /trust); losing the sentence silently drops a GDPR " +
        "erasure commitment that SPEC_PII_SEPARATION is built to satisfy.",
    ).toBeGreaterThanOrEqual(3);

    for (const { route, days } of stated) {
      expect(
        days,
        `${route} states a ${days}-day deletion window; the promise is 30 ` +
          `days everywhere, and it holds only because REMOTE_KEEP_DAYS=30 in ` +
          `backup-offsite.sh. Change the retention and the spec first.`,
      ).toBe("30");
    }
  });

  it("/refund's prose window and its structured data agree", () => {
    /**
     * `refund.astro` renders both from one constant, so today they cannot
     * disagree. This asserts the *rendered* pair anyway, because the whole
     * lesson of `software-application.test.ts` is that a guard which inspects
     * the constant does not see the page. If someone inlines the number in the
     * prose, the constant is still correct and only this fails.
     */
    const refund = legalRoute("/refund");
    expect(refund, "/refund is missing from dist/").toBeDefined();
    const prose = refund!.text.match(/refund within (\d+) days/i);
    const jsonLd = refund!.html.match(/"merchantReturnDays"\s*:\s*(\d+)/);
    expect(prose, "/refund no longer states a refund window in prose").toBeTruthy();
    expect(jsonLd, "/refund no longer emits merchantReturnDays in JSON-LD").toBeTruthy();
    expect(
      prose![1],
      `/refund promises ${prose![1]} days to a reader and ${jsonLd![1]} days to ` +
        `a search engine. A return window is a term of sale and Google renders ` +
        `it in the rich result.`,
    ).toBe(jsonLd![1]);
  });

  it("the operator identification number agrees wherever it is restated", () => {
    /**
     * Deliberately asserts AGREEMENT, not a value.
     *
     * `docs/GROWTH_RULES.md`: *a guard that names an instance goes red on the
     * correct change.* Nothing downstream depends on these digits, so pinning
     * them would only fail the day the founder legitimately re-registers. What
     * cannot be legitimate is the same page carrying two different numbers, or
     * two pages disagreeing — that is a copy-paste error or a stale page, and
     * it is what this catches. (Contrast the 30-day window above, which IS
     * pinned, because a spec and a backup retention are built to the value.)
     */
    const ids = LEGAL.flatMap((p) =>
      [...p.text.matchAll(/(?:identification number|ID:)\s*(\d+)/gi)].map((m) => ({
        route: p.route,
        id: m[1],
      })),
    );
    expect(
      ids.length,
      "No legal page states the operator's identification number any more. " +
        "/terms carried it twice and /refund once; it identifies the selling " +
        "entity.",
    ).toBeGreaterThanOrEqual(3);
    const distinct = [...new Set(ids.map((x) => x.id))];
    expect(
      distinct.length,
      "The operator identification number disagrees between pages:\n" +
        ids.map((x) => `  ${x.route}: ${x.id}`).join("\n"),
    ).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * 5. Controls — every matcher above is shown able to fire
 * ------------------------------------------------------------------ */

describe("controls: the matchers are not inert", () => {
  /**
   * Every assertion above is "this set is empty" or "this string is present".
   * A suite of absences passes on an empty file, and a matcher that has never
   * matched anything has not been shown to work.
   *
   * These run against the REAL pre-fix copy, taken verbatim from
   * `git show 6bbe570:src/pages/terms.astro` — the version that was live on
   * datanika.io for four months — not against a synthetic mutation.
   */
  const PRE_FIX_PLANS =
    "Paid features are available through subscription plans (Starter, Pro, Enterprise).";
  const PRE_FIX_CHARGES =
    "Usage-based charges (model run overages) are billed at the end of each billing cycle.";

  it("the absent-tier matcher fires on the real 'Starter' line", () => {
    const hit = windows(PRE_FIX_PLANS, PLAN_CONTEXT, PLAN_WINDOW).some((w) =>
      ABSENT_TIER_NAMES.some((t) => new RegExp(`\\b${t}\\b`).test(w)),
    );
    expect(hit, "the plan-name matcher would not have caught 'Starter'").toBe(true);
  });

  it("the run-billing matcher fires on the real 'model run overages' line", () => {
    const hit = windows(PRE_FIX_CHARGES, USAGE_CHARGE, CHARGE_WINDOW).some((w) =>
      /\brun(?:s|ning)?\b/i.test(w),
    );
    expect(hit, "the charge matcher would not have caught 'model run overages'").toBe(true);
  });

  it("the 'says what is measured' check fires on the real pre-fix page", () => {
    expect(windows(PRE_FIX_CHARGES, USAGE_CHARGE, CHARGE_WINDOW).length).toBeGreaterThan(0);
    expect(VOLUME_VOCAB.test(PRE_FIX_CHARGES)).toBe(false);
  });

  it("the tier matcher does NOT fire on the two real false-positive sentences", () => {
    // Both are live copy on /trust and /privacy. If either starts failing, the
    // context window has been widened too far and this test will be deleted by
    // whoever it wakes up at the wrong moment.
    const scc =
      "Those transfers rely on the Standard Contractual Clauses in each provider's DPA.";
    const resend =
      "Resend (Plus Five Five, Inc.) Transactional email delivery — password resets.";
    for (const sentence of [scc, resend]) {
      const hit = windows(sentence, PLAN_CONTEXT, PLAN_WINDOW).some((w) =>
        ABSENT_TIER_NAMES.some((t) => new RegExp(`\\b${t}\\b`).test(w)),
      );
      expect(hit, `false positive on legitimate copy: ${sentence}`).toBe(false);
    }
  });

  it("the rate matchers fire on real published rates", () => {
    const real = "Datanika's per-GB rate is exact — $0.50/GB on Pro, $0.25/GB on Enterprise";
    expect(RATE_PATTERNS.some(({ re }) => re.test(real))).toBe(true);
  });

  it("every legal page was actually read", () => {
    // A bad path or a renamed route would make every sweep above pass on an
    // empty string.
    for (const p of LEGAL) {
      expect(p.text.length, `${p.route} main body is empty`).toBeGreaterThan(1500);
      expect(p.mainHtml.length, `${p.route} has no <main>`).toBeGreaterThan(1500);
    }
  });
});
