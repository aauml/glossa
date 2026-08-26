// pieza_from_supabase.mjs — de un pegado en el panel a una pieza publicada.
//
// La sección que no existía: Arturo pega UN video, UN artículo o texto marcado
// «for a standalone piece» y esto lo convierte en una pieza individual de la
// colección — con su N° secuencial, su versión española y su procedencia — sin
// esperar al radar ni tocar el número semanal.
//
// Cadena: intake.add (solo_pieza) -> rpc glossa_pieza_dispatch -> este guion
//         (workflow glossa-pieza.yml) -> digiere si hace falta (Gemini)
//         -> 2 búsquedas de contexto (Tavily) digeridas como reportes
//         -> Kimi escribe EN y ES contra contrato JSON (prompts_pieza.mjs)
//         -> el guion ARMA los MDX (el modelo nunca emite markup)
//         -> glossa_seeds + glossa_issues (procedencia) + glossa_publish_requests
//         -> el trigger de la cola dispara glossa-publish.yml, que commitea y
//            despliega. La pieza aparece en /admin/weekly/ (Articles) y en la
//            portada al terminar Vercel.
//
// Quién escribe y por qué: Kimi, imitando la voz de la colección (decisión de
// Arturo, 2026-08-24, por costo; ~$0.08/pieza contra ~$0.30 de la alternativa).
// La voz vive destilada en prompts_pieza.mjs.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY, TAVILY_API_KEY,
//      MOONSHOT_API_KEY, ITEM_ID. Opcional: PIEZA_MODEL, PIEZA_DRY.

import { readFile, readdir } from 'node:fs/promises';
import { ajustes, uso as gastoActual, apuntar, apuntarLocal, cabe, cabeCoste } from '../src/lib/presupuesto.js';
import { dominio, esChatarra, esReferencia, esPlataforma } from '../src/lib/hallazgos.js';
import { promptReporte } from './prompts_reportaje.mjs';
import { promptDigestPieza, promptConsultasPieza, promptPieza, promptPiezaES } from './prompts_pieza.mjs';

const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY    = process.env.SUPABASE_SERVICE_KEY || '';
const GEMINI = process.env.GEMINI_API_KEY || '';
const TAVILY = process.env.TAVILY_API_KEY || '';
const KIMI   = process.env.MOONSHOT_API_KEY || '';
const ITEM   = process.env.ITEM_ID || '';
const SECO   = process.env.PIEZA_DRY === '1';
const MODELO_KIMI   = process.env.PIEZA_MODEL || 'kimi-k3';
const MODELO_GEMINI = 'gemini-3.1-flash-lite';

