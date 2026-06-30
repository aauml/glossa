import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://glossa.ademas.ai',
  integrations: [mdx(), react()],
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
