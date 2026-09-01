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
import { uriDeVideo } from '../src/lib/video.js';
import { promptReporte } from './prompts_reportaje.mjs';
import { promptDigestPieza, promptConsultasPieza, promptPieza, promptPiezaES } from './prompts_pieza.mjs';
import { revisarEspanol, pareceIngles, formatearFechaES } from '../src/lib/espanol.js';
import { edicionValidada } from './revisor_es.mjs';

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

// ── Una pieza a la vez ───────────────────────────────────────────────────
//
// Cada pegado dispara su propia corrida, así que pegar cinco vídeos seguidos
// lanzaba cinco a la vez. Cinco digestiones de vídeo simultáneas agotan el cupo
// por minuto de Gemini —429 y muertas— y, peor, las cinco calculan su número
// como «el mayor que hay más uno», así que todas reclaman el mismo.
//
// El turno se pide aquí. Quien no lo consigue NO se pierde: se queda en la cola
// (`state='pending'`) y la corrida que está trabajando la arranca al terminar.
const LEASE = 'pieza_lease';
const YO = process.env.GITHUB_RUN_ID || `local-${process.pid}`;
// Doce, no cuarenta y cinco. `glossa_piezas_empujar()` (migración 0062) da por
// muerto un turno a los DOCE minutos sin latido, y aquí seguían cuarenta y
// cinco. Entre los doce y los cuarenta y cinco quedaba una tierra de nadie: la
// base lanzaba una corrida cada cinco minutos, la corrida miraba el turno, se
// creía ocupada y se iba en verde. El 2026-08-29 eso tuvo una pieza seis horas
// en la barra sin que fallara nada visible. Dos relojes para el mismo turno son
// un reloj roto.
const MINUTOS = 12;

async function turno() {
  const [fila] = await sb(`glossa_radar_settings?key=eq.${LEASE}&select=value`) ?? [];
  const v = fila?.value ?? null;
  if (v?.at && Date.now() - Date.parse(v.at) < MINUTOS * 60_000 && v.run !== YO) return false;
  await sb('glossa_radar_settings', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: LEASE, value: { run: YO, at: new Date().toISOString() } }]),
  });
  // Releer: si dos corridas escribieron a la vez, solo una se ve a sí misma.
  const [otra] = await sb(`glossa_radar_settings?key=eq.${LEASE}&select=value`) ?? [];
  return otra?.value?.run === YO;
}

