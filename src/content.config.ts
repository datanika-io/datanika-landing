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
    verified_by: z.string().default("draft-pending-verification"),
    verified_date: z.string().nullable().default(null),
    related_use_cases: z.array(z.string()).default([]),
    related_comparisons: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, connectors };
