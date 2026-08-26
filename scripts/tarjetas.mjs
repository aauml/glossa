#!/usr/bin/env node
// Dibuja la tarjeta de compartir de cada pieza y de cada número, y la sube.
//
// Se ejecuta AL PUBLICAR, no al pedirla: una pieza se reescribe rara vez, y
// cuando se reescribe se vuelve a dibujar (`--force`). Así el enlace que se
// manda no depende de que un servicio de imágenes esté vivo en ese momento.
//
//   node scripts/tarjetas.mjs                 # las que falten
//   node scripts/tarjetas.mjs --force         # todas otra vez
//   node scripts/tarjetas.mjs --solo=mi-slug  # una
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { tarjeta } from '../src/lib/tarjeta.mjs';

const URL_SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }

const FORCE = process.argv.includes('--force');
const SOLO = (process.argv.find(a => a.startsWith('--solo=')) || '').split('=')[1] || null;

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function existe(ruta) {
  const r = await fetch(`${URL_SB}/storage/v1/object/info/public/og/${ruta}`, { headers: H });
  return r.ok;
}

async function subir(ruta, png) {
  const r = await fetch(`${URL_SB}/storage/v1/object/og/${ruta}`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'image/png', 'x-upsert': 'true', 'cache-control': 'max-age=604800' },
    body: png,
  });
  if (!r.ok) throw new Error(`subiendo ${ruta}: ${r.status} ${(await r.text()).slice(0, 160)}`);
}

/**
 * El `dek` de una pieza no cabe entero. Se prefiere su primera frase; si no
 * hay punto —el caso normal, son frases largas de una sola oración— se corta
 * por el último espacio y se dice que sigue.
 *
 * Cortar a pelo por caracteres partía la palabra: la primera tarjeta acabó en
 * «the insurance-and-mining clock that bl».
 */
function resumir(dek, tope = 165) {
  const t = String(dek).replace(/\s+/g, ' ').trim();
  if (t.length <= tope) return t;
  // El punto de una abreviatura NO termina la frase: cortar por «(?<=\.)\s»
  // dejaba «entre lo que produce EE.UU.» —media idea— y en inglés haría lo
  // mismo con «U.S.». Se exige que antes del punto haya tres letras minúsculas,
  // que es lo que distingue una palabra de una sigla.
  const frase = t.split(/(?<=[a-záéíóúñü]{3}[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)[0];
  if (frase.length <= tope) return frase;
  let corte = t.slice(0, tope);
  corte = corte.slice(0, corte.lastIndexOf(' '));
  // Y no se termina en una palabra vacía: «…a slogan, the…» deja al lector
  // esperando el sustantivo que no llega.
  const VACIAS = /\s+(the|a|an|and|or|of|to|in|for|that|with|from|by|on|el|la|los|las|un|una|y|o|de|del|que|con|para|por|en)$/i;
  while (VACIAS.test(corte)) corte = corte.replace(VACIAS, '');
  return corte.replace(/[,;:]$/, '') + '…';
}

/** Frontmatter mínimo: solo los campos que la tarjeta necesita. */
function frontmatter(txt) {
  const m = /^---\n([\s\S]*?)\n---/.exec(txt);
  if (!m) return {};
  const out = {};
  for (const linea of m[1].split('\n')) {
    const kv = /^(issue|date|title|dek|source):\s*(.+)$/.exec(linea);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

let hechas = 0, saltadas = 0;

// ── Las piezas ───────────────────────────────────────────────────────────
const DIR = 'src/content/articles';
for (const slug of readdirSync(DIR)) {
  if (SOLO && SOLO !== slug) continue;
  for (const lang of ['en', 'es']) {
    const f = `${DIR}/${slug}/${lang}.mdx`;
    if (!existsSync(f)) continue;
    const ruta = `articles/${slug}-${lang}.png`;
    if (!FORCE && await existe(ruta)) { saltadas++; continue; }
    const fm = frontmatter(readFileSync(f, 'utf8'));
    if (!fm.title) { console.log(`  sin título: ${f}`); continue; }
    // «N° 43 · 25 August 2026»: el número identifica la pieza dentro de la
    // colección y la fecha dice si es de esta semana o de hace un año.
    const pie = [fm.issue, fm.date].filter(Boolean).join(' · ').toUpperCase();
    const sumario = resumir(fm.dek || '');
    await subir(ruta, await tarjeta({ titulo: fm.title, fecha: pie, lang, sumario, fuente: fm.source || '' }));
    hechas++; console.log(`  ${ruta}`);
  }
}

// ── Los números de la revista ────────────────────────────────────────────
const r = await fetch(
  // Los borradores también: la tarjeta tiene que existir ANTES de que él pulse
  // publicar, no después. Y solo los diez últimos — los viejos ya la tienen.
  `${URL_SB}/rest/v1/glossa_radar_weekly?select=week_start,week_end,body,body_es,state&order=week_start.desc&limit=10`,
  { headers: H });
const numeros = r.ok ? await r.json() : [];
for (const num of numeros) {
  if (SOLO && SOLO !== num.week_start) continue;
  for (const [lang, cuerpo] of [['en', num.body], ['es', num.body_es]]) {
    if (!cuerpo?.headline) continue;   // sin traducir todavía: no hay qué dibujar
    const ruta = `weekly/${num.week_start}-${lang}.png`;
    if (!FORCE && await existe(ruta)) { saltadas++; continue; }
    const loc = lang === 'es' ? 'es-MX' : 'en-GB';
    const opt = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' };
    const a = new Date(`${num.week_start}T12:00:00Z`), b = new Date(`${num.week_end}T12:00:00Z`);
    const mismoMes = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
    const pie = mismoMes
      ? `${a.toLocaleDateString(loc, { day: 'numeric', timeZone: 'UTC' })}–${b.toLocaleDateString(loc, opt)}`
      : `${a.toLocaleDateString(loc, opt)} – ${b.toLocaleDateString(loc, opt)}`;
    // El sumario del número son los asuntos de sus piezas, tal cual y en su
    // orden: ya vienen escritos en dos o tres palabras para el índice.
    const temas = (cuerpo.pieces ?? []).map(x => x.subject).filter(Boolean);
    const marca = lang === 'es' ? 'SEMANAL' : 'WEEKLY';
    await subir(ruta, await tarjeta({ titulo: cuerpo.headline, fecha: `${marca} · ${pie.toUpperCase()}`, lang, temas }));
    hechas++; console.log(`  ${ruta}`);
  }
}

console.log(`${hechas} dibujada(s), ${saltadas} ya estaban${FORCE ? ' (--force: se rehicieron)' : ''}`);