async function soltarTurno() {
  const [fila] = await sb(`glossa_radar_settings?key=eq.${LEASE}&select=value`) ?? [];
  if (fila?.value?.run !== YO) return;
  await sb(`glossa_radar_settings?key=eq.${LEASE}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ value: { run: null, at: null } }) });
}

/** La siguiente de la cola, si la hay, y se dispara su corrida. */
async function siguienteDeLaCola(salvo) {
  const pend = await sb('glossa_radar_items?select=id,title&origin=eq.pieza&state=eq.pending' +
                        '&order=created_at.asc&limit=2') ?? [];
  const otra = pend.find(x => x.id !== salvo);
  if (!otra) return null;
  await sb('rpc/glossa_pieza_dispatch', { method: 'POST', body: JSON.stringify({ item: otra.id }) });
  console.log(`\nSiguiente de la cola lanzada: «${String(otra.title).slice(0, 60)}»`);
  return otra;
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
      // El 429 de Gemini suele ser el cupo POR MINUTO del tramo gratuito, no el
      // del día: pegar cinco vídeos seguidos lo dispara y esperar lo resuelve.
      // Con dos intentos de cinco segundos moría igual; ahora sube hasta el
      // minuto, que es la ventana que hay que dejar pasar.
      const cuerpo = await r.text();
      // La propia respuesta dice QUÉ cupo se agotó. El del minuto se espera; el
      // del día no se espera dentro de una corrida —faltan horas— y hay que
      // salir sin romper nada para que la cola lo reintente después.
      let porDia = false;
      try {
        for (const det of JSON.parse(cuerpo).error?.details ?? []) {
          for (const v of det.violations ?? []) {
            if (/per_?day|_day|free_tier_requests/i.test(String(v.quotaId ?? v.quotaMetric ?? ''))) porDia = true;
          }
        }
      } catch { /* si no viene detallado, se trata como pasajero */ }
      if (r.status === 429 && porDia) { const e = new Error('gemini: cupo diario agotado'); e.cupoDiario = true; throw e; }
      const espera = [5000, 20000, 60000, 60000];
      if ((r.status === 503 || r.status === 429) && intento < espera.length) {
        console.log(`  gemini ${r.status} — reintento en ${espera[intento] / 1000} s`);
        await new Promise(x => setTimeout(x, espera[intento])); continue;
      }
      throw new Error(`gemini ${r.status}: ${cuerpo.slice(0, 200)}`);
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

// ── Traducir: la cascada compartida, ahora VALIDADA también aquí ─────────
// Traducir NO es escribir, y pagarle a un modelo de razonamiento por hacerlo
// es dinero quemado en pensar lo que no hay que pensar. La cascada vive en
// revisor_es.mjs, compartida con el semanal, y este guion ya no se queda con
// el primer modelo que no lance excepción: cada intento pasa por el contrato
// del español (`revisarEspanol`) y por el revisor de estilo, con reintento al
// mismo modelo y el fallo dicho. Antes la elección era «el que no dio error
// HTTP» — en la práctica siempre Gemini Flash Lite, sin que nadie mirara qué
// devolvió, y por ahí salieron «los agencias» y el 51.7 con coma.

// ── 1 · El elemento ──────────────────────────────────────────────────────
// Con la fuente que lo trajo: el nombre del canal o del columnista es un DATO
// de procedencia, y sin él la pieza puede llamar «anónima» a una columna
// firmada — pasó con el N° 39, que era de Riva Palacio en El Financiero.
const [item] = await sb(
  `glossa_radar_items?select=*,glossa_radar_sources(name,kind)&id=eq.${ITEM}&limit=1`) ?? [];
if (item) item.fuente = item.glossa_radar_sources?.name ?? null;
if (!item) { console.error(`No existe el elemento ${ITEM}`); process.exit(1); }
console.log(`Pieza para: «${item.title}» (${item.origin}, ${item.state})`);

// El turno, antes de gastar un solo token. Sin turno, la pieza se queda en la
// cola tal cual está —`pending`— y la corrida que trabaja la arrancará cuando
// acabe; no se pierde ni se marca como fallada, que sería mentir.
if (!SECO && !(await turno())) {
  // No se pisa un «failed», y tampoco el contador de intentos. Antes esta barra
  // se escribía entera y en bruto: borraba el motivo del fallo anterior —así que
  // el panel enseñaba «in queue» donde había un error— y reseteaba `intentos`,
  // con lo que el tope de tres no se alcanzaba nunca. Un fallo real se leía como
  // una pieza esperando su turno, indefinidamente.
  const previo = item?.progress ?? {};
  if (previo.fase !== 'failed') {
    await sb(`glossa_radar_items?id=eq.${item.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ progress: { pct: 3, fase: 'in queue — another piece is being written',
                                         ...(previo.intentos != null ? { intentos: previo.intentos } : {}),
                                         ...(previo.reintentada ? { reintentada: true } : {}),
                                         updated_at: new Date().toISOString() } }) });
  }
  console.log('Otra corrida está escribiendo una pieza. Esta queda en la cola y se lanzará sola.');
  process.exit(0);
}

