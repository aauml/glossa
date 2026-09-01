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
//      responda uno), MOONSHOT_API_KEY (el revisor de estilo; sin ella se
//      publica con solo el determinista). TRADUCIR_DRY=1 corre todo e imprime
//      el veredicto sin guardar nada.

import { revisar } from '../src/lib/fusible.js';
import { promptTraduccion } from './prompts_weekly.mjs';
import { apuntar } from '../src/lib/presupuesto.js';
import { edicionValidada } from './revisor_es.mjs';

const SECO = process.env.TRADUCIR_DRY === '1';

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

// «No hay nada que traducir» tiene dos causas que se leían igual, y una de ellas
// es un número sin edición española.
//
// Cuando esto colgaba del cron de GitHub —traducir a las 08:45, número a las
// 07:30— bastaba con que el número arrancara tarde, que es lo normal: el del 23
// de agosto empezó a las 10:15. Entonces este guion corría PRIMERO, no encontraba
// número, imprimía esta línea y salía con CÓDIGO 0. Verde en el registro, verde
// para el vigilante, y el domingo se quedaba en inglés sin que nadie lo supiera.
//
// Ahora se distingue: si la semana ya cerró y su número existe pero sin traducir,
// no encontrarlo es un fallo y se dice como tal. Si de verdad no hay nada
// pendiente, sigue siendo una salida en paz.
if (!w?.body?.pieces?.length) {
  const [ventana] = await sb('rpc/glossa_semana_actual', { method: 'POST', body: '{}' });
  const debia = !semana && ventana && !ventana.parcial
    ? (await sb('glossa_radar_weekly?select=week_start,state' +
                `&week_start=eq.${new Date(ventana.desde).toISOString().slice(0, 10)}` +
                '&body=not.is.null&body_es=is.null&limit=1'))?.[0]
    : null;
  if (debia) {
    console.error(`La semana del ${debia.week_start} tiene número escrito y SIN traducir, ` +
                  'y esta consulta no lo ha encontrado. No se sale en verde.');
    process.exit(1);
  }
  console.log('No hay ningún número pendiente de traducir.');
  process.exit(0);
}
console.log(`Traduciendo «${w.body.headline}» · ${w.body.pieces.length} piezas · semana ${w.week_start}`);

// La cascada de traductores, el reintento con el fallo dicho y el revisor de
// estilo (Kimi) viven en `revisor_es.mjs`, compartidos con la pieza suelta.
// Aquí solo se arma el `comprobar` de este guion: el fusible entero, que en
// español ya incluye el contrato de `espanol.js`, más la cuenta de piezas.
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

// ── La cascada, validada y con revisor ───────────────────────────────────
// `comprobar` es el determinista entero de este guion: la cuenta de piezas
// (una traducción que pierde una no es la misma revista) y el fusible, que en
// español corre las voces inventadas MÁS el contrato de `espanol.js` (calcos,
// campos en inglés, cifras, paridad). Todo lo grave bloquea — antes solo las
// voces inventadas, y por ahí salieron los calcos publicados.
function comprobar(candidato) {
  const fallos = [];
  if ((candidato.pieces ?? []).length !== w.body.pieces.length) {
    fallos.push({ regla: 'piezas perdidas',
      detalle: `devolvió ${(candidato.pieces ?? []).length} piezas de ${w.body.pieces.length}`, grave: true });
  }
  const v = revisar(candidato, { items, cotejos: cotejos ?? [], ids: new Set(Object.keys(indice)),
                                 indice, reportaje_count: 1, lang: 'es', original: w.body });
  fallos.push(...v.fallos);
  return { ok: !fallos.some(f => f.grave), fallos };
}

// El revisor del SEMANAL es Haiku, no Kimi (Arturo, 2026-08-31): el filtro de
// contenido de Moonshot bloqueaba el dictamen sobre el material geopolítico
// del número — y así salió el del 2026-08-23 con «entre un amanecer y otro».
// Sin clave se publica con solo el determinista; nunca se bloquea el español
// por el corrector.
const resultado = await edicionValidada(PROMPT, comprobar, {
  en: w.body,
  apuntar: (casa, llamadas, tok, coste) => SECO ? Promise.resolve() : apuntar(URL, KEY, casa, llamadas, tok, coste),
  conRevisor: () => !!process.env.ANTHROPIC_API_KEY,
  casaRevisor: 'anthropic',
});

if (!resultado) {
  console.error('\nNingún traductor cumplió el contrato del español. ' +
    'No se guarda nada; el número en inglés no se toca y se reintenta la semana que viene.');
  process.exit(1);
}
const { es, veredicto, gastado } = resultado;
console.log(`\nTraducido y revisado · $${gastado.toFixed(4)} en total`);
for (const f of veredicto.deterministico.fallos.filter(f => !f.grave).slice(0, 5)) {
  console.log(`  · ${f.regla}: ${String(f.detalle).slice(0, 80)}`);
}

if (SECO) {
  console.log(`\nTRADUCIR_DRY · no se guarda. Veredicto:`);
  console.log(JSON.stringify({ deterministico: { ok: veredicto.deterministico.ok,
    fallos: veredicto.deterministico.fallos.map(f => `${f.grave ? '✗' : '·'} ${f.regla}: ${String(f.detalle).slice(0, 100)}`) },
    revisor: veredicto.revisor, intentos: veredicto.intentos }, null, 2));
  process.exit(0);
}

await sb(`glossa_radar_weekly?week_start=eq.${w.week_start}`, {
  method: 'PATCH', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({
    body_es: { ...es, sources_index: indice },
    traducido_at: new Date().toISOString(),
    fuse_es: { ...veredicto.deterministico, revisor: veredicto.revisor,
               intentos: veredicto.intentos, ran_at: new Date().toISOString() },
  }),
});
console.log(`\nGuardado · «${es.headline}»`);
console.log(`https://glossa.ademas.ai/es/weekly/${w.week_start}/`);
