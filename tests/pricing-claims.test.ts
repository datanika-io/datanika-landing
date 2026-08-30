import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { resolve, relative } from "path";

/**
 * Two guards over the claims our pricing surfaces make.
 *
 *   1. **Provenance** (landing#374) — a competitor dollar figure must say it is
 *      an estimate and point at the vendor for a binding number.
 *   2. **Capability** (landing#375) — we must not sell a pre-run cost estimate,
 *      because nothing computes one.
 *
 * ## Why these read `dist/`, not `src/`
 *
 * Both defects are about what a *reader* is told. An Astro `//` comment in the
 * frontmatter never reaches the reader, so a source-level scan would have
 * credited `/compare/*` for a disclosure that is genuinely rendered **and**
 * credited `/why-cheaper/` for one that is only a code comment. The inverse
 * bit us in the other direction once already: an internal warning written as an
 * HTML comment in a `.astro` template shipped verbatim into
 * `dist/trust/index.html` while the source sweep read green.
 *
 * `dist/` is the artifact under discussion. Read the artifact.
 */

const ROOT = resolve(__dirname, "..");
const DIST = resolve(ROOT, "dist");

/** Every built page, as `{ route, html }`. */
function builtPages(): { route: string; html: string }[] {
  const out: { route: string; html: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry === "index.html" || entry === "404.html") {
        out.push({
          route: "/" + relative(DIST, full).replace(/\\/g, "/"),
          html: readFileSync(full, "utf-8"),
        });
      }
    }
  };
  walk(DIST);
  return out;
}

/**
 * Strip `<head>`, `<script>` and `<style>` before looking for prose. A page's
 * meta description legitimately repeats headline copy, and JSON-LD legitimately
 * carries plan prices; neither is the sentence a reader reads, and both would
 * double-count every hit.
 */
function visibleBody(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
}

/**
 * Visible body reduced to plain text. Required for the proximity test below:
 * a comparison table puts the vendor in a `<th>` and the price in a `<td>`,
 * which is two words apart on screen and 400 characters apart in the markup.
 */