// El avance se escribe en la fila para que el panel lo pinte como barra: diez
// minutos de caja negra fue exactamente la queja. Nunca falla la corrida por
// no poder anotarse — la barra es cosmética, la pieza no.
// `reintentada` la pone el vigilante y tiene que SOBREVIVIR a cada anotación:
// si el segundo intento la pisara al fallar, el vigilante relanzaría en bucle
// un fallo determinista — pagándolo cada cuatro horas.
const REINTENTADA = item?.progress?.reintentada === true;
const avance = (pct, fase, extra = {}) => SECO ? Promise.resolve() : Promise.all([
  sb(`glossa_radar_items?id=eq.${ITEM}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ progress: { pct, fase, ...extra,
      ...(REINTENTADA ? { reintentada: true } : {}),
      updated_at: new Date().toISOString() } }),
  }).catch(() => {}),
  // El LATIDO del turno. Cada avance renueva la marca de tiempo, así que un
  // turno viejo significa de verdad «esta corrida está muerta» y no «lleva un
  // rato en la parte lenta». Sin esto había que esperar 45 minutos por si
  // acaso; con esto, doce bastan y la cola no se queda parada por un cadáver.
  //
  // Salvo al MORIR, y esa excepción no es un detalle: el último acto de una
  // corrida que se cae era anotar «failed» y, de paso, volver a marcar el turno
  // como suyo con la hora de ese momento. Un cadáver renovando su propio latido
  // — que es justo lo que este latido venía a hacer imposible.
  ...(fase === 'failed' ? [] : [
    sb('glossa_radar_settings', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key: 'pieza_lease', value: { run: YO, at: new Date().toISOString() } }]),
    }).catch(() => {}),
  ]),
]).then(() => {});

// Cualquier muerte a partir de aquí deja la barra en «failed» con su motivo:
// una barra congelada en 45% no le dice a nadie qué pasó ni qué hacer.
//
// Y pasan por `morir()`, no por `avance()` a secas. Esa diferencia es la que
// convirtió un 400 de Gemini en seis horas de cola parada el 2026-08-29:
// `avance()` sólo pinta la barra, mientras que `morir()` además SUELTA EL TURNO,
// cuenta el intento y lanza la siguiente de la cola. Sin eso, un fallo por una
// vía no prevista —aquí, una excepción sin capturar en la llamada a Gemini—
// dejaba el turno cogido, el contador de intentos en cero (así que el tope de
// tres no llegaba nunca) y la pieza `pending` para siempre.
const alMorir = async (e) => {
  try {
    await morir(String(e).slice(0, 300));           // suelta turno, cuenta intento, sigue la cola
  } catch {
    // Si `morir` aún no existe —una excepción muy temprana— al menos se pinta.
    await avance(0, 'failed', { error: String(e).slice(0, 300) });
    console.error(String(e));
    process.exit(1);
  }
};
process.on('uncaughtException', alMorir);
process.on('unhandledRejection', alMorir);
/**
 * Sin cupo diario no se falla: se aparca.
 *
 * Marcar `failed` sería mentir —no hay nada roto en la pieza— y además la
 * sacaría de la cola. Se queda `pending` con el motivo a la vista, se suelta el
 * turno, y `glossa-cola-piezas.yml` la vuelve a intentar sola cada veinte
 * minutos hasta que el cupo vuelva.
 */
async function aparcar(msg) {
  // Aparcar NO gasta intento: no ha fallado nada de la pieza, falta cupo.
  await avance(3, msg, { intentos: Number(item?.progress?.intentos ?? 0) });
  try { await soltarTurno(); } catch { /* el turno caduca solo */ }
  console.log(`\n${msg} — la pieza sigue en la cola y se reintenta sola.`);
  process.exit(0);
}

/**
 * Cuántas veces se ha intentado ya esta pieza.
 *
 * Hace falta desde que la cola reintenta sola: sin contador, una pieza rota de
 * verdad —un vídeo sin nada que leer, una URL muerta— se relanzaría cada veinte
 * minutos hasta el fin de los tiempos, gastando una corrida cada vez y tapando
 * a las que sí pueden salir.
 */
const INTENTOS = Number(item?.progress?.intentos ?? 0) + 1;
const TOPE_INTENTOS = 3;

async function morir(msg) {
  // Al tercer intento se sale de la cola: `state='error'` la saca del turno y
  // la deja en el panel con su motivo, que es donde alguien puede decidir.
  const rendirse = INTENTOS >= TOPE_INTENTOS;
  await avance(0, 'failed', { error: msg, intentos: INTENTOS,
    ...(rendirse ? { agotada: true } : {}) });
  if (rendirse) {
    await sb(`glossa_radar_items?id=eq.${item.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ state: 'error', error: `pieza: ${msg}`.slice(0, 300) }) }).catch(() => {});
    console.error(`Tercer intento fallido: sale de la cola y queda en el panel.`);
  }
  // Se suelta el turno y se lanza la siguiente: una pieza que falla no puede
  // dejar la cola parada detrás de ella.
  try { await soltarTurno(); await siguienteDeLaCola(item.id); } catch (e) { console.error('  (cola)', e.message); }
  console.error(msg);
  process.exit(1);
}

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
    : { fileData: { fileUri: uriDeVideo(item.url) }, videoMetadata: { fps: 0.1 } };
  try {
    digest = await gemini([{ text: promptDigestPieza(item, esTexto) }, parte], 8192);
  } catch (e) {
    if (e.cupoDiario) await aparcar('waiting for the daily Gemini quota (resets at midnight Pacific)');
    throw e;
  }
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
// Y los números YA PEDIDOS que todavía no están en el repo.
//
// La colección se lee del checkout, y una pieza recién escrita tarda unos
// minutos en llegar ahí: primero se encola su publicación, luego el worker
// commitea. En esa ventana el número no existe en los ficheros, así que la
// siguiente pieza lo volvía a pedir — dos N° 42 escribiéndose a la vez, que es
// justo lo que el turno no puede evitar porque las dos corridas son legítimas
// y consecutivas.
//
// La cola de publicación sí los conoce: se mira también ahí.
const pedidos = await sb('glossa_publish_requests?select=issue_no&order=requested_at.desc&limit=200') ?? [];
for (const r of pedidos) {
  const m = String(r.issue_no ?? '').match(/(\d+)/);
  if (m) maxNo = Math.max(maxNo, Number(m[1]));
}

