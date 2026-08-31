import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  PLAN_OFFERS,
  buildSoftwareApplicationJsonLd,
  softwareApplicationJsonLd,
} from "../src/data/software-application";
import { tiers } from "../src/data/pricing-tiers";
import { connectors } from "../src/data/connectors";

const DIST = resolve(__dirname, "../dist");

function readHtml(path: string): string {
  const file = resolve(DIST, path);
  if (!existsSync(file)) throw new Error(`Built file not found: ${file}`);
  return readFileSync(file, "utf-8");
}

// ---------------------------------------------------------------------------
// Source data
// ---------------------------------------------------------------------------

describe("software-application source data (#51)", () => {
  it("has exactly 5 offers: Free, Pro monthly, Pro annual, Enterprise monthly, Enterprise annual", () => {
    expect(PLAN_OFFERS.length).toBe(5);
    const names = PLAN_OFFERS.map((o) => o.name);
    expect(names).toContain("Free");
    expect(names).toContain("Pro (monthly)");
    expect(names).toContain("Pro (annual)");
    expect(names).toContain("Enterprise (monthly)");
    expect(names).toContain("Enterprise (annual)");
  });

  it("monthly prices match the pricing page copy", () => {
    const byName = Object.fromEntries(PLAN_OFFERS.map((o) => [o.name, o]));
    expect(byName["Free"].price).toBe("0");
    expect(byName["Pro (monthly)"].price).toBe("79");
    expect(byName["Enterprise (monthly)"].price).toBe("399");
  });

  it("annual prices match cloud#6: Pro $790/yr, Enterprise $3990/yr", () => {
    const byName = Object.fromEntries(PLAN_OFFERS.map((o) => [o.name, o]));
    expect(byName["Pro (annual)"].price).toBe("790");
    expect(byName["Pro (annual)"].billingDuration).toBe("P1Y");
    expect(byName["Enterprise (annual)"].price).toBe("3990");
    expect(byName["Enterprise (annual)"].billingDuration).toBe("P1Y");
  });

  it("annual offers are ~17% cheaper than 12× monthly", () => {
    // Pro: $79 × 12 = $948, annual $790 → 17% off
    // Enterprise: $399 × 12 = $4788, annual $3990 → 17% off
    expect(790 / (79 * 12)).toBeCloseTo(0.833, 2);
    expect(3990 / (399 * 12)).toBeCloseTo(0.833, 2);
  });

  it("all offers use USD", () => {
    for (const o of PLAN_OFFERS) {
      expect(o.priceCurrency).toBe("USD");
    }
  });

  it("billingDuration is only P1M or P1Y", () => {
    for (const o of PLAN_OFFERS) {
      expect(["P1M", "P1Y"]).toContain(o.billingDuration);
    }
  });
});

describe("buildSoftwareApplicationJsonLd", () => {
  const ld = buildSoftwareApplicationJsonLd() as {
    "@context": string;
    "@type": string;
    name: string;
    applicationCategory: string;
    operatingSystem: string;
    url: string;
    offers: Array<{
      "@type": string;
      name: string;
      price: string;
      priceSpecification: {
        "@type": string;
        billingDuration: string;
      };
    }>;
    publisher: { "@type": string; name: string };
    aggregateRating?: unknown;
  };

  it("has correct @context and @type", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("SoftwareApplication");
  });

  it("uses BusinessApplication per SEO_KEYWORDS.md mapping", () => {
    expect(ld.applicationCategory).toBe("BusinessApplication");
  });

  it("has operatingSystem: Web and app URL", () => {
    expect(ld.operatingSystem).toBe("Web");
    expect(ld.url).toBe("https://app.datanika.io");
  });

  it("offers array has 5 entries matching PLAN_OFFERS order", () => {
    expect(ld.offers.length).toBe(5);
    for (let i = 0; i < PLAN_OFFERS.length; i++) {
      expect(ld.offers[i]["@type"]).toBe("Offer");
      expect(ld.offers[i].name).toBe(PLAN_OFFERS[i].name);
      expect(ld.offers[i].price).toBe(PLAN_OFFERS[i].price);
      expect(ld.offers[i].priceSpecification["@type"]).toBe(
        "UnitPriceSpecification",
      );
      expect(ld.offers[i].priceSpecification.billingDuration).toBe(
        PLAN_OFFERS[i].billingDuration,
      );
    }
  });

  it("has publisher Organization", () => {
    expect(ld.publisher["@type"]).toBe("Organization");
    expect(ld.publisher.name).toBe("Datanika");
  });

  it("does NOT include aggregateRating (no synthetic ratings)", () => {
    expect(ld.aggregateRating).toBeUndefined();
    expect(JSON.stringify(ld)).not.toContain("aggregateRating");
  });
});

