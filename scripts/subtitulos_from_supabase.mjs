// subtitulos_from_supabase.mjs — leer en vez de mirar.
//
// Hasta ahora, para saber qué se dijo en un episodio se le mandaba el VÍDEO a un
// modelo. YouTube ya escribió ese texto y lo regala. Medido sobre los mismos
// episodios: 7.621 tokens contra 65.918, 17.315 contra 77.888, 30.978 contra
// 118.447. Cuatro veces más ligero, y sin esperar a que nadie procese hora y
// media de imagen.
//
// No toca el radar. Éste deja el texto puesto en `body_text` y el radar, que ya
// decide por el dato y no por la etiqueta, lo analiza como texto. Los vídeos sin
// subtítulos siguen yendo por el camino de siempre.
//
// Vive en un Action porque `yt-dlp` es un binario y una edge function no puede
// ejecutarlo.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';

const ejecutar = promisify(execFile);
const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const TANDA = Number(process.env.SUBS_BATCH || 25);

async function sb(path, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

/** De VTT a texto corrido. Los subtítulos automáticos repiten cada línea varias
 *  veces —así es como se ve el efecto de ir apareciendo— y sin quitarlo el texto
 *  sale tres veces más largo de lo que se dijo. */
function texto(vtt) {
  const lineas = vtt.split(/\r?\n/)
    .filter(l => l && !l.includes('-->') &&
      !/^(WEBVTT|Kind:|Language:|NOTE|\d+$)/.test(l.trim()))
    .map(l => l.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);
  const salida = [];
  for (const l of lineas) if (l !== salida[salida.length - 1]) salida.push(l);
  return salida.join(' ').replace(/\s+/g, ' ').trim();
}

const pendientes = await sb(
  `glossa_radar_items?select=id,url,title&state=eq.pending&body_text=is.null&captions_at=is.null` +
  `&url=like.*youtu*&order=published_at.desc&limit=${TANDA}`);

if (!pendientes?.length) { console.log('Nada que bajar.'); process.exit(0); }
console.log(`${pendientes.length} episodio(s) sin texto`);

rmSync('/tmp/subs', { recursive: true, force: true });
mkdirSync('/tmp/subs', { recursive: true });

let conTexto = 0, sinSubs = 0, ahorro = 0;

for (const it of pendientes) {
  const carpeta = `/tmp/subs/${it.id}`;
  mkdirSync(carpeta, { recursive: true });
  try {
    // Manuales primero: los automáticos garabatean los nombres propios, y este
    // sistema atribuye afirmaciones a personas concretas.
    await ejecutar('yt-dlp', [
      '--skip-download', '--write-subs', '--write-auto-subs',
      '--sub-langs', 'en.*,es.*', '--sub-format', 'vtt',
      '--no-warnings', '--socket-timeout', '30',
      '-o', `${carpeta}/s.%(ext)s`, it.url,
    ], { timeout: 120_000 });

    const ficheros = readdirSync(carpeta).filter(f => f.endsWith('.vtt'));
    // Un manual gana a un automático: yt-dlp los nombra `.en.vtt` y `.en-orig.vtt`
    // o similar, y el que NO lleva sufijo de idioma generado suele ser el humano.
    ficheros.sort((a, b) => (a.includes('orig') ? 1 : 0) - (b.includes('orig') ? 1 : 0));
    const t = ficheros.length ? texto(readFileSync(`${carpeta}/${ficheros[0]}`, 'utf8')) : '';

    if (t.length > 500) {
      await sb(`glossa_radar_items?id=eq.${it.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ body_text: t.slice(0, 200_000), captions_at: new Date().toISOString() }),
      });
      conTexto++; ahorro += Math.round(t.length / 4);
      console.log(`  ✓ ${Math.round(t.length / 4).toLocaleString().padStart(7)} tok  ${it.title.slice(0, 52)}`);
    } else {
      // Sin subtítulos utilizables. Se marca para no volver a preguntar; el radar
      // lo analizará como vídeo, que sigue funcionando.
      await sb(`glossa_radar_items?id=eq.${it.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ captions_at: new Date().toISOString() }) });
      sinSubs++;
      console.log(`  · sin subtítulos       ${it.title.slice(0, 52)}`);
    }
  } catch (e) {
    // El motivo va entero. «Command failed» no dice nada, y la primera vez que
    // esto falló hubo que volver a lanzarlo solo para averiguar por qué: la causa
    // útil venía en `stderr`, que es justo lo que el mensaje se comía.
    const motivo = String(e.stderr || e.message || e).replace(/\s+/g, ' ').trim();
    await sb(`glossa_radar_items?id=eq.${it.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ captions_at: new Date().toISOString() }) });
    sinSubs++;
    console.log(`  · no se pudo  ${it.title.slice(0, 38)}`);
    console.log(`      ${motivo.slice(0, 300)}`);
  } finally {
    rmSync(carpeta, { recursive: true, force: true });
  }
}

// El vídeo cuesta unos 126.000 tokens por hora al muestreo que usa el radar. Un
// episodio medio ronda la hora, así que cada uno que entra por texto se ahorra
// aproximadamente eso menos lo que ocupa el texto.
const ahorrado = conTexto * 126_000 - ahorro;
console.log(`\n${conTexto} con texto · ${sinSubs} sin subtítulos` +
  (conTexto ? ` · ~${Math.round(ahorrado / 1000)}k tokens de vídeo que no se gastan` : ''));
