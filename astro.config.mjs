import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://glossa.ademas.ai',
  integrations: [mdx(), sitemap()],
  // El adaptador NO vuelve dinámico el sitio: `output` sigue siendo estático por
  // defecto y las 90 páginas de artículos se siguen prerenderizando. Solo las
  // rutas que declaran `export const prerender = false` —el panel y los crons—
  // corren en vivo. El sitio público no cambia de comportamiento.
  adapter: vercel(),
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