// ---------------------------------------------------------------------------
// Rendered pages
// ---------------------------------------------------------------------------

describe("/ emits SoftwareApplication JSON-LD (#51)", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("index.html");
  });

  it("contains SoftwareApplication schema", () => {
    expect(html).toContain('"@type":"SoftwareApplication"');
  });

  it("has exactly 5 Offer entries", () => {
    const matches = html.match(/"@type":"Offer"/g);
    expect(matches?.length).toBe(5);
  });

  it("has applicationCategory BusinessApplication", () => {
    expect(html).toContain('"applicationCategory":"BusinessApplication"');
  });

  it("does not emit aggregateRating", () => {
    expect(html).not.toContain("aggregateRating");
  });

  it("includes all plan prices", () => {
    expect(html).toContain('"price":"0"');
    expect(html).toContain('"price":"79"');
    expect(html).toContain('"price":"790"');
    expect(html).toContain('"price":"399"');
    expect(html).toContain('"price":"3990"');
  });
});

describe("/pricing emits SoftwareApplication + FAQPage JSON-LD (#51)", () => {
  let html: string;
  beforeAll(() => {
    html = readHtml("pricing/index.html");
  });

  it("contains SoftwareApplication schema", () => {
    expect(html).toContain('"@type":"SoftwareApplication"');
  });

  it("still emits FAQPage alongside SoftwareApplication", () => {
    expect(html).toContain('"@type":"FAQPage"');
  });

  it("has 5 Offer entries", () => {
    const matches = html.match(/"@type":"Offer"/g);
    expect(matches?.length).toBe(5);
  });

  it("does not emit aggregateRating", () => {
    expect(html).not.toContain("aggregateRating");
  });

  it("applicationCategory matches SEO_KEYWORDS mapping", () => {
    expect(html).toContain('"applicationCategory":"BusinessApplication"');
  });
});

// ---------------------------------------------------------------------------
// Consistency: other pages should NOT emit SoftwareApplication
// ---------------------------------------------------------------------------

describe("SoftwareApplication is scoped to / and /pricing only", () => {
  it("does not leak onto the blog index", () => {
    const html = readHtml("blog/index.html");
    expect(html).not.toContain('"@type":"SoftwareApplication"');
  });

  it("does not leak onto a connector page", () => {
    const html = readHtml("connectors/postgresql/index.html");
    expect(html).not.toContain('"@type":"SoftwareApplication"');
  });
});

// Re-export check — confirm the singleton is a cached result of the builder
describe("softwareApplicationJsonLd export", () => {
  it("matches buildSoftwareApplicationJsonLd() output", () => {
    expect(softwareApplicationJsonLd).toEqual(
      buildSoftwareApplicationJsonLd(),
    );
  });
});

// ---------------------------------------------------------------------------
// #373 — the offers were a hand-maintained mirror, and it rotted
// ---------------------------------------------------------------------------

/**
 * `PLAN_OFFERS` descriptions used to be prose copies of `Pricing.astro`'s
 * monthly column, under a header that said so and nothing that checked it. The
 * V2 bytes cutover (2026-04-20) rewrote the visible column and left the copies
 * describing **V1 runs-based pricing** — "500 model runs per month", "15,000
 * model runs per month", "$0.01/run overage" — for four months, on the
 * homepage and `/pricing/`, in the field search engines read first.
 *
 * The connector count in the same object never drifted, because it was
 * `${connectors.length}`. These tests exist to make the rest of the object
 * behave like the count.
 */