for (const [k, v] of Object.entries({ SUPABASE_URL: URL_SB, SUPABASE_SERVICE_KEY: KEY, GEMINI_API_KEY: GEMINI, MOONSHOT_API_KEY: KIMI, ITEM_ID: ITEM })) {
  if (!v) { console.error(`Falta ${k}`); process.exit(1); }
}

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function sb(path, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

// ── Presupuesto ──────────────────────────────────────────────────────────
const ajus  = await ajustes(URL_SB, KEY);
const gasto = await gastoActual(URL_SB, KEY);
const quedaGemini = () => cabe(gasto, ajus, 'gemini', 'cap_gemini_dia');
const quedaKimi   = () => cabeCoste(gasto, ajus, 'moonshot', 'cap_moonshot_mes_usd');
const quedaTavily = () => cabe(gasto, ajus, 'tavily', 'cap_tavily_mes', 'mes');

if (!quedaKimi()) {
  // Sin escritor no hay pieza: se sale ANTES de gastar nada en digerir o buscar.
  // Y se deja dicho en la barra — una pieza que muere sin motivo visible es la
  // caja negra que esto existe para eliminar.
  const msg = `Tope mensual de Kimi alcanzado ($${gasto.moonshot?.coste_mes ?? 0} de $${ajus.cap_moonshot_mes_usd}). La pieza no se escribe.`;
  await sb(`glossa_radar_items?id=eq.${ITEM}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ progress: { pct: 0, fase: 'failed', error: msg, updated_at: new Date().toISOString() } }),
  }).catch(() => {});
  console.error(msg);
  process.exit(1);
}

// ── El primer objeto JSON completo de una respuesta (copiado del reportaje) ──
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
  throw new SyntaxError('objeto sin cerrar');
}

async function gemini(parts, maxTokens = 4096) {
  for (let intento = 0; ; intento++) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI },
      body: JSON.stringify({ contents: [{ parts }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens } }),
    });
    if (!r.ok) {
      if ((r.status === 503 || r.status === 429) && intento < 2) {
        await new Promise(x => setTimeout(x, 5000)); continue;
      }
      throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    const d = await r.json();
    const tok = d.usageMetadata?.totalTokenCount ?? 0;
    await apuntar(URL_SB, KEY, 'gemini', 1, tok);
    apuntarLocal(gasto, 'gemini', 1);
    return jsonDeModelo((d.candidates?.[0]?.content?.parts ?? []).map(x => x.text || '').join(''));
  }
}

// Por `https.request` y NO por `fetch`, igual que el semanal, y no es estilo:
// el fetch de Node (undici) corta a los 5 minutos de esperar cabeceras y ese
// límite no lo controla AbortSignal. Kimi K3 tarda ~16 minutos en contestar
// una pieza — la primera corrida real murió exactamente ahí (HeadersTimeoutError).
import { request as httpsRequest } from 'node:https';

// Un 429 puede ser DOS cosas distintas y tratarlas igual costó 26 minutos de
// runner: «vas muy rápido», que se arregla esperando, y «la cuenta no tiene
// saldo», que no se arregla nunca. El segundo se reconoce por el cuerpo y se
// rinde en el acto, diciendo qué hay que hacer.
const SIN_SALDO = /insufficient balance|exceeded_current_quota|suspended|billing/i;

function kimiCrudo(cuerpo) {
  return new Promise((ok, ko) => {
    const req = httpsRequest({
      hostname: CASA.host, path: CASA.path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo),
                 Authorization: `Bearer ${CLAVE_ESCRITOR}` },
    }, res => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', c => { b += c; });
      res.on('end', () => (res.statusCode < 300 ? ok(b)
        : ko(Object.assign(new Error(`${CASA.casa} ${res.statusCode}: ${b.slice(0, 300)}`),
                           { status: res.statusCode }))));
    });
    req.on('error', ko);
    // 35 min, por debajo del corte del workflow, para que el error lo dé este
    // guion — que sabe decir qué pasó — y no un corte seco del runner.
    req.setTimeout(35 * 60_000, () => req.destroy(new Error('kimi sin respuesta en 35 min')));
    req.end(cuerpo);
  });
}

// Quién escribe. Se elige por el nombre del modelo y no por una bandera aparte:
// `PIEZA_MODEL=grok-4.20-0309-non-reasoning` basta para cambiar de casa. Los
// precios son los que ya usa la cascada de traducción, para no tener dos
// verdades sobre lo mismo.
const CASAS = {
  kimi:  { host: 'api.moonshot.ai', path: '/v1/chat/completions', env: 'MOONSHOT_API_KEY',
           precio: (u) => ((u.total_tokens ?? 0) / 1e6) * 2.2, casa: 'moonshot' },
  grok:  { host: 'api.x.ai',        path: '/v1/chat/completions', env: 'XAI_API_KEY',
           precio: (u) => ((u.prompt_tokens ?? 0) / 1e6) * 0.20 + ((u.completion_tokens ?? 0) / 1e6) * 0.50,
           casa: 'xai' },
};
const CASA = CASAS[MODELO_KIMI.startsWith('grok') ? 'grok' : 'kimi'];
const CLAVE_ESCRITOR = process.env[CASA.env] || '';
if (!CLAVE_ESCRITOR) { console.error(`Falta ${CASA.env} para escribir con ${MODELO_KIMI}`); process.exit(1); }

async function kimi(prompt, maxTokens = 64000) {
  const cuerpo = JSON.stringify({ model: MODELO_KIMI, max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }] });
  for (let intento = 0; ; intento++) {
    let bruto;
    try { bruto = await kimiCrudo(cuerpo); }
    catch (e) {
      if (SIN_SALDO.test(String(e.message))) {
        throw new Error(`la cuenta de ${CASA.casa} no tiene saldo: recárgala y relanza ` +
                        'la pieza desde el panel');
      }
      if ((e.status === 429 || e.status === 503) && intento < 4) {
        // La cuenta admite una petición a la vez; el hueco puede tardar.
        const espera = [60, 180, 420, 900][intento] * 1000;
        console.log(`  kimi ${e.status} — reintento en ${espera / 60000} min`);
        await new Promise(x => setTimeout(x, espera)); continue;
      }
      throw e;
    }
    const d = JSON.parse(bruto);
    const u = d.usage ?? {};
    const tok = u.total_tokens ?? 0;
    await apuntar(URL_SB, KEY, CASA.casa, 1, tok, CASA.precio(u));
    return jsonDeModelo(d.choices?.[0]?.message?.content ?? '');
  }
}

// ── Traducir: la cascada del semanal, no Kimi ────────────────────────────
// Traducir NO es escribir, y pagarle a un modelo de razonamiento por hacerlo
// es dinero quemado en pensar lo que no hay que pensar — la lección ya estaba
// medida en traducir_from_supabase.mjs y aquí se copió tarde: la primera
// versión mandaba la edición española a Kimi K3 (la mitad del costo de la
// pieza y ~15 min extra). La cascada: Gemini Flash Lite (gratis) → Grok
// no-reasoning (~$0.004) → Haiku (~$0.03) → Kimi, solo como último recurso.
const TRADUCTORES = [
  { n: 'gemini-3.1-flash-lite',        casa: 'gemini' },
  { n: 'grok-4.20-0309-non-reasoning', casa: 'xai', env: 'XAI_API_KEY' },
  { n: 'claude-haiku-4-5-20251001',    casa: 'anthropic', env: 'ANTHROPIC_API_KEY' },
];

async function traducir(prompt) {
  for (const m of TRADUCTORES) {
    if (m.env && !process.env[m.env]) continue;
    try {
      if (m.casa === 'gemini') return await gemini([{ text: prompt }], 32000);
      const esAnthropic = m.casa === 'anthropic';
      const r = await fetch(esAnthropic ? 'https://api.anthropic.com/v1/messages' : 'https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: esAnthropic
          ? { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }
          : { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY}` },
        body: JSON.stringify({ model: m.n, max_tokens: 32000, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(300_000),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(`${m.casa} ${r.status}: ${JSON.stringify(d).slice(0, 120)}`);
      const u = d.usage ?? {};
      const tok = esAnthropic ? (u.input_tokens ?? 0) + (u.output_tokens ?? 0) : (u.total_tokens ?? 0);
      const coste = esAnthropic
        ? ((u.input_tokens ?? 0) / 1e6) * 1.0 + ((u.output_tokens ?? 0) / 1e6) * 5.0
        : ((u.prompt_tokens ?? 0) / 1e6) * 0.20 + ((u.completion_tokens ?? 0) / 1e6) * 0.50;
      await apuntar(URL_SB, KEY, m.casa, 1, tok, coste);
      return jsonDeModelo(esAnthropic
        ? (d.content ?? []).map((x) => x.text || '').join('')
        : d.choices?.[0]?.message?.content ?? '');
    } catch (e) { console.log(`  traductor ${m.casa} no pudo: ${String(e).slice(0, 90)}`); }
  }
  console.log('  cascada agotada — traduce Kimi (último recurso)');
  return kimi(prompt, 32000);
}

// ── 1 · El elemento ──────────────────────────────────────────────────────
// Con la fuente que lo trajo: el nombre del canal o del columnista es un DATO
// de procedencia, y sin él la pieza puede llamar «anónima» a una columna
// firmada — pasó con el N° 39, que era de Riva Palacio en El Financiero.
const [item] = await sb(
  `glossa_radar_items?select=*,glossa_radar_sources(name,kind)&id=eq.${ITEM}&limit=1`) ?? [];
if (item) item.fuente = item.glossa_radar_sources?.name ?? null;
if (!item) { console.error(`No existe el elemento ${ITEM}`); process.exit(1); }
console.log(`Pieza para: «${item.title}» (${item.origin}, ${item.state})`);

// El avance se escribe en la fila para que el panel lo pinte como barra: diez
// minutos de caja negra fue exactamente la queja. Nunca falla la corrida por
// no poder anotarse — la barra es cosmética, la pieza no.
// `reintentada` la pone el vigilante y tiene que SOBREVIVIR a cada anotación:
// si el segundo intento la pisara al fallar, el vigilante relanzaría en bucle
// un fallo determinista — pagándolo cada cuatro horas.
const REINTENTADA = item?.progress?.reintentada === true;
const avance = (pct, fase, extra = {}) => SECO ? Promise.resolve() :
  sb(`glossa_radar_items?id=eq.${ITEM}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ progress: { pct, fase, ...extra,
      ...(REINTENTADA ? { reintentada: true } : {}),
      updated_at: new Date().toISOString() } }),
  }).catch(() => {});

// Cualquier muerte a partir de aquí deja la barra en «failed» con su motivo:
// una barra congelada en 45% no le dice a nadie qué pasó ni qué hacer.
process.on('uncaughtException', async (e) => {
  await avance(0, 'failed', { error: String(e).slice(0, 300) });
  console.error(String(e)); process.exit(1);
});
process.on('unhandledRejection', async (e) => {
  await avance(0, 'failed', { error: String(e).slice(0, 300) });
  console.error(String(e)); process.exit(1);
});
async function morir(msg) { await avance(0, 'failed', { error: msg }); console.error(msg); process.exit(1); }

// ── 2 · Digerir, si el radar no llegó antes ──────────────────────────────
let digest = item.digest;
if (!digest || item.state !== 'digested') {
  if (!quedaGemini()) await morir('Sin cuota de Gemini para digerir. Se reintenta mañana.');
  const esTexto = !!item.body_text;
  const esYoutube = /(?:youtube\.com|youtu\.be)\//.test(String(item.url));
  if (!esTexto && !esYoutube) await morir('El elemento no trae texto y no es YouTube: no hay nada que leer.');
  console.log(`Digiriendo (${esTexto ? 'texto' : 'video'})…`);
  await avance(12, esTexto ? 'reading the source' : 'listening to the source');
  const parte = esTexto
    ? { text: `CONTENIDO:\n${String(item.body_text).slice(0, 200_000)}` }
    : { fileData: { fileUri: item.url }, videoMetadata: { fps: 0.1 } };
  digest = await gemini([{ text: promptDigestPieza(item, esTexto) }, parte], 8192);
  if (digest.skip) await morir('La fuente no tiene contenido analizable.');
  if (!SECO) await sb(`glossa_radar_items?id=eq.${item.id}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ state: 'digested', digest, lang: digest.lang ?? null,
                           digested_at: new Date().toISOString(), error: null }) });
}
await avance(30, 'checking claims against outside reporting');

