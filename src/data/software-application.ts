/**
 * Single source of truth for the Schema.org `SoftwareApplication`
 * structured data emitted on the homepage and pricing page.
 *
 * Growth or RevOps should edit this file when plan prices change.
 * Both `/` and `/pricing` render the same object via the Layout
 * `extraJsonLd` prop, so there's only one place to update.
 *
 * Content owner: Growth (pricing) + Engineering (schema shape).
 * Source: https://github.com/datanika-io/datanika-landing/issues/51.
 *
 * 🚨 **There is no longer a mirror here, and that is the point of #373.**
 *
 * This header used to read *"Prices mirror: `src/components/Pricing.astro`
 * monthly column"*, and nothing checked it. The V2 bytes cutover rewrote the
 * visible column on 2026-04-20 and left these descriptions saying *"500 model
 * runs per month"* and *"$0.01/run overage"* — a superseded pricing model, for
 * four months, in the field search engines and AI assistants read first.
 *
 * The connector count in the same object never drifted, because it is
 * `${connectors.length}`. The bound half survived the pivot; the copied half
 * rotted. So the plan facts now come from `src/data/pricing-tiers.ts`, the same
 * array `Pricing.astro` renders, and `tests/software-application.test.ts` fails
 * on any number in a description that is absent from the tier it describes.
 *
 * Annual variants are from datanika-cloud#6 (Pro $790/yr, Enterprise from
 * $3,990/yr — ~17% discount vs monthly).
 *
 * No `aggregateRating` yet — Growth has no testimonials. Synthetic
 * ratings trigger Google rich-result penalties; we'll add it when
 * the first 5 real reviews land (tracked in PLAN_HUMAN_LOCKERS.md).
 */

import { connectors } from "./connectors";
import { tiers, type PricingTier } from "./pricing-tiers";

/** The tier `Pricing.astro` renders under this name. Throws rather than drifting. */
function tier(name: string): PricingTier {
  const t = tiers.find((x) => x.name === name);
  if (!t) throw new Error(`No pricing tier named "${name}" in src/data/pricing-tiers.ts`);
  return t;
}

/**
 * Pull one feature line out of a tier by a stable substring, so the offer
 * description quotes the rendered copy instead of paraphrasing it.
 *
 * Matching on a substring rather than an index is deliberate: an index would
 * silently point at the wrong bullet the first time someone reorders the list,
 * which is exactly the failure mode this file is being rescued from.
 */
function feature(t: PricingTier, needle: string): string {
  const hit = t.features.find((f) => f.toLowerCase().includes(needle.toLowerCase()));
  if (!hit) throw new Error(`Tier "${t.name}" has no feature matching "${needle}"`);
  return hit.trim();
}

/** `"10 GB processed / month"` → `"10 GB processed/month"`, for prose. */
const tidy = (s: string) => s.replace(/\s*\/\s*/g, "/");

function describeMonthly(name: string, needles: string[]): string {
  const t = tier(name);
  const facts = needles.map((n) => tidy(feature(t, n))).join(", ");
  return `${facts}. All ${connectors.length} connectors included on every plan.`;
}

export interface OfferData {
  /** Plan name shown in the SERP card. */
  name: string;
  /** Price as a string (numeric, no currency symbol). */
  price: string;
  /** ISO 4217 currency code. */
  priceCurrency: string;
  /** ISO 8601 duration: `P1M` for monthly, `P1Y` for annual. */
  billingDuration: "P1M" | "P1Y";
  /**
   * Human-readable short description of what the plan includes.
   * Shows up under the price in some rich-result layouts.
   */
  description: string;
}

export const PLAN_OFFERS: OfferData[] = [
  {
    name: "Free",
    price: "0",
    priceCurrency: "USD",
    billingDuration: "P1M",
    description: describeMonthly("Free", [
      "GB processed",
      "team member",
      "connections",
      "schedules",
    ]),
  },
  {
    name: "Pro (monthly)",
    price: "79",
    priceCurrency: "USD",
    billingDuration: "P1M",
    description: describeMonthly("Pro", [
      "GB processed",
      "GB overage",
      "team members",
      "connections",
      "schedules",
    ]),
  },
  {
    name: "Pro (annual)",
    price: "790",
    priceCurrency: "USD",
    billingDuration: "P1Y",
    description:
      "Pro plan billed yearly — save ~17% vs monthly ($66/mo effective).",
  },
  {
    name: "Enterprise (monthly)",
    price: "399",
    priceCurrency: "USD",
    billingDuration: "P1M",
    description: describeMonthly("Enterprise", [
      "TB processed",
      "GB overage",
      "team members included",
      "connections",
      "SSO",
    ]),
  },
  {
    name: "Enterprise (annual)",
    price: "3990",
    priceCurrency: "USD",
    billingDuration: "P1Y",
    description:
      "Enterprise plan billed yearly — save ~17% vs monthly ($333/mo effective).",
  },
];

/**
 * Build the Schema.org SoftwareApplication object for Datanika.
 * Re-exported so tests can inspect the exact shape without having
 * to diff built HTML.
 */
export function buildSoftwareApplicationJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Datanika",
    description:
      "Open-source data pipeline platform combining dlt (extract + load), dbt (transform), and built-in scheduling in a single UI. Self-hostable or SaaS.",
    url: "https://app.datanika.io",
    // Per plans/SEO_KEYWORDS.md — Datanika is a business-data platform
    // targeted at SMB analytics and data teams, so BusinessApplication
    // is the correct primary category. Per-connector pages may use
    // DeveloperApplication for database/file/streaming connectors.
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Data Pipeline Platform",
    operatingSystem: "Web",
    offers: PLAN_OFFERS.map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      price: offer.price,
      priceCurrency: offer.priceCurrency,
      description: offer.description,
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: offer.price,
        priceCurrency: offer.priceCurrency,
        billingDuration: offer.billingDuration,
      },
    })),
    publisher: {
      "@type": "Organization",
      name: "Datanika",
      url: "https://datanika.io",
      logo: {
        "@type": "ImageObject",
        url: "https://datanika.io/logo.png",
      },
    },
    // Deliberately no `aggregateRating` — see file header.
  };
}

/** Pre-built schema object for direct consumption by pages. */
export const softwareApplicationJsonLd = buildSoftwareApplicationJsonLd();
