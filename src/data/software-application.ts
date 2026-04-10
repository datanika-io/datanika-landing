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
 * Prices mirror:
 * - `src/components/Pricing.astro` monthly column
 * - Annual variants from datanika-cloud#6 (Pro $790/yr,
 *   Enterprise from $3,990/yr — ~17% discount vs monthly)
 *
 * No `aggregateRating` yet — Growth has no testimonials. Synthetic
 * ratings trigger Google rich-result penalties; we'll add it when
 * the first 5 real reviews land (tracked in PLAN_HUMAN_LOCKERS.md).
 */

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
    description:
      "1 seat, 5 connections, 2 schedules, 500 model runs per month. All 32 connectors included.",
  },
  {
    name: "Pro (monthly)",
    price: "79",
    priceCurrency: "USD",
    billingDuration: "P1M",
    description:
      "5 seats, 25 connections, unlimited schedules, 15,000 model runs per month. Priority email support.",
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
    description:
      "10 seats, 50 connections, 50,000 model runs, $0.01/run overage, SSO (SAML/OIDC), priority support with SLA.",
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