describe("offer descriptions are bound to the rendered tiers (#373)", () => {
  const MONTHLY: [offer: string, tier: string][] = [
    ["Free", "Free"],
    ["Pro (monthly)", "Pro"],
    ["Enterprise (monthly)", "Enterprise"],
  ];

  it("every number in a monthly offer description appears in that tier's rendered copy", () => {
    const drift: string[] = [];
    for (const [offerName, tierName] of MONTHLY) {
      const offer = PLAN_OFFERS.find((o) => o.name === offerName)!;
      const t = tiers.find((x) => x.name === tierName)!;
      // The tier's own strings, plus the derived connector count the copy cites.
      const rendered = [t.monthlyPrice, ...t.features, String(connectors.length)]
        .join(" | ")
        .toLowerCase();
      for (const n of offer.description.match(/\d[\d,.]*\d|\d/g) ?? []) {
        if (!rendered.includes(n.toLowerCase())) {
          drift.push(`"${offerName}" claims ${n}, absent from the ${tierName} tier`);
        }
      }
    }
    expect(
      drift,
      "A number reached the structured data that is not on the pricing page. Build the " +
        "description from src/data/pricing-tiers.ts rather than restating it.\n" +
        drift.join("\n"),
    ).toEqual([]);
  });

  it("no offer prices an overage per run — V2 bills bytes", () => {
    const offenders = PLAN_OFFERS.filter((o) =>
      /\$[\d.]+\s*(\/|per )\s*run\b|runs? overage/i.test(o.description),
    ).map((o) => `${o.name}: ${o.description}`);
    expect(
      offenders,
      "V1's $0.01/run overage was replaced outright by per-GB overage on 2026-04-20.",
    ).toEqual([]);
  });

  it("every monthly offer leads with the included volume, which is the billed dimension", () => {
    for (const [offerName] of MONTHLY) {
      const offer = PLAN_OFFERS.find((o) => o.name === offerName)!;
      expect(
        offer.description,
        `${offerName} must state its included volume; runs are a secondary fair-use ` +
          "quota in V2 (SPEC_PRICING_V2 §3.2) and must never lead.",
      ).toMatch(/\d+\s*(GB|TB)\s+processed/i);
    }
  });
});

// ---------------------------------------------------------------------------
// #373 (second instance) — /refund/ had no return-policy schema
// ---------------------------------------------------------------------------

/**
 * For a Paddle merchant-of-record business, `MerchantReturnPolicy` linked to the
 * Organization is the ordinary trust signal on the refund page, and `/refund/`
 * emitted only the site-wide `Organization` and `WebSite` objects.
 *
 * The assertion that matters is the last one: the window in the schema and the
 * window in the sentence are one constant. A refund window is a **term of
 * sale** — two copies of it disagreeing is worse than two copies of a price.
 */
describe("/refund/ emits a return policy bound to its own copy (#373)", () => {
  let html: string;
  let policy: Record<string, unknown>;

  beforeAll(() => {
    html = readHtml("refund/index.html");
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const parsed = blocks.map((m) => JSON.parse(m[1]));
    policy = parsed.find((o) => o["@type"] === "MerchantReturnPolicy");
  });

  it("emits a MerchantReturnPolicy", () => {
    expect(policy, "/refund/ emits no MerchantReturnPolicy").toBeTruthy();
  });

  it("declares a finite window with a full, free refund", () => {
    expect(policy.returnPolicyCategory).toBe(
      "https://schema.org/MerchantReturnFiniteReturnWindow",
    );
    expect(policy.refundType).toBe("https://schema.org/FullRefund");
    expect(policy.returnFees).toBe("https://schema.org/FreeReturn");
  });

  it("names Paddle as merchant of record, matching the visible copy", () => {
    expect(JSON.stringify(policy)).toContain("Paddle");
    expect(html).toContain("Merchant of Record");
  });

  it("states the same window the page states in prose", () => {
    const days = policy.merchantReturnDays as number;
    expect(days).toBeGreaterThan(0);
    expect(
      html,
      `Schema says ${days} days. The visible §2 sentence must say the same number — ` +
        "both come from REFUND_WINDOW_DAYS in refund.astro, so a mismatch means " +
        "someone reintroduced a second copy.",
    ).toContain(`<strong>${days} days</strong>`);
  });
});