// ── 3 · Contexto de fuera: dos búsquedas, cuatro reportes como mucho ─────
const reportes = [];
if (TAVILY && quedaTavily() && quedaGemini()) {
  let consultas = [];
  try { consultas = (await gemini([{ text: promptConsultasPieza(digest) }], 1024)).queries ?? []; }
  catch (e) { console.log(`  consultas: ${String(e).slice(0, 80)}`); }
  for (const c of consultas.slice(0, 2)) {
    if (reportes.length >= 4 || !quedaTavily()) break;
    let hallazgos = [];
    try {
      const r = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TAVILY}` },
        body: JSON.stringify({ query: String(c.q).slice(0, 380), max_results: 5,
          search_depth: 'advanced', include_raw_content: true }),
      });
      if (!r.ok) throw new Error(`tavily ${r.status}`);
      await apuntar(URL_SB, KEY, 'tavily', 2);
      apuntarLocal(gasto, 'tavily', 2);
      hallazgos = (await r.json()).results ?? [];
    } catch (e) { console.log(`  ✗ búsqueda: ${String(e).slice(0, 80)}`); continue; }
    for (const h of hallazgos) {
      if (reportes.length >= 4 || !quedaGemini()) break;
      const url = h.url || '';
      const texto = String(h.raw_content ?? h.content ?? '');
      if (!url || texto.length < 400) continue;
      if (esReferencia(url) || esChatarra(url) || esPlataforma(url)) continue;
      if (reportes.some(x => x.outlet === dominio(url))) continue;
      try {
        const rep = await gemini([{ text: promptReporte(
          { sitio: dominio(url), titulo: h.title || url, fecha: h.published_date ?? null, texto },
          { label: digest.thesis?.slice(0, 120) ?? item.title }) }]);
        if (rep.skip || rep.bears_on_topic === false) continue;
        reportes.push({ ...rep, url, outlet: dominio(url) });
        console.log(`  ✓ ${dominio(url)}`);
      } catch (e) { console.log(`  ✗ digest ${dominio(url)}: ${String(e).slice(0, 60)}`); }
    }
  }
} else {
  console.log('Sin búsquedas de contexto (falta clave o cuota); la pieza se escribe de la fuente sola.');
}

// ── 4 · El número que le toca y la colección para callbacks ──────────────
// El guion corre en el checkout del repo: la colección está aquí mismo.
const piezas = [];
let maxNo = 0;
for (const slug of await readdir('src/content/articles')) {
  let fm;
  try { fm = (await readFile(`src/content/articles/${slug}/en.mdx`, 'utf8')).slice(0, 2000); }
  catch { continue; }
  const issue = fm.match(/^issue:\s*"(N° (\d+)[a-z]?)"/m);
  const title = fm.match(/^title:\s*"(.+)"/m);
  if (issue) maxNo = Math.max(maxNo, Number(issue[2]));
  if (issue && title) piezas.push({ issue: issue[1], slug, title: JSON.parse(`"${title[1]}"`) });
}
const issueNo = `N° ${maxNo + 1}`;
console.log(`Le toca ${issueNo} (la colección tiene ${piezas.length} piezas).`);
await avance(42, `writing the piece (${MODELO_KIMI}) — the long stage`, { issue: issueNo });

// ── 5 · Kimi escribe, contra contrato ────────────────────────────────────
/**
 * La voz, comprobada por código y no por confianza.
 *
 * La regla —el artículo es de Glossa, se afirma, y lo que matiza es la marca—
 * vive en el prompt, y un prompt es una petición, no una garantía. Esto es la
 * garantía: si el texto vuelve hablando DEL texto («the column says», una caja
 * titulada «Who is X?», «take this as one journalist's account»), el contrato
 * está incumplido y se reintenta con el fallo dicho, igual que con un slug malo.
 *
 * Se mira solo la PROSA, no los datos de procedencia: la línea bajo el titular
 * sí debe decir de dónde salió.
 */
const VOZ_PROHIBIDA = [
  [/\b(the|this) (column|article|piece|account|essay|text) (says|argues|claims|describes|treats|gives|assumes|names|sets|drops|offers)\b/i,
   'habla del texto en vez del mundo («the column says…»)'],
  [/\b(la|el) (columna|art[íi]culo|texto|relato|pieza) (dice|sostiene|describe|trata|afirma|asume|ofrece)\b/i,
   'habla del texto en vez del mundo («la columna dice…»)'],
  [/\b(the author|the columnist|the writer|el autor|el columnista|la autora) (says|argues|describes|writes|dice|sostiene|describe|escribe)\b/i,
   'devuelve la frase a su autor en vez de afirmarla'],
  [/guided reading|lectura guiada|read (it|this|the following) the way|tome lo siguiente como|take (this|the following) as/i,
   'le explica al lector cómo leer la fuente'],
  [/^\s*(who is|qui[ée]n es|qui[ée]nes son)\b/i, 'caja de contexto sobre QUIÉN es la fuente', 'label'],
];

/** El texto que el lector va a leer, sin la procedencia ni los rótulos. */
function prosaDe(j) {
  const trozos = [j.lede ?? '', j.dek ?? '', j.coverDek ?? ''];
  for (const s of j.sections ?? []) {
    trozos.push(s.standfirst ?? '');
    for (const b of s.blocks ?? []) trozos.push(b.md ?? b.text ?? '');
  }
  return trozos.join('\n');
}

/**
 * El titular, el dek y el resumen de portada dicen la COSA, no quién la dice.
 *
 * Es lo único que se ve fuera del artículo —en la portada, en la tarjeta de
 * compartir, en el buscador— y el N° 39 salió con «Raymundo Riva Palacio argues
 * that…»: el cuerpo ya afirmaba, y el escaparate seguía citando.
 *
 * Se comprueba SOLO ahí. Dentro del cuerpo, «Sheinbaum dijo que…» es periodismo
 * normal y prohibirlo sería absurdo.
 */
const ATRIBUCION_EN_VITRINA =
  /\b[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'’-]+(?: [A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ'’-]+){0,3} (argues|says|claims|contends|writes|maintains|sostiene|afirma|asegura|escribe|plantea)\b|\b(the|el|la) (columnist|author|columnista|autor|autora)\b/;

function validar(j, lado) {
  const fallos = [];
  const prosa = prosaDe(j);
  for (const campo of ['title', 'dek', 'dekHTML', 'coverDek']) {
    if (j[campo] && ATRIBUCION_EN_VITRINA.test(j[campo])) {
      fallos.push(`${campo} cita a quien lo dice en vez de decir la cosa`);
    }
  }
  for (const [re, queja, donde] of VOZ_PROHIBIDA) {
    if (donde === 'label') {
      // El nombre de la fuente en el rótulo de una caja: la caja explica el
      // asunto, nunca la firma.
      const cajas = (j.sections ?? []).flatMap(s => (s.blocks ?? [])
        .filter(b => b.type === 'context').map(b => b.label ?? ''));
      if (cajas.some(l => re.test(l) && !/what is|qu[ée] es|qu[ée] son/i.test(l))) fallos.push(queja);
    } else if (re.test(prosa)) {
      fallos.push(queja);
    }
  }
  if (lado === 'en' && !/^[a-z0-9][a-z0-9-]{1,79}$/.test(j.slug ?? '')) fallos.push('slug inválido');
  if (lado === 'en' && piezas.some(p => p.slug === j.slug)) fallos.push('slug repetido');
  for (const campo of ['title', 'titleHTML', 'dek', 'coverDek', 'lede']) {
    if (!j[campo]) fallos.push(`falta ${campo}`);
  }
  if ((j.titleHTML?.match(/<em>/g) || []).length !== 1) fallos.push('titleHTML necesita exactamente un <em>');
  if (!Array.isArray(j.sections) || j.sections.length < 2 || j.sections.length > 7) fallos.push('2-7 secciones');
  for (const s of j.sections ?? []) {
    if (!s.blocks?.length) fallos.push(`sección ${s.number} sin bloques`);
    for (const b of s.blocks ?? []) if (!['p', 'context', 'qa', 'pullquote'].includes(b.type)) fallos.push(`bloque desconocido «${b.type}»`);
  }
  return fallos;
}

console.log(`Escribiendo con ${MODELO_KIMI} (${CASA.casa})…`);
let en = await kimi(promptPieza(digest, reportes, piezas, issueNo));
let fallos = validar(en, 'en');
if (fallos.length) {
  console.log(`  contrato incumplido (${fallos.join('; ')}) — un reintento`);
  en = await kimi(promptPieza(digest, reportes, piezas, issueNo) +
    `\n\nYOUR PREVIOUS ATTEMPT BROKE THE CONTRACT: ${fallos.join('; ')}. Fix exactly that.`);
  fallos = validar(en, 'en');
  if (fallos.length) await morir(`El contrato sigue roto: ${fallos.join('; ')}`);
}
await avance(72, 'Spanish edition', { issue: issueNo, slug: en.slug });

console.log('Versión española…');
// Las glosas de las fuentes se traducen CON la pieza: el pie de procedencia lo
// lee el lector igual que el cuerpo, y cada edición debe enseñar la suya.
const glosasEN = [digest.thesis, ...reportes.map(r => r.what_happened)].map(x => String(x ?? '').slice(0, 400));
const es = await traducir(promptPiezaES(en, glosasEN));
const glosasES = Array.isArray(es.sources_gloss) && es.sources_gloss.length === glosasEN.length
  ? es.sources_gloss : glosasEN.map(() => null);
es.slug = en.slug; es.track = en.track;   // por si el modelo los «tradujo»

// El `title` español llegó una vez en INGLÉS mientras el `titleHTML` venía bien
// traducido: el modelo tradujo la versión con <em> y se saltó la lisa. Nadie lo
// vio en la página —que pinta el titleHTML— pero el <title> de la pestaña, la
// tarjeta de compartir y el buscador usan el liso, así que la edición española
// se anunciaba en inglés por todas partes menos donde se leía.
if (es.title && en.title && es.title.trim() === en.title.trim() &&
    es.titleHTML && es.titleHTML.trim() !== en.titleHTML?.trim()) {
  es.title = es.titleHTML.replace(/<[^>]+>/g, '').trim();
  console.log(`  el título español venía sin traducir; se toma del titleHTML: «${es.title}»`);
}

// La edición española NO se validaba: el contrato solo miraba la inglesa. Una
// traducción hereda la voz del original, pero puede introducirla de nuevo por
// su cuenta —«según el relato», «la columna sostiene»— y ahí nadie miraba.
// Solo la voz: el resto del contrato (slug, secciones) ya lo garantiza el
// original, del que esta edición es una copia estructural.
{
  const fallosES = validar(es, 'es').filter(f => !/slug|falta |<em>|secciones|bloque/.test(f));
  if (fallosES.length) {
    console.log(`  la edición española rompió la voz (${fallosES.join('; ')}) — un reintento`);
    const otra = await traducir(promptPiezaES(en, glosasEN) +
      `\n\nYOUR PREVIOUS ATTEMPT BROKE THE VOICE RULE: ${fallosES.join('; ')}. ` +
      'State the claim; the mark carries the caution. Fix exactly that.');
    otra.slug = en.slug; otra.track = en.track;
    const aun = validar(otra, 'es').filter(f => !/slug|falta |<em>|secciones|bloque/.test(f));
    if (aun.length) await morir(`La edición española sigue rompiendo la voz: ${aun.join('; ')}`);
    Object.assign(es, otra);
  }
}

// ── 6 · Armar los MDX (el modelo nunca emite markup) ─────────────────────
// Las llaves se escapan: en MDX un `{` abre una expresión y una llave suelta
// en la prosa rompe el build entero.
const mdxSafe = (s) => String(s ?? '').replace(/{/g, '&#123;').replace(/}/g, '&#125;');
const yamlStr = (s) => JSON.stringify(String(s ?? ''));

// UNA marca de tiempo para las dos ediciones. Calculada dentro de armarMdx,
// el reloj cruzó un segundo entre la llamada EN y la ES (12:59:59 / 13:00:00),
// los sortDate no coincidieron y el check de integridad —con razón— paró la
// publicación entera. La primera pieza real murió exactamente de eso.
const AHORA = new Date();

function armarMdx(j, lang) {
  const ahora = AHORA;
  const fecha = ahora.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB',
    { timeZone: 'America/Los_Angeles', day: 'numeric', month: lang === 'es' ? 'short' : 'long', year: 'numeric' })
    .replace(/\./g, '');
  const sortDate = ahora.toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' }).replace(' ', 'T');
  const numero = lang === 'es' ? issueNo.replace('N° ', 'N.º ') : issueNo;

  const usados = new Set(['Lede', 'Section', 'Standfirst']);
  for (const s of j.sections) for (const b of s.blocks) {
    if (b.type === 'context') usados.add('ContextBox');
    if (b.type === 'qa') usados.add('QABlock');
    if (b.type === 'pullquote') usados.add('PullQuote');
  }

  const fm = [
    '---',
    `issue: ${yamlStr(numero)}`,
    `date: ${yamlStr(fecha)}`,
    `sortDate: ${yamlStr(sortDate)}`,
    `language: ${lang}`,
    `track: ${en.track || 'general'}`,
    `title: ${yamlStr(j.title)}`,
    `titleHTML: ${yamlStr(j.titleHTML)}`,
    `dek: ${yamlStr(j.dek)}`,
    j.dekHTML ? `dekHTML: ${yamlStr(j.dekHTML)}` : null,
    `coverDek: ${yamlStr(j.coverDek)}`,
    `source: ${yamlStr(j.source || item.url)}`,
    `sourceLabel: ${yamlStr(`${issueNo} · ${(j.source || item.title).replace(/^Based on |^Basado en /, '').slice(0, 80)}`)}`,
    'topics:',
    ...(j.topics || []).slice(0, 6).map(t => `  - ${yamlStr(t)}`),
    '---',
  ].filter(Boolean).join('\n');

  const imports = [...usados].map(c => c === 'ContextBox' || c === 'QABlock' || c === 'PullQuote' ||
    c === 'Lede' || c === 'Section' || c === 'Standfirst'
    ? `import ${c} from '../../../components/${c}.astro';` : null).filter(Boolean).join('\n');

  const cuerpo = [];
  cuerpo.push(`<Lede>\n${mdxSafe(j.lede)}\n</Lede>`);
  for (const s of j.sections) {
    const bloques = s.blocks.map(b => {
      if (b.type === 'context') return `<ContextBox label="${mdxSafe(b.label).replace(/"/g, '&quot;')}">\n${mdxSafe(b.md)}\n</ContextBox>`;
      if (b.type === 'qa') return `<QABlock speaker="${mdxSafe(b.speaker).replace(/"/g, '&quot;')}">\n${mdxSafe(b.md)}\n</QABlock>`;
      if (b.type === 'pullquote') return `<PullQuote>${mdxSafe(b.md)}</PullQuote>`;
      return mdxSafe(b.md);
    }).join('\n\n');
    cuerpo.push(`<Section number="${s.number}" title="${mdxSafe(s.titleHTML || s.title).replace(/"/g, '&quot;')}">\n\n` +
                `<Standfirst>${mdxSafe(s.standfirst)}</Standfirst>\n\n${bloques}\n\n</Section>`);
  }
  return `${fm}\n\n${imports}\n\n${cuerpo.join('\n\n')}\n`;
}

