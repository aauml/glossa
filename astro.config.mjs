import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

// Sin adaptador: el sitio es 100 % estático y eso es una propiedad, no un
// detalle. No hay servidor que atacar, ni secretos en el hosting.
//
// El panel de administración vivió aquí unas horas, con contraseña propia. Se
// movió a glossa-panel.ademas.ai (Cloudflare Pages, detrás de Access con código
// por correo) porque Access solo protege tráfico que pasa por el proxy de
// Cloudflare, y glossa.ademas.ai apunta directo a Vercel — como los otros tres
// sitios de Vercel de la cartera. Ponerle ese proxy delante habría arriesgado la
// renovación del certificado de un sitio público que funciona.
export default defineConfig({
  site: 'https://glossa.ademas.ai',
  integrations: [mdx(), sitemap()],
  trailingSlash: 'always',
  build: { format: 'directory' },
});
