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

export const collections = { blog };
