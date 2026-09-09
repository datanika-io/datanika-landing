/**
 * `/privacy` and `/trust` must name every unconditional sub-processor the
 * register carries.
 *
 * 🚨 WHY THIS EXISTS, given that a sub-processor guard already existed.
 *
 * `legal-pages-commercial-claims.test.ts` asserts that /dpa's Annex III is a
 * SUPERSET of /trust's table — "a superset, never a subset". It points one way.
 * The drift that actually happened went the other way: Product added Google
 * (contact mailbox delivery) and Telegram (infrastructure alerting) to the
 * register on 2026-09-04, /dpa rendered them because /dpa is DERIVED, and
 * /privacy + /trust are hand-maintained and were never updated. Both were live
 * in production naming neither, while /dpa named both. Two published legal
 * documents on one domain disagreed about who receives data, and every check
 * was green, because the only guard was watching /dpa for under-listing.
 *
 * That guard also hardcodes ["Pointer","Aweb","Cloudflare","Resend","Paddle",
 * "GitHub"] while calling the list derived. It matched the table on the day it
 * was written. It cannot notice the register moving ahead of the pages.
 *
 * 🔑 A guard that binds A to B does not bind B to the source. This file binds
 * the two hand-maintained pages UP to `src/data/subprocessors.ts`.
 *
 * ⚠️ SCOPED TO THE DISCLOSURE LIST, NOT THE PAGE. A page-level `includes` is
 * vacuous here and demonstrably so: "Google" appears on /trust in the SSO prose
 * ("OAuth login with Google and GitHub") and on /privacy in the OAuth bullet, so
 * a page-level check for "Google" passes on a page whose sub-processor table has
 * no Google row at all. That is the failure mode the sibling file already
 * recorded one level in, and it applies here with the page's own copy as noise.
 *
 * ⚠️ NEEDLES MATCH THE FUNCTION, NOT ONLY THE NAME. The register is keyed by
 * (recipient, function) on purpose — Cloudflare has three functions and Google
 * has two. Asserting the bare name would let a recipient lose a function
 * silently, which is the merge the register exists to prevent.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { resolve, sep } from "path";
import { subprocessors } from "../src/data/subprocessors";

const DIST = resolve(__dirname, "..", "dist");

const strip = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

function builtPage(route: string): string {
  const want = route.replace(/^\//, "");
  let found = "";
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = resolve(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry === "index.html") {
        const rel = p.slice(DIST.length + 1).split(sep).join("/");
        if (rel.replace(/index\.html$/, "").replace(/\/$/, "") === want) {
          found = readFileSync(p, "utf-8");
        }
      }
    }
  };
  walk(DIST);
  return found;
}

/**
 * The disclosure list on each page — never the whole page, and on /trust never
 * the whole section.
 *
 * 🚨 Scoping /trust to `<section id="subprocessors">` was WRONG and this is not
 * a hypothetical: the first version did exactly that, and deleting the Telegram
 * row from the table left every assertion green. The section CONTAINS THE
 * CHANGE LOG, and the change-log entry announcing Telegram says "(infrastructure
 * alerting)" — so the guard was satisfied by the note describing the row rather
 * than by the row. Measured by deleting the row and rebuilding, not reasoned.
 *
 * The rule this keeps re-teaching: a needle must be scoped to the artefact a
 * reader relies on, and prose ABOUT that artefact is noise that reads as signal.
 */
const REGIONS: Record<string, (html: string) => string> = {
  "/trust": (html) => {
    const section = html.match(/<section id="subprocessors"[\s\S]*?<\/section>/);
    if (!section) return "";
    const tables = [...section[0].matchAll(/<table[\s\S]*?<\/table>/g)];
    // Control: the table is located by being the only one in the section. If a
    // second is ever added, this must fail loudly rather than read the wrong one.
    if (tables.length !== 1) return "";
    return tables[0][0];
  },
  "/privacy": (html) => {
    const m = html.match(/We share data only with[\s\S]*?<\/ul>/);
    return m ? m[0] : "";
  },
};

/**
 * One needle per (recipient, function) row of scope `processor`.
 *
 * Keyed by `name :: fn` so the coverage tests below can prove this map covers
 * the register rather than trailing it. A needle is a phrase from the FUNCTION
 * as each page words it — deliberately not the bare recipient name.
 */