const bodyEn = armarMdx(en, 'en');
const bodyEs = armarMdx(es, 'es');

// ── 7 · Procedencia y publicación ────────────────────────────────────────
const sourcesJson = {
  slug: en.slug, issue: issueNo,
  sources: [
    // `claim_en` y `claim_es`, NO `respalda`: el componente del pie busca la
    // glosa del idioma que está pintando. Escribiendo solo `respalda` —nombre
    // español con texto inglés dentro— la edición inglesa no enseñaba glosa
    // ninguna y la española enseñaba la inglesa.
    { id: 'src-01', ref: item.title, role: 'primary',
      tipo: /youtube|youtu\.be/.test(item.url) ? 'video' : (item.body_text ? 'article' : 'link'),
      url: item.url !== 'about:blank' ? item.url : undefined,
      como: 'Fuente ancla — pegada por Arturo en el panel (pieza suelta)',
      claim_en: glosasEN[0], claim_es: glosasES[0] ?? undefined, verificada: 'si' },
    ...reportes.map((r, i) => ({
      id: `src-${String(i + 2).padStart(2, '0')}`, ref: `${r.outlet} — ${r.what_happened?.slice(0, 100)}`,
      role: 'context', tipo: 'report', url: r.url,
      como: 'Traído por el pipeline para anclar o contrastar afirmaciones de la fuente',
      claim_en: glosasEN[i + 1], claim_es: glosasES[i + 1] ?? undefined, verificada: 'si' })),
  ],
};

