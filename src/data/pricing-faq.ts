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
 */

export interface FAQItem {
  question: string;
  answer: string;
}

export const pricingFaq: FAQItem[] = [
  {
    question: "Can I use Datanika for free?",
    answer:
      "Yes — Free tier includes 1 seat, 5 connections, 2 schedules, and 500 model runs/month. No credit card required. All 32 connectors are available on every plan.",
  },
  {
    question: "How do usage overages work?",
    answer:
      "Free and Pro are hard-capped — runs stop once you hit the limit. Enterprise is soft-capped: $0.01 per model run beyond 50,000/month, so pipelines never stall.",
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
      "Everything in Pro plus SSO (SAML/OIDC), 50 connections, 50,000 model runs/month, overage billing at $0.01/run, 10 seats included, and priority support with SLA.",
  },
  {
    question: "Do you charge per connector?",
    answer:
      "No. Unlike Fivetran's per-connection minimums, Datanika charges by model runs only. All 32 connectors are available on every plan — including Free. Use as many as you need.",
  },
  {
    question: "Can I change plans anytime?",
    answer:
      "Yes. Upgrade or downgrade from the billing page. Prorated charges are handled automatically by Paddle. No contracts, no cancellation fees — cancel whenever you want.",
  },
  {
    question: "Is there a trial for Pro?",
    answer:
      "The Free tier is effectively an unlimited trial of core features. For Pro-specific scale limits (more runs, connections, seats), contact us — we can extend Free if needed.",
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
