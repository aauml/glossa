// traducir_from_supabase.mjs — el número en español.
//
// Vive aparte del guion que escribe el número, y esa separación se ganó
// midiéndola: traducir es otra llamada de ~14 minutos a la misma cuenta, que
// admite UNA petición a la vez. Colgada del guion que escribe, convertía treinta
// minutos en cincuenta y dejaba esperando la publicación de un número ya
// terminado. Aquí, si se atasca, no retrasa nada: el inglés ya está publicado.
//
// Las comillas NO se traducen (D-020). Y no es una promesa: el fusible corre
// sobre la traducción y compara cada frase entrecomillada con el material, que
// está en inglés. Una cita traducida sale como «cita sin procedencia».
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, MOONSHOT_API_KEY.

import https from 'node:https';
import { revisar } from '../src/lib/fusible.js';
import { promptTraduccion } from './prompts_weekly.mjs';
import { apuntar } from '../src/lib/presupuesto.js';

const URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const MOONSHOT = process.env.MOONSHOT_API_KEY || '';
const MODELO = process.env.WEEKLY_MODEL || 'kimi-k3';
if (!URL || !KEY)  { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!MOONSHOT)     { console.error('Falta MOONSHOT_API_KEY'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function sb(path, init = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

// El que toque: el más reciente sin traducir. `SEMANA` fuerza uno concreto.
const semana = process.env.SEMANA;
const [w] = await sb(
  `glossa_radar_weekly?select=week_start,week_end,body,state` +
  (semana ? `&week_start=eq.${semana}` : '&body_es=is.null&order=generated_at.desc') + '&limit=1');

if (!w?.body?.pieces?.length) { console.log('No hay ningún número pendiente de traducir.'); process.exit(0); }
console.log(`Traduciendo «${w.body.headline}» · ${w.body.pieces.length} piezas · semana ${w.week_start}`);

const pedir = (prompt, intento = 0) => new Promise((ok, ko) => {
  const cuerpo = JSON.stringify({ model: MODELO, max_tokens: 64000,
    messages: [{ role: 'user', content: prompt }] });
  const req = https.request({
    hostname: 'api.moonshot.ai', path: '/v1/chat/completions', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo),
               Authorization: `Bearer ${MOONSHOT}` },
  }, res => {
    let b = ''; res.setEncoding('utf8'); res.on('data', c => { b += c; });
    res.on('end', () => (res.statusCode < 300 ? ok(b)
      : ko(Object.assign(new Error(`moonshot ${res.statusCode}: ${b.slice(0, 300)}`), { status: res.statusCode }))));
  });
  req.on('error', ko);
  req.setTimeout(35 * 60_000, () => req.destroy(new Error('sin respuesta en 35 min')));
  req.end(cuerpo);
}).catch(async (e) => {
  // La cuenta admite una petición a la vez: si el número se está escribiendo,
  // esto espera en vez de morir.
  if (!(e.status === 429 || e.status === 503) || intento >= 3) throw e;
  const espera = [60, 240, 600][intento] * 1000;
  console.log(`  ${String(e.message).slice(0, 60)} — reintento en ${espera / 60000} min`);
  await new Promise(r => setTimeout(r, espera));
  return pedir(prompt, intento + 1);
});

const numero = { ...w.body };
delete numero.sources_index;                    // son ids, no texto que traducir

const t0 = Date.now();
const d = JSON.parse(await pedir(promptTraduccion(numero)));
const uso = d.usage || {};
let txt = (d.choices?.[0]?.message?.content || '').trim()
  .replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
txt = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1);
const es = JSON.parse(txt);

await apuntar(URL, KEY, 'moonshot', 1, uso.total_tokens ?? 0,
              ((uso.prompt_tokens ?? 0) / 1e6) * 0.6 + ((uso.completion_tokens ?? 0) / 1e6) * 2.5);
console.log(`  ${Math.round((Date.now() - t0) / 1000)}s · ${uso.total_tokens} tok`);

// Mismas piezas, mismos ids: una traducción que pierde una pieza no es la misma
// revista, y el índice de fuentes dejaría de cuadrar.
if ((es.pieces ?? []).length !== w.body.pieces.length) {
  console.error(`La traducción trae ${(es.pieces ?? []).length} piezas y el original ${w.body.pieces.length}. No se guarda.`);
  process.exit(1);
}

// El fusible sobre el español. Es lo que hace COMPROBABLE que no tocó las citas.
const desde = new Date(`${w.week_start}T00:00:00Z`);
const hasta = new Date(desde); hasta.setUTCDate(hasta.getUTCDate() + 8);
const items = await sb(
  `glossa_radar_items?select=id,title,digest,origin,lang&state=eq.digested` +
  `&published_at=gte.${desde.toISOString()}&published_at=lt.${hasta.toISOString()}&limit=500`);
const cotejos = await sb(
  `glossa_radar_cotejos?select=item_id,claim_idx,claim_text,title,verdict,verdict_reason,url,` +
  `source_domain,published_date,independence&created_at=gte.${desde.toISOString()}&limit=500`);
const indice = w.body.sources_index ?? {};
const veredicto = revisar(es, { items, cotejos: cotejos ?? [], ids: new Set(Object.keys(indice)),
                                indice, reportaje_count: 1 });
const graves = veredicto.fallos.filter(f => f.grave);
console.log(graves.length
  ? `  el fusible marca ${graves.length} fallo(s) grave(s) en la traducción`
  : '  el fusible pasa: las citas siguen intactas');
for (const f of veredicto.fallos.slice(0, 5)) console.log(`    ${f.grave ? '✗' : '·'} ${f.regla}: ${String(f.detalle).slice(0, 85)}`);

// Una traducción que tocó las citas NO se guarda. Servirla sería publicar en
// español justo lo que el número en inglés se negó a publicar.
if (graves.some(f => f.regla === 'cita sin procedencia' || f.regla === 'cita traducida'
                  || f.regla === 'cita de paráfrasis')) {
  console.error('\nLa traducción alteró alguna cita. No se guarda; el número en inglés no se toca.');
  process.exit(1);
}

await sb(`glossa_radar_weekly?week_start=eq.${w.week_start}`, {
  method: 'PATCH', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({
    body_es: { ...es, sources_index: indice },
    traducido_at: new Date().toISOString(),
    fuse_es: { ...veredicto, ran_at: new Date().toISOString() },
  }),
});
console.log(`\nGuardado · «${es.headline}»`);
console.log(`https://glossa.ademas.ai/es/weekly/${w.week_start}/`);