const issueNo = `N° ${maxNo + 1}`;
console.log(`Le toca ${issueNo} (la colección tiene ${piezas.length} piezas, y ${pedidos.length} números pedidos).`);
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

/** Los rótulos de las cajas de contexto de una pieza, en orden. */
const rotulos = (j) => (j.sections ?? []).flatMap(s =>
  (s.blocks ?? []).filter(b => b.type === 'context').map(b => b.label ?? ''));

function validar(j, lado) {
  const fallos = [];
  const prosa = prosaDe(j);

  // El rótulo de una caja es el título que LEE el lector, no un campo de
  // máquina. La edición española los devolvió en inglés —«What is Pemex?»— y
  // repitió la pregunta traducida dentro del cuadro, así que la caja
  // preguntaba dos veces y ninguna en el idioma de la página.
  if (lado === 'es') {
    for (const l of rotulos(j)) {
      if (/^(what|who|how|why|when|where|which)\b/i.test(l)) {
        fallos.push(`la caja «${l.slice(0, 40)}» conserva su rótulo en inglés`);
      }
    }
  }
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

// El contrato de la edición española, entero: la voz (que hereda del original
// pero puede reintroducir por su cuenta), el contrato del español de
// `espanol.js` (calcos, campos en inglés, cifras, paridad estructural) y las
// glosas del pie — que antes, si venían mal, se rellenaban con null EN
// SILENCIO y el pie español se quedaba sin glosa. Todo lo grave se le dice al
// modelo y se reintenta; lo estructural (slug, secciones) ya lo garantiza el
// original, del que esta edición es copia estructural.
function comprobarES(cand) {
  cand.slug = en.slug; cand.track = en.track;   // por si el modelo los «tradujo»
  // El `title` liso llegó una vez en INGLÉS con el `titleHTML` bien traducido:
  // la pestaña, la tarjeta de compartir y el buscador usan el liso. Si el liso
  // parece inglés y el titleHTML no, se deriva de ahí en vez de acusar.
  const sinHTML = String(cand.titleHTML ?? '').replace(/<[^>]+>/g, '').trim();
  if (cand.title && sinHTML && pareceIngles(cand.title) && !pareceIngles(sinHTML)) {
    cand.title = sinHTML;
    console.log(`  el título español venía sin traducir; se toma del titleHTML: «${cand.title}»`);
  }
  const fallos = [];
  for (const f of validar(cand, 'es')) {
    if (/slug|falta |<em>|secciones|bloque/.test(f)) continue;
    fallos.push({ regla: 'voz', detalle: f, grave: true });
  }
  if (glosasEN.length && (!Array.isArray(cand.sources_gloss) || cand.sources_gloss.length !== glosasEN.length)) {
    fallos.push({ regla: 'glosas perdidas',
      detalle: `sources_gloss trae ${Array.isArray(cand.sources_gloss) ? cand.sources_gloss.length : 0} ` +
               `glosas y el pie lleva ${glosasEN.length}: el lector español se quedaría sin ellas`, grave: true });
  }
  fallos.push(...revisarEspanol(cand, en).fallos);
  return { ok: !fallos.some(f => f.grave), fallos };
}

let edicion = await edicionValidada(promptPiezaES(en, glosasEN), comprobarES, {
  en,
  apuntar: async (casa, llamadas, tok, coste) => {
    await apuntar(URL_SB, KEY, casa, llamadas, tok, coste);
    apuntarLocal(gasto, casa, llamadas);
  },
  conRevisor: () => quedaKimi(),
});
if (!edicion) {
  // El último recurso histórico —que traduzca el propio Kimi— se conserva,
  // pero ya no entra sin pasar por el mismo contrato que los demás.
  console.log('  cascada agotada — traduce Kimi (último recurso)');
  const cand = await kimi(promptPiezaES(en, glosasEN), 32000);
  const v = comprobarES(cand);
  if (!v.ok) {
    await morir('La edición española no cumplió el contrato con ningún modelo: ' +
      v.fallos.filter(f => f.grave).map(f => `${f.regla} (${String(f.detalle).slice(0, 60)})`).join('; '));
  }
  edicion = { es: cand, veredicto: { deterministico: v, revisor: null, intentos: [{ modelo: MODELO_KIMI }] }, gastado: 0 };
}
const es = edicion.es;
const fuseEs = { ...edicion.veredicto, ran_at: new Date().toISOString() };
const glosasES = es.sources_gloss ?? glosasEN.map(() => null);
for (const f of fuseEs.deterministico.fallos.filter(f => !f.grave).slice(0, 5)) {
  console.log(`  · ${f.regla}: ${String(f.detalle).slice(0, 80)}`);
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
  // La fecha española se arma a mano —«25 de agosto de 2026»— porque
  // toLocaleDateString con mes corto daba «25 ago 2026», sin «de» y con el
  // mes amputado, y catorce piezas salieron así (alguna con el mes en INGLÉS).
  const fecha = lang === 'es'
    ? formatearFechaES(ahora)
    : ahora.toLocaleDateString('en-GB',
        { timeZone: 'America/Los_Angeles', day: 'numeric', month: 'long', year: 'numeric' });
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
    // Con el N.º del idioma y truncado en límite de palabra: 22 piezas salieron
    // con «N° » en la edición española y alguna cortada a mitad de apellido
    // («…Kelsey Butler · Bloomb»).
    `sourceLabel: ${yamlStr(`${numero} · ${(() => {
      const credito = (j.source || item.title).replace(/^Based on |^Basado en /, '');
      return credito.length > 100 ? credito.slice(0, 100).replace(/\s+\S*$/, '') + '…' : credito;
    })()}`)}`,
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
    model: MODELO_KIMI, fuse_es: fuseEs }]),
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

await soltarTurno();
await siguienteDeLaCola(item.id);

console.log(`\n${issueNo} encolado para publicar: ${en.slug}`);
console.log('El worker de publicación commitea los MDX y Vercel despliega — en vivo en unos minutos.');
