import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// Sin adaptador: el sitio es 100 % estático y eso es una propiedad, no un
// detalle. No hay servidor que atacar, ni secretos en el hosting.
//
// El panel de administración vivió aquí unas horas, con contraseña propia. Se
// movió a glossa-panel.ademas.ai (Cloudflare Pages, detrás de Access con código
// por correo) porque Access solo protege tráfico que pasa por el proxy de
// Cloudflare, y glossa.ademas.ai apunta directo a Vercel — como los otros tres
// sitios de Vercel de la cartera. Ponerle ese proxy delante habría arriesgado la
// renovación del certificado de un sitio público que funciona.
// El panel vive en /admin, dentro de este mismo sitio, así que hace falta
// servidor para esas rutas. El adaptador NO vuelve dinámico el resto: las 90
// páginas de artículos siguen prerenderizadas y solo lo que declara
// `prerender = false` corre en vivo.
//
// Hubo una versión del panel en Cloudflare Pages con Access (código por correo).
// Se trajo aquí porque un subdirectorio es más simple que un subdominio, y el
// código por correo se conserva vía Supabase Auth, que ya estaba en el stack.
export default defineConfig({
  // Las tres pestañas viejas se fundieron en una. Un marcador guardado no debe
  // dar 404 por eso.
  // El sitio va con barra final siempre (`trailingSlash: 'always'`), así que
  // declarar las dos formas describe la MISMA ruta dos veces y Astro avisa de
  // colisión. Solo la forma canónica.
  redirects: {
    '/admin/sources/': '/admin/',
    '/admin/inbox/': '/admin/',
  },
  site: 'https://glossa.ademas.ai',
  integrations: [mdx(), sitemap()],
  adapter: vercel(),
  trailingSlash: 'always',
  build: { format: 'directory' },
});
