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

import { availableConnectors } from "./connectors";

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
    // ⚠️ Free is capped on BOTH metered dimensions and both are enforced today
    // (prod `plans`, 2026-09-07: `hard_cap_bytes=t` at 10 GiB AND
    // `hard_cap_runs=t` at 500). This answer named only the volume half for
    // five weeks, so a Free user blocked on runs read it and learned nothing —
    // landing#396's own point #1, which survived the option-(c) enforcement work.
    question: "What happens if I exceed my volume quota?",
    answer:
      "Free is hard-capped on both dimensions — 10 GB and 500 model runs. Pro and Enterprise bill overage at $0.50/GB and $0.25/GB at the end of the cycle, and block on neither.",
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
      `Yes — Free includes 1 seat, 5 connections, 2 schedules, 10 GB/mo processed and 500 model runs/mo (both hard-capped). No card. All ${availableConnectors.length} connectors work on every plan.`,
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
      `No. Unlike Fivetran's per-connection minimums, Datanika bills per GB processed only. All ${availableConnectors.length} connectors work on every plan — including Free. Use as many as you need.`,
  },
  {
    question: "Can I change plans anytime?",
    answer:
      "Yes. Upgrade or downgrade from the billing page. Prorated charges are handled automatically by Paddle. No contracts, no cancellation fees — cancel whenever you want.",
  },
  {
    question: "Is there a trial for Pro?",
    answer:
      // ⚠️ Said "effectively an unlimited trial of core features" until 2026-09-02.
      // Every fact survives; the ambiguous word does not. It sat one clause after
      // "(10 GB/mo)" on the one tier that genuinely hard-blocks, so it was true
      // about the duration and false about the dimension printed beside it.
      // SPEC_PRICING_V2 §4.3 as revised on landing#368.
      "No separate Pro trial. Free is the evaluation — 10 GB and 500 model runs a month, no time limit, no card. For Pro-scale limits (100 GB, 5 seats), contact us — we can extend Free.",
  },
  // --- GA4: V2 migration/explainer FAQ entries (added 2026-04-16) ---
  {
    question: "Why did you change pricing?",
    answer:
      "Our v1 had no volume cap. A single 1 TB customer would cost us more to serve than the $79 bill. We added a GB meter before the first paying customer, not after.",
  },
  {
    // 🚨 "Runs are a secondary fair-use limit" was true of four of the five
    // plan rows and FALSE of the one every visitor starts on. Measured on prod
    // 2026-09-07: `hard_cap_runs` is `f` on pro-monthly/pro-annual/
    // enterprise-monthly/enterprise-annual — fair use, never blocks — and `t`
    // on `free`, where `check_run_quota` raises at 500. The sentence shipped in
    // the FAQPage JSON-LD, so it was machine-readable as well as visible.
    question: "I read about your old per-run pricing. Is that still accurate?",
    answer:
      "No — V2 bills on GB. Runs are fair-use on Pro and Enterprise and never block. On Free they are still a hard cap: 500 runs a month stops pipelines exactly as 10 GB does.",
  },
  {
    // "Pipelines pause once you pass it" is deliberate and is the precise
    // behaviour: no caller supplies `predicted_bytes` (zero producers in core,
    // measured on the serving image), so the byte gate is Path B —
    // allow-then-block — and one run may cross before the next is refused.
    // The 500-run gate is Path A (`predicted_runs=1` from uploads and
    // transformations), so that one stops exactly at the number.
    question: "What happens at my 10 GB Free cap?",
    answer:
      "Pipelines pause once you pass it, and the 500-run cap behaves the same way. No overage charges on Free — both are hard caps. Upgrade to Pro mid-cycle to unlock 100 GB.",
  },
  {
    question: "What is the difference between a GB and a row?",
    answer:
      "A row is one record; a GB is 1,073,741,824 bytes (2^30) — the binary GB our meter counts, so it is 7.4% more data than a decimal GB. A row can be 100 bytes or 10 KB depending on schema width.",
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
