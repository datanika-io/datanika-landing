import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    /** Optional — set when a post is updated after initial publication. */
    updatedDate: z.coerce.date().optional(),
    /**
     * Optional — scheduled publish timestamp. When set and in the future,
     * the post is filtered out of listings, RSS, OG, and static paths.
     * When unset, the post is treated as immediately visible (back-compat).
     * Pair with a daily rebuild cron to auto-publish on the target date.
     */
    publishedAt: z.coerce.date().optional(),
    author: z.string().default("Datanika Team"),
    /** Optional — high-level topic for Article schema `articleSection`. */
    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    heroImage: z.string().default("/logo.png"),
  }),
});

const connectors = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/connectors" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    source: z.string(),
    source_name: z.string(),
    category: z.enum(["database", "saas", "file", "api"]),
    /**
     * 🚨 `verified_date` records WHEN SOMEONE FIRST LOOKED. It does NOT mean
     * the guide is accurate today, and nothing keeps the two in step.
     *
     * Measured 2026-09-10: **34 of 37** guides have a `verified_date` older than
     * the last commit that touched the guide. That is not decay through neglect
     * — it is the opposite. Every correct fix we ship to these files (the #502
     * Test-Connection sweep, the Kafka auth correction, the phantom-nav pass)
     * edits the body and leaves this field alone, so **the more diligently the
     * corpus is maintained, the staler this field becomes.**
     *
     * The field is not rendered on the guide pages — no reader sees a date — so
     * this is not a published claim. It is worse in one specific way: it is
     * internal metadata that LOOKS like a control. A contributor or agent reading
     * `verified_by: product-ui` / `verified_date: 2026-07-19` reasonably infers a
     * live verification process. There was one, once, on that date.
     *
     * ⚠️ Do not "fix" this by bumping the date on content edits. That would make
     * the field assert a verification that did not happen — trading a stale record
     * for a false one, which is the worse of the two. Bump it only when someone
     * has actually walked the guide against the product, and put what they checked
     * in `public/docs/connectors/<slug>/README.md`, which is the provenance record
     * and is date-framed for exactly this reason.
     *
     * 🆕 **The contract this field is held to is `docs/specs/SPEC_CONNECTOR_GUIDE_VERIFICATION.md`**
     * (Product, 2026-09-10). In one line: **verified = a named person completed a real connection
     * and a run using this guide, and recorded it** in
     * `public/docs/connectors/<slug>/README.md`. Everything CI already checks — field parity,
     * phantom nav, screenshot presence, availability — is explicitly **NOT** part of it, because a
     * human check that duplicates a machine check makes this field look like it covers ground it
     * does not.
     *
     * ⚠️ **Set it only in the same change that adds the evidence**, and prefer `null` over a date
     * you cannot point at. Measured 2026-09-10: **36 of 37** guides carry a date and **8** carry the
     * first-run artifact that proves a run completed — so the reported number is **8/37**, not
     * 36/37. A permanent `null` on a source nobody can walk without a paid account is the honest
     * value, not a gap.
     *
     * `verified_by: "draft-pending-verification"` means no one has walked it yet.
     * That is an honest state and it is QA's sign-off queue, not a defect — but a
     * guide in that state can still be `draft: false` and serving publicly, which
     * is true of `openapi` today.
     */
    verified_by: z.string().default("draft-pending-verification"),
    verified_date: z.string().nullable().default(null),
    related_use_cases: z.array(z.string()).default([]),
    related_comparisons: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, connectors };
