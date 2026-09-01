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
// El sitemap solo indexa rutas prerenderizadas, y el semanal se sirve en vivo:
// 49 números publicados y ni uno en el sitemap. Se piden a la base en el
// momento del build (la llave pública solo ve lo publicado, migración 0018) y
// entran como customPages; publicar un número dispara un rebuild vía deploy
// hook (weekly_from_supabase.mjs), así que el sitemap se refresca solo. Si la
// base no contesta en el build, el sitio se construye igual — sin esas rutas,
// como antes, y con la queja en el registro del build.
async function rutasDelSemanal() {
  const URL_SB = process.env.SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY;
  if (!URL_SB || !ANON) return [];
  try {
    const r = await fetch(
      `${URL_SB.replace(/\/$/, '')}/rest/v1/glossa_radar_weekly` +
      `?select=week_start,body_es&state=eq.publicado&order=week_start.desc&limit=200`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const filas = await r.json();
    return [
      'https://glossa.ademas.ai/weekly/',
      ...filas.flatMap(w => [
        `https://glossa.ademas.ai/weekly/${w.week_start}/`,
        ...(w.body_es ? [`https://glossa.ademas.ai/es/weekly/${w.week_start}/`] : []),
      ]),
    ];
  } catch (e) {
    console.error(`[sitemap] el semanal no entra (${String(e).slice(0, 80)})`);
    return [];
  }
}

export default defineConfig({
  // Las tres pestañas viejas se fundieron en una. Un marcador guardado no debe
  // dar 404 por eso.
  site: 'https://glossa.ademas.ai',
  integrations: [mdx(), sitemap({ customPages: await rutasDelSemanal() })],
  adapter: vercel(),
  trailingSlash: 'always',
  build: { format: 'directory' },
});
