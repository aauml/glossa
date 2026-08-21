import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://glossa.ademas.ai',
  integrations: [mdx(), react(), sitemap()],
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
