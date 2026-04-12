/**
 * Build-time Open Graph image generation (#55).
 *
 * Generates 1200×630 PNGs for blog posts, connector pages,
 * use-case pages, and comparison pages. Each page gets a unique
 * image with the Datanika logo, a category badge, the page title,
 * and a subtle brand gradient.
 *
 * Output path: `/og/<collection>/<slug>.png` — consumed by
 * `Layout.astro` as the default `ogImage` for pages that have a
 * collection entry. Legal pages, the 404, and other pages without
 * a collection entry fall back to `/logo.png`.
 *
 * Cloudflare cache rule (`/og/*` → 1 year TTL) is configured in
 * Infrastructure's separate SEO deploy hygiene PR. Keep the output
 * path stable — Infra is keying on `/og/*`.
 */
import { OGImageRoute } from "astro-og-canvas";
import { getCollection } from "astro:content";
import { connectors } from "../../data/connectors";
import { useCases } from "../../data/use-cases";

// ---------------------------------------------------------------------------
// Brand tokens
// ---------------------------------------------------------------------------

const DATANIKA_PURPLE: [number, number, number] = [139, 92, 246]; // violet-500
const DATANIKA_CYAN: [number, number, number] = [34, 211, 238]; // cyan-400
const DATANIKA_BG: [number, number, number] = [10, 10, 15]; // #0a0a0f
const DATANIKA_TEXT: [number, number, number] = [255, 255, 255];
const DATANIKA_MUTED: [number, number, number] = [148, 163, 184]; // slate-400

const LOGO_PATH = "./public/logo.png";

interface PageData {
  /** First line: the category / section badge text. */
  category: string;
  /** Big headline in the middle of the card. */
  title: string;
  /** Optional subline under the title. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Collect all pages that need an OG image
// ---------------------------------------------------------------------------

async function buildPageMap(): Promise<Record<string, PageData>> {
  const pages: Record<string, PageData> = {};

  // Blog posts — read from the `blog` content collection.
  const blogPosts = await getCollection("blog", ({ data }) => !data.draft);
  for (const post of blogPosts) {
    pages[`blog/${post.id}`] = {
      category: (post.data.category ?? "Blog").toUpperCase(),
      title: post.data.title,
      description: post.data.description,
    };
  }

  // Connectors — from data/connectors.ts
  for (const c of connectors) {
    pages[`connectors/${c.slug}`] = {
      category: c.category.toUpperCase(),
      title: `${c.name} Connector`,
      description: c.description.slice(0, 140),
    };
  }

  // Use cases — from data/use-cases.ts
  for (const uc of useCases) {
    pages[`use-cases/${uc.slug}`] = {
      category: "USE CASE",
      title: `${uc.source} → ${uc.destination}`,
      description: uc.description.slice(0, 140),
    };
  }

  // Standalone pages
  pages["pages/ai-agents"] = {
    category: "AI AGENTS",
    title: "AI Data Pipeline — Agent-Native ETL",
    description: "Build data pipelines with Claude, GPT, or any LLM agent",
  };

  // Compare pages — static list matching src/pages/compare/*.astro
  const competitors: Array<{ slug: string; name: string }> = [
    { slug: "airbyte", name: "Airbyte" },
    { slug: "fivetran", name: "Fivetran" },
    { slug: "stitch", name: "Stitch" },
    { slug: "hevo", name: "Hevo Data" },
  ];
  for (const comp of competitors) {
    pages[`compare/${comp.slug}`] = {
      category: "COMPARE",
      title: `Datanika vs ${comp.name}`,
      description: `Open-source ELT alternative to ${comp.name}`,
    };
  }

  return pages;
}

const pages = await buildPageMap();

// ---------------------------------------------------------------------------
// OG image route
// ---------------------------------------------------------------------------

export const { getStaticPaths, GET } = await OGImageRoute({
  param: "route",
  pages,
  getImageOptions: (_path, page: PageData) => ({
    title: page.title,
    description: page.description,
    logo: {
      path: LOGO_PATH,
      size: [80],
    },
    bgGradient: [DATANIKA_BG, [20, 16, 40]],
    border: {
      color: DATANIKA_PURPLE,
      width: 8,
      side: "block-end",
    },
    padding: 70,
    font: {
      title: {
        color: DATANIKA_TEXT,
        size: 72,
        weight: "ExtraBold",
        lineHeight: 1.15,
      },
      description: {
        color: DATANIKA_MUTED,
        size: 34,
        weight: "Normal",
        lineHeight: 1.4,
      },
    },
    // Inter fonts — self-hosted under public/fonts/inter/ to avoid
    // build-time CDN dependency and keep OG generation reproducible.
    // Sources: fontsource.org (SIL Open Font License 1.1).
    fonts: [
      "./public/fonts/inter/Inter-Regular.ttf",
      "./public/fonts/inter/Inter-Bold.ttf",
      "./public/fonts/inter/Inter-ExtraBold.ttf",
    ],
    format: "PNG",
    // Cache generated images across dev rebuilds.
    cacheDir: "./node_modules/.astro-og-canvas",
  }),
});