if (SECO) {
  // En seco no se publica, pero SÍ se mide: sin cifras, comparar dos modelos es
  // comparar impresiones. Son las mismas medidas que se le tomaron a la
  // colección para decidir las reglas de registro.
  const prosa = en.sections.flatMap(x => x.blocks.filter(b => b.type === 'p').map(b => b.md))
    .concat(en.lede).join(' ');
  const frases = prosa.split(/(?<=[.!?])\s+/).filter(x => x.trim().length > 25);
  const largas = frases.map(x => x.split(/\s+/).length).sort((a, b) => b - a);
  const palabras = prosa.split(/\s+/).length;
  const cajas = en.sections.flatMap(x => x.blocks).filter(b => b.type === 'context').length;
  console.log(`\nPIEZA_DRY · ${MODELO_KIMI} · ${issueNo} · ${en.slug}`);
  console.log(`  titular: ${en.title}`);
  console.log(`  ${palabras} palabras · ${en.sections.length} secciones · ${cajas} cuadros de contexto`);
  console.log(`  media ${(palabras / Math.max(1, frases.length)).toFixed(1)} palabras/frase · ` +
              `la más larga ${largas[0]} · por encima de 35: ${largas.filter(x => x > 35).length}`);
  console.log(`\n  LEDE: ${String(en.lede).slice(0, 400)}`);
  process.exit(0);
}

