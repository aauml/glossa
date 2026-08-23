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
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY, XAI_API_KEY,
//      ANTHROPIC_API_KEY (los tres traductores de la cascada; basta con que
//      responda uno).

import { revisar } from '../src/lib/fusible.js';
import { promptTraduccion } from './prompts_weekly.mjs';
import { apuntar } from '../src/lib/presupuesto.js';

const URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL || !KEY)  { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!process.env.GEMINI_API_KEY && !process.env.XAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.error('No hay ninguna clave de traductor: GEMINI_API_KEY, XAI_API_KEY o ANTHROPIC_API_KEY');
  process.exit(1);
}

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

// ── Los traductores, en orden de coste ───────────────────────────────────
//
// No se elige «el mejor modelo»: se comprueba el resultado. Medido sobre este
// mismo número, tres vueltas cada uno, NINGUNO conserva las comillas las tres
// veces —ni Kimi, que costaba diez veces más—. Elegir el mejor seguiría dejando
// sin español una semana de cada tres.
//
// El fusible da un veredicto inmediato y gratis sobre cada intento, así que la
// respuesta no es un modelo perfecto sino una cascada verificada: se prueba el
// más barato, se comprueba, y si tocó una cita se pasa al siguiente. Con dos
// aciertos de cada tres por modelo, tres intentos dan un 96%.
//
// Y el orden lo decide el DESPERDICIO, no el precio de tarifa: para el mismo
// trabajo, Grok sin razonamiento gastó 5.004 tokens de salida, Kimi 41.387 y
// DeepSeek 32.000 sin llegar a emitir una letra —se los comió pensando—. Un
// modelo de razonamiento traduciendo es dinero quemado en pensar lo que no hay
// que pensar.
const TRADUCTORES = [
  { n: 'gemini-3.1-flash-lite',       casa: 'gemini' },   // gratis
  { n: 'grok-4.20-0309-non-reasoning', casa: 'xai'    },   // ~$0.0035
  { n: 'claude-haiku-4-5-20251001',    casa: 'anthropic' },// ~$0.026
];

/** El primer objeto JSON completo: algunos modelos añaden texto después. */
function jsonDeModelo(txt) {
  const limpio = String(txt).replace(/^\s*```(?:json)?/, '').replace(/```\s*$/, '').trim();
  const i = limpio.indexOf('{');
  if (i < 0) throw new SyntaxError('la respuesta no trae ningún objeto');
  let prof = 0, cadena = false, escape = false;
  for (let k = i; k < limpio.length; k++) {
    const c = limpio[k];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { cadena = !cadena; continue; }
    if (cadena) continue;
    if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return JSON.parse(limpio.slice(i, k + 1));
  }
  throw new SyntaxError('objeto sin cerrar — la respuesta se truncó');
}

async function traducirCon(m, prompt) {
  if (m.casa === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.n}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32000 } }),
        signal: AbortSignal.timeout(300_000) });
    const d = await r.json();
    if (!r.ok) throw new Error(`gemini ${r.status}: ${JSON.stringify(d).slice(0, 120)}`);
    return { es: jsonDeModelo((d.candidates?.[0]?.content?.parts ?? []).map(x => x.text || '').join('')),
             tok: d.usageMetadata?.totalTokenCount ?? 0, coste: 0, casa: 'gemini' };
  }
  if (m.casa === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY,
                                   'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: m.n, max_tokens: 32000, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(300_000) });
    const d = await r.json();
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${JSON.stringify(d).slice(0, 120)}`);
    const u = d.usage ?? {};
    return { es: jsonDeModelo((d.content ?? []).map(x => x.text || '').join('')),
             tok: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
             coste: (u.input_tokens / 1e6) * 1.0 + (u.output_tokens / 1e6) * 5.0, casa: 'anthropic' };
  }
  const r = await fetch('https://api.x.ai/v1/chat/completions',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({ model: m.n, max_tokens: 32000, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(300_000) });
  const d = await r.json();
  if (!r.ok) throw new Error(`xai ${r.status}: ${JSON.stringify(d).slice(0, 120)}`);
  const u = d.usage ?? {};
  return { es: jsonDeModelo(d.choices?.[0]?.message?.content ?? ''),
           tok: u.total_tokens ?? 0,
           coste: (u.prompt_tokens / 1e6) * 0.20 + (u.completion_tokens / 1e6) * 0.50, casa: 'xai' };
}

const numero = { ...w.body };
delete numero.sources_index;                    // son ids, no texto que traducir
const PROMPT = promptTraduccion(numero);

// El material contra el que el fusible compara cada comilla. Se lee UNA vez y
// sirve para todos los intentos.
const desde = new Date(`${w.week_start}T00:00:00Z`);
const hasta = new Date(desde); hasta.setUTCDate(hasta.getUTCDate() + 8);
const [items, cotejos] = await Promise.all([
  sb(`glossa_radar_items?select=id,title,digest,origin,lang&state=eq.digested` +
     `&published_at=gte.${desde.toISOString()}&published_at=lt.${hasta.toISOString()}&limit=500`),
  sb(`glossa_radar_cotejos?select=item_id,claim_idx,claim_text,title,verdict,verdict_reason,url,` +
     `source_domain,published_date,independence&created_at=gte.${desde.toISOString()}&limit=500`),
]);
const indice = w.body.sources_index ?? {};

// ── La cascada ───────────────────────────────────────────────────────────
let es = null, veredicto = null, gastado = 0;
for (const m of TRADUCTORES) {
  const t0 = Date.now();
  let r;
  try { r = await traducirCon(m, PROMPT); }
  catch (e) { console.log(`  ${m.n}: ${String(e.message).slice(0, 90)}`); continue; }

  gastado += r.coste;
  await apuntar(URL, KEY, r.casa, 1, r.tok, r.coste);

  // Mismas piezas: una traducción que pierde una no es la misma revista, y el
  // índice de fuentes dejaría de cuadrar.
  if ((r.es.pieces ?? []).length !== w.body.pieces.length) {
    console.log(`  ${m.n}: devolvió ${(r.es.pieces ?? []).length} piezas de ${w.body.pieces.length} — se descarta`);
    continue;
  }

  const v = revisar(r.es, { items, cotejos: cotejos ?? [], ids: new Set(Object.keys(indice)),
                            indice, reportaje_count: 1, lang: 'es', original: w.body });
  const citas = v.fallos.filter(f => f.grave &&
    ['voces inventadas'].includes(f.regla));

  console.log(`  ${m.n.padEnd(30)} ${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s · ` +
    `${String(r.tok).padStart(6)} tok · $${r.coste.toFixed(4)} · ` +
    (citas.length ? `✗ ${citas.map(f => f.regla).join(', ')}` : '✓ ninguna voz inventada'));
  for (const f of citas.slice(0, 2)) console.log(`      ${String(f.detalle).slice(0, 88)}`);

  if (!citas.length) { es = r.es; veredicto = v; break; }
  // Tocó una cita: se pasa al siguiente. Guardarla sería publicar en español
  // justo lo que el número en inglés se negó a publicar.
}

if (!es) {
  console.error(`\nNingún traductor marcó bien las citas (gastado $${gastado.toFixed(4)}). ` +
    `No se guarda nada; el número en inglés no se toca y se reintenta la semana que viene.`);
  process.exit(1);
}
console.log(`\nTraducido por el orden de coste · $${gastado.toFixed(4)} en total`);
for (const f of veredicto.fallos.filter(f => !f.grave).slice(0, 3)) {
  console.log(`  · ${f.regla}: ${String(f.detalle).slice(0, 80)}`);
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