const NEEDLES: Record<string, RegExp> = {
  "Pointer :: Application hosting": /Pointer \(pointer\.gr\)/i,
  "Aweb :: Off-site backups": /off-site database backups/i,
  "Aweb :: Marketing site hosting": /hosting for (this website|datanika\.io)/i,
  "Cloudflare, Inc. :: Edge delivery": /CDN, DDoS protection, DNS/i,
  "Cloudflare, Inc. :: Inbound mail routing":
    /inbound routing of mail sent to our published addresses/i,
  "Cloudflare, Inc. :: Web analytics": /cookie-free web analytics/i,
  "Resend :: Transactional email delivery": /transactional email delivery/i,
  "Paddle.com Market Ltd :: Payment processing": /payment processing/i,
  "Google LLC :: Contact mailbox delivery": /Google-operated mailbox/i,
  "GitHub, Inc. (Microsoft) :: Source hosting and CI/CD":
    /source code hosting and CI\/CD/i,
  "Telegram :: Infrastructure alerting": /infrastructure alert/i,
};

const processorRows = subprocessors.filter((s) => s.scope === "processor");
const keyOf = (s: { name: string; fn: string }) => `${s.name} :: ${s.fn}`;

describe("sub-processor register: the guard covers the register", () => {
  it("has rows to check — refuses to pass on an empty or truncated register", () => {
    expect(subprocessors.length).toBeGreaterThanOrEqual(12);
    expect(processorRows.length).toBeGreaterThanOrEqual(11);
  });

  it("has a needle for every processor-scope row", () => {
    const uncovered = processorRows.map(keyOf).filter((k) => !(k in NEEDLES));
    expect(
      uncovered,
      "A processor-scope row was added to src/data/subprocessors.ts with no " +
        "needle here, so nothing checks that /privacy and /trust disclose it. " +
        "Add the row to both pages, then add its needle.",
    ).toEqual([]);
  });

  it("has no needle for a row that no longer exists", () => {
    const live = new Set(processorRows.map(keyOf));
    const orphans = Object.keys(NEEDLES).filter((k) => !live.has(k));
    expect(
      orphans,
      "These needles name register rows that are gone. A stale needle keeps " +
        "passing against page prose nobody maintains any more.",
    ).toEqual([]);
  });

  it("conditional rows are deliberately not required here", () => {
    // Identity providers are opt-in, and both pages disclose them separately as
    // conditional. Requiring them in the unconditional list would publish a
    // stronger claim than the register makes.
    const conditional = subprocessors.filter((s) => s.scope === "conditional");
    expect(conditional.length).toBeGreaterThan(0);
    for (const c of conditional) {
      expect(NEEDLES[keyOf(c)]).toBeUndefined();
    }
  });
});

describe.each(Object.keys(REGIONS))("%s discloses every sub-processor", (route) => {
  const html = builtPage(route);
  const region = strip(REGIONS[route](html));

  it("has a built page and finds its disclosure list", () => {
    expect(html.length, `${route} is missing from dist/`).toBeGreaterThan(0);
    expect(
      region.length,
      `The disclosure list on ${route} could not be located. The extractor is ` +
        `keyed on markup; if the section was restructured, re-point it — an ` +
        `empty region would make every assertion below vacuous.`,
    ).toBeGreaterThan(200);
  });

  it("the matcher is not inert — a phrase that is absent must not match", () => {
    expect(/Snowflake-operated mailbox/i.test(region)).toBe(false);
    expect(/Google-operated mailbox/i.test(region)).toBe(true);
  });

  for (const row of processorRows) {
    const key = keyOf(row);
    it(`names ${key}`, () => {
      const needle = NEEDLES[key];
      expect(needle, `no needle for ${key}`).toBeDefined();
      expect(
        needle.test(region),
        `${route} does not disclose ${key}, which src/data/subprocessors.ts ` +
          `carries as an unconditional sub-processor and /dpa's Annex III ` +
          `publishes. Two of our own legal documents would disagree about who ` +
          `receives data.`,
      ).toBe(true);
    });
  }
});

describe("sub-processor disclosures do not hardcode a count", () => {
  // "Three sub-processors operate outside the EU" was true when written and
  // silently became false as the register grew. A count in prose has no guard
  // unless it is derived; the fix was to delete the numeral, and this keeps it
  // deleted. The change log quotes the retired sentence on /trust on purpose,
  // so that page carries a budget of exactly one.
  const COUNT =
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b[^.]{0,40}\bsub-?processors?\b/gi;
  const BUDGET: Record<string, number> = { "/trust": 1, "/privacy": 0 };

  it("the count matcher is not inert", () => {
    expect(
      "Three of our sub-processors operate outside the EU.".match(COUNT),
    ).toHaveLength(1);
  });

  for (const route of Object.keys(REGIONS)) {
    it(`${route} carries no more than its budgeted count phrases`, () => {
      const text = strip(builtPage(route));
      const hits = text.match(COUNT) ?? [];
      expect(
        hits.length,
        `${route} states a number of sub-processors in prose: ` +
          `${JSON.stringify(hits)}. Enumerate them instead — a numeral drifts ` +
          `the moment the register grows, and nothing here can derive it.`,
      ).toBeLessThanOrEqual(BUDGET[route]);
    });
  }
});
