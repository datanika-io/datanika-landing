// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

/**
 * landing#620: the default Shiki theme, github-dark, colours comments #6A737D, which is 3.05:1 on its
 * #24292e background. WCAG AA asks 4.5:1 for text this size. #959DA5, the next grey in the same
 * palette, is 5.34:1. Every other token colour the theme emits here already passes.
 * tests/a11y-code-contrast.test.ts checks every token colour on the built pages, not only this one.
 */
const readableComments = {
  name: 'readable-comments',
  span(node) {
    const style = node.properties?.style;
    if (typeof style === 'string' && /(^|;)color:#6A737D/i.test(style)) {
      node.properties.style = style.replace(/(^|;)color:#6A737D/gi, '$1color:#959DA5');
    }
  },
};

// https://astro.build/config
export default defineConfig({
  site: 'https://datanika.io',
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      transformers: [readableComments],
    },
  },
  // Permanent redirects for content moved during the docs IA redesign
  // (issue #105). The old /docs/api and /docs/api-keys pages now live under
  // /api/, with their own ApiLayout, separate from platform docs.
  // Astro emits these as static stubs at the source paths that 301 to the
  // target. Cloudflare honors the meta refresh / canonical at the edge.
  redirects: {
    "/docs/api": "/api/reference",
    "/docs/api-keys": "/api/keys",
    "/docs/api-versioning": "/api/versioning",
    // NOTE: `/connectors/google-ads` was redirected here from 2026-07-22 to
    // 2026-08-29 while the connector was withdrawn (core#567). core#592
    // restored it, so the redirect is removed rather than re-pointed — a
    // redirect left in place would outrank the page it shadows. Removing it is
    // the whole reason the 301 was chosen over a 404: the URL kept its equity
    // and now resolves to a real page again.
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
