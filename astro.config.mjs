import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://glossa.ademas.ai',
  integrations: [mdx(), sitemap()],
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
