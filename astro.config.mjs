// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://datanika.io',
  // Permanent redirects for content moved during the docs IA redesign
  // (issue #105). The old /docs/api and /docs/api-keys pages now live under
  // /api/, with their own ApiLayout, separate from platform docs.
  // Astro emits these as static stubs at the source paths that 301 to the
  // target. Cloudflare honors the meta refresh / canonical at the edge.
  redirects: {
    "/docs/api": "/api/reference",
    "/docs/api-keys": "/api/keys",
    "/docs/api-versioning": "/api/versioning",
  },
  integrations: [
    sitemap({
      // Exclude internal test fixtures from the sitemap.
      filter: (page) => !page.includes("/test-fixtures/"),
      // Per-URL changefreq + priority hints. Search engines treat these as
      // hints, not rules, but well-tuned values help crawl budget allocation.
      serialize(item) {
        const url = new URL(item.url);
        const path = url.pathname;

        if (path === "/" || path === "") {
          item.changefreq = "weekly";
          item.priority = 1.0;
        } else if (path.startsWith("/blog/")) {
          item.changefreq = "weekly";
          item.priority = 0.8;
        } else if (path === "/ai-agents/" || path === "/ai-agents") {
          item.changefreq = "monthly";
          item.priority = 0.8;
        } else if (path === "/templates" || path === "/templates/" || path.startsWith("/templates/")) {
          // Templates target late-funnel commercial queries — higher priority
          // than connector/use-case pages (0.7) but below pricing (0.9).
          item.changefreq = "monthly";
          item.priority = 0.8;
        } else if (path.startsWith("/connectors/") || path.startsWith("/use-cases/") || path.startsWith("/compare/")) {
          item.changefreq = "monthly";
          item.priority = 0.7;
        } else if (path.startsWith("/docs/")) {
          item.changefreq = "monthly";
          item.priority = 0.6;
        } else if (path === "/pricing/" || path === "/pricing") {
          item.changefreq = "monthly";
          item.priority = 0.9;
        } else if (path.startsWith("/terms") || path.startsWith("/privacy") || path.startsWith("/refund")) {
          item.changefreq = "yearly";
          item.priority = 0.3;
        } else {
          item.changefreq = "monthly";
          item.priority = 0.5;
        }
        return item;
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});
