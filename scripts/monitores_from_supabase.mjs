// monitores_from_supabase.mjs — las fuentes que no tienen feed.
//
// Un canal se sondea porque sabes su URL. Un tema —«Mexico politics»— o una
// persona —«John Mearsheimer»— no tienen dónde ir: hay que preguntarle a un
// buscador. Esto es el port de `phd-agents/monitors/main.py` de thesis, que
// lleva tiempo funcionando; los nombres se conservan para que se reconozca.
//
// Lo que encuentra entra en `glossa_radar_items` con `origin='busqueda'` y su
// texto ya dentro, así que el análisis existente lo recoge SIN CAMBIAR NADA:
// mismo prompt, misma extracción, mismo número semanal. Tavily devuelve entre
// 6.000 y 21.000 caracteres de artículo, o sea que es estructuralmente idéntico
// a un texto pegado, que ya funciona de punta a punta.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, TAVILY_API_KEY.

import { ajustes, uso as gastoActual, apuntar, apuntarLocal, cabe } from '../src/lib/presupuesto.js';

const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const TAVILY = process.env.TAVILY_API_KEY || '';
if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!TAVILY) { console.error('Falta TAVILY_API_KEY'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function sb(path, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 240)}`);
  return t ? JSON.parse(t) : null;
}

// Cada cuánto le toca a cada fuente. Copiado de `SCHEDULE_DELTAS`.
const CADA = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };

// La misma ventana que usa el radar para los feeds (BACKFILL_DIAS = 7). Lo que
// caiga fuera no puede salir en el número, así que analizarlo es tirar cuota.
// El corte de aceptación es el arranque de la semana abierta, de la MISMA
// función que usa el número. Con «7 días atrás», el jueves entraba un artículo
// del viernes anterior que se digería —gastando cuota— para no poder aparecer
// nunca: su semana ya había cerrado.
let CORTE = new Date(Date.now() - 7 * 864e5);   // se sustituye abajo, tras leer la ventana

/**
 * La compuerta de relevancia, y es lo más valioso de todo esto.
 *
 * Una búsqueda de «John Mearsheimer» devolvió, entre cinco resultados, una guía
 * de fantasy football. Exigir que las palabras clave aparezcan en el título o el
 * resumen la descarta **sin gastar una sola llamada a un modelo**. Es el mismo
 * problema que los Shorts en YouTube con otra cara: material que no es material
 * consumiendo cuota.
 */
function pasaFiltro(hallazgo, req = [], exc = [], persona = false) {
  const titulo = String(hallazgo.title ?? '').toLowerCase();
  const cuerpo = `${titulo} ${hallazgo.content ?? ''} ${hallazgo.raw_content ?? ''}`.toLowerCase();
  if (exc.length && exc.some(k => cuerpo.includes(String(k).toLowerCase()))) return false;
  if (!req.length) return true;
  if (!req.every(k => cuerpo.includes(String(k).toLowerCase()))) return false;

  // Para una PERSONA no basta con que su nombre aparezca: tiene que ser material
  // sobre ella o de ella, no un artículo donde se la nombra de pasada.
  //
  // Medido: dos entradas buenas traían el nombre en el título y lo repetían 28 y
  // 44 veces. Dos malas lo mencionaban 1 y 3 veces, y la de una vez decía
  // literalmente «una versión del realismo que va más allá de la versión burda de
  // John Mearsheimer» — otro autor citándolo para distanciarse de él.
  if (!persona) return true;
  return req.every(k => {
    const kk = String(k).toLowerCase();
    if (titulo.includes(kk)) return true;                    // en el título: es suyo
    return cuerpo.split(kk).length - 1 >= 5;                  // o lo bastante presente
  });
}

// Páginas que hablan de QUIÉN es alguien, no de qué dijo. Buscar «John
// Mearsheimer» sin esto devolvió su bibliografía de Wikipedia (120.000
// caracteres), su ficha de Britannica, su perfil de Goodreads y su página de
// facultad. Todas llevan su apellido, así que la compuerta de palabras clave las
// dejaba pasar: el filtro estaba bien, la consulta estaba mal.
const REFERENCIA = [
  'wikipedia.org', 'britannica.com', 'goodreads.com', 'imdb.com', 'linkedin.com',
  'amazon.com', 'researchgate.net', 'academia.edu', 'scholar.google.com',
];
const esReferencia = (url) => {
  try { const h = new URL(url).hostname.replace(/^www\./, '');
        return REFERENCIA.some(d => h === d || h.endsWith('.' + d)); }
  catch { return false; }
};

async function buscar(fuente) {
  // Tanto de un tema como de una persona interesa lo que ha PASADO, no lo que
  // son. Las dos van en modo noticias.
  //
  // Y las dos con la MISMA ventana que el radar (BACKFILL_DIAS = 7, más un día
  // de margen para que nada caiga en el hueco entre dos corridas). Traer tres
  // semanas de una persona parecía generoso y era desperdicio: el número cubre
  // siete días, así que lo más viejo se analizaba —gastando cuota— para no poder
  // aparecer nunca. Si alguien no habló esta semana, no sale esta semana.
  const persona = fuente.kind === 'persona';
  const cuerpo = {
    query: '', topic: 'news',
    days: 8,
    max_results: persona ? 8 : 5,
    // Una persona habla menos a menudo que lo que ocurre en un país entero, así
    // que en la misma ventana hay que buscar más fino para encontrarla.
    search_depth: persona ? 'advanced' : 'basic',
    include_raw_content: true,
    ...(fuente.domains?.length ? { include_domains: fuente.domains } : {}),
  };
  const consultas = Array.isArray(fuente.queries) && fuente.queries.length
    ? fuente.queries : [fuente.name];

  const out = [];
  for (const q of consultas) {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TAVILY}` },
      body: JSON.stringify({ ...cuerpo, query: q }),
    });
    if (!r.ok) throw new Error(`tavily ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    // `advanced` cuesta 2 créditos y `basic` 1. Apuntar siempre 1 dejaba el tope
    // midiendo por debajo justo en las búsquedas más caras. Y también en la
    // copia local: sin eso, `cabe()` miraba la foto del arranque toda la corrida.
    await apuntar(URL_SB, KEY, 'tavily', persona ? 2 : 1);
    apuntarLocal(gasto, 'tavily', persona ? 2 : 1);
    out.push(...(d.results ?? []));
  }
  return out;
}

// ── Corrida ────────────────────────────────────────────────────────────────
{
  const [v] = await sb('rpc/glossa_semana_actual', { method: 'POST', body: '{}' });
  if (v) CORTE = new Date(v.desde);
  console.log(`Aceptando desde ${CORTE.toISOString().slice(0, 10)} (arranque de la semana, hora de Los Ángeles)`);
}

const ajus = await ajustes(URL_SB, KEY);
const gasto = await gastoActual(URL_SB, KEY);

const fuentes = await sb(
  `glossa_radar_sources?select=*&active=is.true&kind=in.(tema,persona)` +
  `&or=(next_run_at.is.null,next_run_at.lte.${new Date().toISOString()})`);

if (!fuentes.length) { console.log('Ninguna fuente por búsqueda le toca hoy.'); process.exit(0); }
console.log(`${fuentes.length} fuente(s) por buscar`);

let nuevos = 0, descartados = 0;

for (const f of fuentes) {
  // El tope se mira ANTES de cada fuente, no una vez al principio: una fuente con
  // cinco consultas puede agotarlo ella sola.
  if (!cabe(gasto, ajus, 'tavily', 'cap_tavily_mes', 'mes')) {
    console.log(`  tope mensual de Tavily alcanzado — se para aquí`);
    break;
  }

  try {
    const hallazgos = await buscar(f);
    const req = f.keywords_required ?? [];
    const exc = f.keywords_excluded ?? [];
    const filas = [];

    for (const h of hallazgos) {
      if (!h.url) continue;
      if (esReferencia(h.url)) { descartados++; continue; }
      if (!pasaFiltro(h, req, exc, f.kind === 'persona')) { descartados++; continue; }
      const texto = h.raw_content || h.content;
      if (!texto || texto.length < 400) { descartados++; continue; }

      // Sin fecha de publicación no es una noticia, es una página que lleva ahí
      // años. Y sellarla con la de hoy la metería en el número de esta semana,
      // que es justo lo que se quiso evitar al guardar la fecha real.
      if (!h.published_date) { descartados++; continue; }

      // Y la fecha se COMPRUEBA, no se da por buena. Pidiendo `days: 8` volvió
      // un artículo del 25 de julio: el filtro del buscador no es estricto. Sin
      // esto, cinco de cada ocho hallazgos se analizaban —gastando cuota— para
      // caer fuera de la ventana del número y no aparecer nunca.
      const cuando = new Date(h.published_date);
      if (isNaN(cuando) || cuando < CORTE) { descartados++; continue; }

      filas.push({
        source_id: f.id, origin: 'busqueda',
        external_id: h.url, url: h.url,
        title: String(h.title ?? h.url).slice(0, 300),
        author: (() => { try { return new URL(h.url).hostname.replace(/^www\./, ''); } catch { return null; } })(),
        body_text: String(texto).slice(0, 120_000),
        // La fecha REAL del documento, no la de hoy. La ventana semanal se calcula
        // sobre `published_at`: sellarlo con `now()` metería un artículo de 2019
        // en el número de esta semana.
        published_at: new Date(h.published_date).toISOString(),
        state: 'pending',
      });
    }

    if (filas.length) {
      const puestos = await sb('glossa_radar_items?on_conflict=external_id', {
        method: 'POST', body: JSON.stringify(filas),
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      });
      nuevos += puestos?.length ?? 0;
    }

    const dias = CADA[f.schedule] ?? 7;
    await sb(`glossa_radar_sources?id=eq.${f.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        last_checked_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
        next_run_at: new Date(Date.now() + dias * 864e5).toISOString(),
      }),
    });
    console.log(`  ${f.name}: ${hallazgos.length} hallados · ${filas.length} entran`);
  } catch (e) {
    // Una fuente rota no para al resto, pero se cuenta: tres fallos seguidos y
    // conviene mirarla en el panel.
    console.error(`  ${f.name}: ${String(e).slice(0, 160)}`);
    await sb(`glossa_radar_sources?id=eq.${f.id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        consecutive_failures: (f.consecutive_failures ?? 0) + 1,
        next_run_at: new Date(Date.now() + 864e5).toISOString(),
      }),
    });
  }
}

console.log(`\n${nuevos} entran en la cola · ${descartados} descartados por relevancia o por venir vacíos`);
