import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://lecturas-ten.vercel.app',
  integrations: [mdx()],
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
