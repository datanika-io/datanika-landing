/**
 * The pricing tiers rendered by `src/components/Pricing.astro`, which is on BOTH
 * the homepage and `/pricing/` — so every string here is a claim on two pages.
 *
 * These used to be an inline `const` in that component, mirrored by hand into
 * `src/data/software-application.ts` under a header saying so and nothing that
 * checked it. The V2 cutover rewrote the visible column and left the mirror
 * describing V1 runs-based pricing for four months (#373). The offers are now
 * built from this array; `tests/software-application.test.ts` fails on any
 * number in the structured data that is absent from the tier it describes.
 *
 * Contract: `docs/specs/SPEC_PRICING_V2.md`. ⚠️ Model runs are a secondary,
 * non-billed fair-use quota (§3.2) and must never lead the copy.
 * ⚠️ No compliance bullet — see `tests/compliance-claims.test.ts`, which pins
 * this file by name.
 */export interface PricingTier {
  name: string;
  monthlyPrice: string;
  annualPrice: string;
  period: string;
  annualPeriod: string;
  annualTotal?: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref?: string;
  highlighted: boolean;
}

export const tiers: PricingTier[] = [
  {
    name: "Free",
    monthlyPrice: "$0",
    annualPrice: "$0",
    period: "forever",
    annualPeriod: "forever",
    description: "For evaluation and side projects.",
    features: [
      "10 GB processed / month",
      "1 team member",
      "5 connections",
      "2 schedules",
      "500 model runs / month",
      "All integrations",
      "Social login (Google, GitHub)",
      "Community support",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    monthlyPrice: "$79",
    annualPrice: "$66",
    period: "/month",
    annualPeriod: "/month, billed annually",
    annualTotal: "$790/year",
    description: "For teams running production pipelines.",
    features: [
      "100 GB processed / month",
      "$0.50 / GB overage",
      "5 team members",
      "25 connections",
      "Unlimited schedules",
      "15,000 model runs / month",
      "All integrations",
      "Social login (Google, GitHub)",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    monthlyPrice: "From $399",
    annualPrice: "From $333",
    period: "/month",
    annualPeriod: "/month, billed annually",
    annualTotal: "From $3,990/year",
    // ⚠️ Said "Extra seats at $25/mo each" until 2026-09-02. The price is right;
    // the purchase does not exist. Why, and who owns which half: landing#368 and
    // the header of tests/seat-purchase-claim.test.ts, which pins this line.
    description:
      "For organizations with advanced needs. Additional seats $25/mo each — contact us to add them.",
    features: [
      "1 TB processed / month",
      "$0.25 / GB overage",
      "10 team members included",
      "50 connections",
      "Unlimited schedules",
      "50,000 model runs / month",
      "SSO (SAML/OIDC)",
      // No compliance bullet here. The SOC 2 Type I claim was withdrawn on
      // 2026-08-30 (founder decision) and this component renders on BOTH the
      // homepage and /pricing, so anything added to this list is a claim on two
      // pages at once. Compliance posture lives on /trust, where it can be
      // stated with its caveats. See tests/compliance-claims.test.ts.
      "Priority support with SLA",
    ],
    cta: "Contact Us",
    ctaHref: "mailto:info@datanika.io",
    highlighted: false,
  },
];
