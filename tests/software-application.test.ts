import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  PLAN_OFFERS,
  buildSoftwareApplicationJsonLd,
  softwareApplicationJsonLd,
} from "../src/data/software-application";

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
