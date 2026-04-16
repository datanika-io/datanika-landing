/**
 * Single source of truth for the pricing page FAQ.
 *
 * Consumed by both:
 * - `src/components/FAQ.astro` — renders the visible FAQ section
 * - `src/pages/pricing.astro` — emits matching `FAQPage` JSON-LD
 *
 * Adding, editing, or removing an entry here updates both the rendered
 * DOM and the structured data at the same time.
 *
 * Content owner: Growth. Source: https://github.com/datanika-io/datanika-landing/issues/45.
 * All answers are ≤200 characters for rich-snippet eligibility.
 * Order matters: highest-objection questions come first.
 *
 * DRAFT — Pricing V2 rewrite per SPEC_PRICING_V2.md §6.3. Lives on branch
 * 182-pricing-v2-copy-draft through P1–P4 and merges at P5 cutover day.
 * New V2 entries occupy positions 1–5 (post-pivot highest-objection), and
 * the V1 run-based entries (#1 Free, #5 Enterprise, #6 connectors) are
 * rewritten to the GB shape. Three entries are preserved verbatim: self-host,
 * annual discount, change plans.
 */

export interface FAQItem {
  question: string;
  answer: string;
}

export const pricingFaq: FAQItem[] = [
  {
    question: "What does \"GB processed\" mean?",
    answer:
      "GB processed counts the output bytes after normalization — the amplified number our infrastructure actually touches. A 1 GB JSON blob can become 3 GB of flat tables; we meter the 3 GB.",
  },
  {
    question: "What happens if I exceed my volume quota?",
    answer:
      "Free is hard-capped at 10 GB — runs stop. Pro and Enterprise bill overage at $0.50/GB and $0.25/GB, computed at the end of your billing cycle. No surprise mid-cycle blocks.",
  },
  {
    question: "Does a dbt model re-run count as new volume?",
    answer:
      "Yes — re-running a dbt model re-scans the underlying tables and we meter the scan. ELT mode pushes that work to your warehouse, so most dbt re-runs on ELT pipelines don't add GB.",
  },
  {
    question: "How do you meter \"processed\" — by input or output?",
    answer:
      "Output, after normalization. A 1 GB JSON export becomes ~3 GB of flat tables on ETL; we meter the 3 GB. ELT mode streams compressed parquet, so the same source meters ~0.8 GB.",
  },
  {
    question: "How does this compare to Fivetran's MAR pricing?",
    answer:
      "Fivetran bills per Monthly Active Row, which penalizes wide schemas. We bill per GB — $0.50/GB on Pro, $0.25/GB on Enterprise. See /why-cheaper for a side-by-side GB calculator.",
  },
  {
    question: "Can I use Datanika for free?",
    answer:
      "Yes — Free tier includes 1 seat, 5 connections, 2 schedules, and 10 GB/mo processed (hard-capped). No credit card required. All 32 connectors are available on every plan.",
  },
  {
    question: "Can I self-host Datanika?",
    answer:
      "Yes. The core platform is open-source under AGPL-3.0 and runs in a single `docker compose up`. No Kubernetes required. See the self-hosting guide for setup.",
  },
  {
    question: "Is there an annual discount?",
    answer:
      "Yes — annual billing saves ~17% on Pro and Enterprise. Pro is $66/mo ($790/yr) and Enterprise starts at $333/mo ($3,990/yr). Free stays free. Toggle on the pricing page.",
  },
  {
    question: "What's included in Enterprise?",
    answer:
      "SSO (SAML/OIDC), 50 connections, 1 TB/mo processed with $0.25/GB overage, 10 seats included, and priority support with SLA. Everything Pro has, at volume.",
  },
  {
    question: "Do you charge per connector?",
    answer:
      "No. Unlike Fivetran's per-connection minimums, Datanika bills per GB processed only. All 32 connectors work on every plan — including Free. Use as many as you need.",
  },
  {
    question: "Can I change plans anytime?",
    answer:
      "Yes. Upgrade or downgrade from the billing page. Prorated charges are handled automatically by Paddle. No contracts, no cancellation fees — cancel whenever you want.",
  },
  {
    question: "Is there a trial for Pro?",
    answer:
      "The Free tier (10 GB/mo) is effectively an unlimited trial of core features. For Pro-specific scale limits (100 GB included, 5 seats, 25 connections), contact us — we can extend Free.",
  },
  // --- GA4: V2 migration/explainer FAQ entries (added 2026-04-16) ---
  {
    question: "Why did you change pricing?",
    answer:
      "Our v1 had no volume cap. A single 1 TB customer would cost us more to serve than the $79 bill. We added a GB meter before the first paying customer, not after.",
  },
  {
    question: "I read about your old per-run pricing. Is that still accurate?",
    answer:
      "No. V2 replaces flat run-based pricing with GB-based volume tiers. Runs still exist as a secondary fair-use limit, but GB is the primary billing dimension.",
  },
  {
    question: "What happens at my 10 GB Free cap?",
    answer:
      "Pipelines pause until next month. No overage charges on Free — it is a hard cap. You can upgrade to Pro mid-cycle to unlock 100 GB immediately.",
  },
  {
    question: "What is the difference between a GB and a row?",
    answer:
      "A row is one record; a GB is 1 billion bytes of data. A row can be 100 bytes or 10 KB depending on schema width. We bill per GB because it tracks our real infrastructure cost.",
  },
  {
    question: "Why is ELT cheaper than ETL in your metering?",
    answer:
      "ELT streams compressed parquet to your warehouse — the meter counts ~0.8 GB for the same source that reads 3 GB on ETL. Same rate, fewer billable bytes. See /features/volume-pricing.",
  },
];

/**
 * Build a Schema.org FAQPage JSON-LD object from a list of FAQ items.
 * Used by any page that wants to emit FAQPage structured data.
 */
export function buildFaqPageJsonLd(items: FAQItem[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
