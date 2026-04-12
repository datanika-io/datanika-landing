// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://datanika.io',
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