const [seed] = await sb('glossa_seeds?select=id', {
  method: 'POST', headers: { Prefer: 'return=representation' },
  body: JSON.stringify([{ authored_by: 'Arturo', mode: 'pieza', track: en.track || 'general',
    thesis: `Pieza pedida desde el panel sobre: ${item.title}`.slice(0, 500),
    notes: `item ${item.id} (${item.origin})` }]),
});
const [issue] = await sb('glossa_issues?select=id', {
  method: 'POST', headers: { Prefer: 'return=representation' },
  body: JSON.stringify([{ slug: en.slug, issue_no: issueNo, track: en.track || 'general',
    mode: 'pieza', status: 'drafting', title_en: en.title, title_es: es.title,
    dek_en: en.dek, dek_es: es.dek, topics: en.topics ?? [], seed_id: seed?.id ?? null,
    model: MODELO_KIMI }]),
});

await sb('glossa_publish_requests', {
  method: 'POST', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify([{ issue_id: issue?.id ?? null, slug: en.slug, issue_no: issueNo,
    body_en: bodyEn, body_es: bodyEs, sources_json: sourcesJson,
    state: 'queued', requested_by: 'glossa-pieza (panel)' }]),
});

// El elemento queda anotado para que la cola y el número sepan que ya cumplió.
await sb(`glossa_radar_items?id=eq.${item.id}`, {
  method: 'PATCH', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ note: `pieza ${issueNo} · ${en.slug}` }) });
// El 100 no lo pone este guion: lo deduce el panel cuando la cola de
// publicación marca `done` para este slug, que es cuando de verdad está en vivo.
await avance(90, 'publishing — build & deploy', { issue: issueNo, slug: en.slug });

console.log(`\n${issueNo} encolado para publicar: ${en.slug}`);
console.log('El worker de publicación commitea los MDX y Vercel despliega — en vivo en unos minutos.');