function visibleText(html: string): string {
  return visibleBody(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

describe("competitor pricing figures carry their provenance (landing#374)", () => {
  const pages = builtPages();

  it("dist/ exists — run `npm run build` first", () => {
    expect(existsSync(DIST)).toBe(true);
    expect(pages.length).toBeGreaterThan(50);
  });

  /**
   * The four EL/ELT vendors we price against. Deliberately NOT every vendor a
   * page might name: dbt Cloud publishes $100/seat/month and Snowflake, Looker
   * and Metabase are priced on this site only inside a stack total, where the
   * figure is ours and the hedge is different. Widening this list is a real
   * decision, not a tidy-up — make it deliberately.
   */
  const PRICED_VENDORS = ["Fivetran", "Airbyte", "Stitch", "Hevo"];

  /**
   * A vendor-scale dollar figure: three or more digits, or any comma-grouped
   * amount. `$79`, `$0.50` and `$25` are ours and are exact; a competitor
   * number on this site is always in the hundreds or thousands.
   */
  const BIG_MONEY = /\$\d{1,3},\d{3}|\$\d{3,}/g;

  /**
   * The unit is **"a `$N,NNN` near a competitor name"**, not the vendor's name
   * alone — landing#374 says so explicitly, and the first run of this test
   * proved why. Scanning at page level flagged three pages that are fine:
   *
   *   - `/pricing/`, where every figure over $100 is *ours* ($399, $790,
   *     $3,990) and "Fivetran" appears in a CTA carrying no number at all;
   *   - `/blog/stripe-revenue-dashboard-dbt/`, where `$1,200` is a reader's own
   *     yearly plan being normalised to $100 of MRR;
   *   - `/blog/postgresql-to-bigquery/` — which turned out to be a *genuine*
   *     offender for an unrelated figure, and would have been dismissed with
   *     the other two if the test had simply been loosened.
   *
   * A guard that fires on correct copy gets loosened until it fires on nothing.
   * Pair the two halves instead.
   */
  const NEAR = 220;

  function competitorPrices(html: string): string[] {
    const text = visibleText(html);
    const hits: string[] = [];
    for (const m of text.matchAll(BIG_MONEY)) {
      const from = Math.max(0, m.index - NEAR);
      const window = text.slice(from, m.index + m[0].length + NEAR);
      const vendor = PRICED_VENDORS.find((v) => window.includes(v));
      if (vendor) hits.push(`${vendor} ${m[0]}`);
    }
    return hits;
  }

  /**
   * Half one: the numbers are called estimates. Any of these phrasings does the
   * job — the point is that the reader is told the figure is derived, not
   * quoted. `/compare/*` says "illustrative … estimates"; `/why-cheaper/` says
   * "your actual Fivetran bill will sit somewhere in the range". Both are
   * honest and neither should be forced into the other's words.
   */
  const SAYS_ESTIMATE =
    /illustrative|\bestimates?\b|\bestimated\b|does not publish|doesn['’]t publish|publishes no|no published|not published|your actual \w+ bill/i;

  /**
   * Half two: the reader is pointed somewhere binding. A hedge with no exit is
   * still a dead end — the whole complaint in landing#374 is that a reader had
   * no way to check us.
   */
  const POINTS_AT_A_BINDING_SOURCE =
    /fivetran\.com\/pricing|airbyte\.com\/pricing|stitchdata\.com\/pricing|hevodata\.com\/pricing|\/why-cheaper/i;

  it("every page pricing a compared vendor says the number is an estimate", () => {
    const offenders: string[] = [];
    for (const { route, html } of pages) {
      const priced = competitorPrices(html);
      if (priced.length === 0) continue;
      if (!SAYS_ESTIMATE.test(visibleText(html)))
        offenders.push(`${route} — ${priced.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("every page pricing a compared vendor points at a binding source", () => {
    const offenders: string[] = [];
    for (const { route, html } of pages) {
      const priced = competitorPrices(html);
      if (priced.length === 0) continue;
      if (!POINTS_AT_A_BINDING_SOURCE.test(visibleBody(html)))
        offenders.push(`${route} — ${priced.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The assertion landing#374 is actually about, written in the direction we
   * believe rather than the convenient one.
   *
   * Measured 2026-08-30, on the vendors' own sites: Fivetran points at an
   * estimator plus a consumption table and publishes no per-MAR rate; Airbyte
   * prices its paid tiers on compute capacity rather than data moved; Snowflake's
   * pricing-options page carries no dollar figure. So a footnote reading
   * "competitor estimates from published pricing pages (2026)" was not a hedge —
   * it named a source that does not exist.
   *
   * ⚠️ dbt Cloud Starter at $100/user/month IS published, and a page citing it
   * may legitimately say so. If that ever gets written, add the route here with
   * the vendor named — do not loosen the regex.
   */
  const ALLOWED_PUBLISHED_CLAIMS: { route: string; reason: string }[] = [];

  it("no page sources a competitor figure to a published rate card", () => {
    const claim =
      /published\s+(pricing\s+pages?|price\s+lists?|rate\s+cards?|pricing)\b/i;
    const offenders: string[] = [];
    for (const { route, html } of pages) {
      if (ALLOWED_PUBLISHED_CLAIMS.some((a) => a.route === route)) continue;
      if (claim.test(visibleBody(html))) offenders.push(route);
    }
    expect(offenders).toEqual([]);
  });
});

describe("we do not sell a pre-run cost estimate (landing#375)", () => {
  const pages = builtPages();

  /**
   * `SPEC_PRICING_V2` §4.2 ranks "see the cost before you run" fourth of seven
   * talking points and calls it a real differentiator against MAR. It was
   * written from `SPEC_VOLUME_METERING` §5.4, which specs an EWMA of the last
   * five runs, and the product never built it.
   *
   * Read at `master` on 2026-08-31, from the tarball rather than code search:
   *
   *   - `predicted_bytes` has a `None` default in `check_bytes_quota` and no
   *     producer. All three core emitters of `run.before_execute` pass
   *     `predicted_runs` only, so Path A is never entered.
   *   - `ewma`, "moving average", "last 5 runs" and any source-table-size
   *     inspection return **zero** grep hits across core and cloud.
   *   - The one surface that exists, `ui/components/cost_estimator_card.py`,
   *     multiplies nothing: it renders the static strings `cost.total_estimate`
   *     ("Based on your volume estimate") and `cost.per_gb_rate` ("Your plan
   *     rate: see pricing for details") beside a volume the **user typed** into
   *     `form_volume_estimate_gb`. Its own docstring says it is "wired against
   *     mocked DashboardState.bytes_* / plan data".
   *   - It is gated on `datanika_dual_mode_ux_enabled`, which defaults `False`.
   *
   * So no page may promise a computed pre-run number. If Engineering ships one,
   * delete this describe block in the same PR that ships it — that is the point
   * of failing here rather than in a checklist.
   */
  const BANNED: { re: RegExp; why: string }[] = [
    {
      re: /\bpredicted_bytes\b/i,
      why: "names the parameter as if it were a shipped feature; it has no producer",
    },
    {
      re: /pre-run (cost )?estimate/i,
      why: "no surface computes a pre-run estimate",
    },
    {
      re: /(cost|overage|price)[^.<>]{0,40}before (you|every|each)\s+(click|run)/i,
      why: "promises a number shown before the run",
    },
    {
      re: /see (the|your) (predicted )?cost before/i,
      why: "promises a number shown before the run",
    },
    {
      re: /moving average of (the|your) last \d+ runs/i,
      why: "names a mechanism that does not exist in core or cloud",
    },
  ];

  /**
   * A retraction quotes the claim it retracts. That is not a loophole to widen
   * later — it is one specific, named sentence per route.
   *
   * WORKFLOW_RULES §4 records the same trap from the other side: guides
   * corrected to *deny* the "Configure pipeline" button still *contained* the
   * phrase, so `grep -l` over-counted the work by five files. Matching the
   * string is not the same as making the claim.
   */
  const ALLOWED_RETRACTIONS: { route: string; text: string; reason: string }[] =
    [
      {
        route: "/blog/pricing-v2-math-and-why/index.html",
        text: "predicted_bytes",
        reason:
          "The dated correction note at the foot of the post, which names the parameter in " +
          "order to say it is not computed. Delete the exemption if the note ever goes.",
      },
    ];

  it("no built page promises a cost figure before the run", () => {
    const offenders: string[] = [];
    for (const { route, html } of pages) {
      const body = visibleBody(html);
      for (const { re, why } of BANNED) {
        for (const hit of body.match(new RegExp(re, "gi")) ?? []) {
          const exempt = ALLOWED_RETRACTIONS.some(
            (a) => a.route === route && a.text.toLowerCase() === hit.toLowerCase(),
          );
          if (!exempt) offenders.push(`${route}: "${hit}" — ${why}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * An exemption that no longer matches anything is a claim about the site that
   * has quietly stopped being true. Fail on it rather than carrying it.
   */
  it("every retraction exemption still corresponds to real copy", () => {
    const stale = ALLOWED_RETRACTIONS.filter((a) => {
      const page = pages.find((p) => p.route === a.route);
      return !page || !visibleBody(page.html).includes(a.text);
    });
    expect(stale.map((s) => `${s.route}: ${s.text}`)).toEqual([]);
  });
});
