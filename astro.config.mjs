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
    }),
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});