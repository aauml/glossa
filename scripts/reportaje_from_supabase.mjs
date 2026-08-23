// reportaje_from_supabase.mjs — sale a buscar los asuntos de la semana fuera de
// las fuentes seguidas.
//
// El problema que resuelve, medido: en el número del 2026-08-16, 190 de 195
// elementos venían de los canales de YouTube seguidos. El cotejo sí consultó 19
// documentos externos —Reuters, la BBC, congress.gov, el Tesoro— pero los pidió
// SIN texto (`include_raw_content: false`), emitió un veredicto sobre una frase
// y los tiró. Ninguno llegó al número. Una pieza sobre las elecciones de medio
// mandato se escribió con cuatro programas de opinión y nada más.
//
// Aquí un tema deja de ser una etiqueta y pasa a ser un encargo: se sale a
// buscar cómo lo cubren otros medios y otros países, se trae el TEXTO, y entra
// como material.
//
// Cadena: cron del Action (viernes 07:00 UTC)
//         -> glossa_radar_temas_semana: en qué se agrupó la semana
//         -> Gemini propone consultas por tema (el código las constriñe)
//         -> Tavily con include_raw_content
//         -> filtros mecánicos, luego promptReporte (gratis) por hallazgo
//         -> se mide si los medios DIVERGEN; si convergen se para
//         -> UPSERT en glossa_radar_items con origin='reportaje', ya digerido
//         -> una fila de parte en glossa_radar_reportajes, encuentre o no
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, TAVILY_API_KEY, GEMINI_API_KEY.

import {
  ajustes, uso as gastoActual, apuntar, apuntarLocal, cabe,
  estadoTavily, diasHastaReset, reparto, repartirEntreTemas, otrosGastos,
} from '../src/lib/presupuesto.js';
import { barrido, lectura, urgencia, BASE, LOCALES } from '../src/lib/gnews.mjs';
import { censo, gdeltVivo } from '../src/lib/gdelt.mjs';
import { promptConsultas, promptReporte } from './prompts_reportaje.mjs';
import {
  dominio, huellaUrl, fichas, jaccard,
  esChatarra, esReferencia, esPlataforma, PLATAFORMAS, CHATARRA, REFERENCIA,
} from '../src/lib/hallazgos.js';

const URL_SB  = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY     = process.env.SUPABASE_SERVICE_KEY || '';
const TAVILY  = process.env.TAVILY_API_KEY || '';
const GEMINI  = process.env.GEMINI_API_KEY || '';
const MODELO  = 'gemini-3.1-flash-lite';

if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!TAVILY)         { console.error('Falta TAVILY_API_KEY'); process.exit(1); }
if (!GEMINI)         { console.error('Falta GEMINI_API_KEY'); process.exit(1); }

// `=== '1'`, no truthiness: la entrada del workflow dice «1 = sí», y quien
// respondiera `0` —la forma natural de decir que no— habría hecho un seco.
const SECO = process.env.REPORTAJE_DRY === '1';   // no escribe nada; sí busca y digiere
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function sb(path, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

// ── La ventana ───────────────────────────────────────────────────────────
// EXACTAMENTE la ventana que va a leer el número, no una de ocho días como la
// del cotejo. El guion semanal corre el domingo y mira de domingo a sábado; si
// aquí se buscara ocho días hacia atrás, un reportaje del jueves ANTERIOR se
// guardaría en la tabla y el número nunca lo vería —trabajo pagado que no
// aparece en ninguna parte, que es la forma más cara de fallar en silencio—.
//
// `week_start` es ese mismo domingo, no hoy: si el parte se archivara con la
// fecha del viernes, el número y su reportaje quedarían en semanas distintas y
// nadie podría cruzarlos.
const ahora = process.env.REPORTAJE_HOY ? new Date(process.env.REPORTAJE_HOY) : new Date();
const [ventana] = await sb('rpc/glossa_semana_actual', {
  method: 'POST', body: JSON.stringify({ ref: ahora.toISOString() }),
});
if (!ventana) { console.error('No se pudo leer la ventana de la semana.'); process.exit(1); }
const desde  = new Date(ventana.desde);
const finDia = new Date(ventana.hasta);
const SEMANA = desde.toISOString().slice(0, 10);

// Con la semana ya cerrada no se sale a buscar: lo que se encontrara pertenecería
// a la semana siguiente y el número de esta mañana no lo vería nunca.
//
// La condición mira la VENTANA, no el día de la semana en UTC. Preguntar por
// `getUTCDay() === 0` funcionaba cuando todo estaba en hora de Greenwich; anclada
// la semana a Los Ángeles, el sábado por la noche de allí YA es domingo aquí, y
// esa comprobación habría rechazado justo la corrida más útil.
if (!ventana.parcial) {
  console.log('La semana ya cerró: lo que se encontrara ahora no llegaría a su número. Se sale sin gastar.');
  process.exit(0);
}

console.log(`Reportaje · ventana ${desde.toISOString().slice(0,10)} → ${finDia.toISOString().slice(0,10)} · semana ${SEMANA}`);

// ── Presupuesto ──────────────────────────────────────────────────────────
const ajus  = await ajustes(URL_SB, KEY);
const gasto = await gastoActual(URL_SB, KEY);
// Los topes ya no son el motor, son el techo. Lo que decide cuánto se gasta es
// el cupo real que queda en Tavily repartido entre las semanas que faltan, y lo
// que decide DÓNDE se gasta es el barrido gratis de más abajo. Un tope escrito a
// mano envejece en cuanto se añade la fuente número treinta y cuatro; el reparto
// no.
const TOPE_SEMANA_MAX = Number(ajus.reportaje_busquedas_semana ?? 60);  // búsquedas
const RONDAS_MAX   = 3;
const POR_TEMA_MAX = 3;          // reportajes que ENTRAN por tema
const TOTAL_MAX    = Number(ajus.reportaje_entran_semana ?? 24);

let busquedas = 0;
let CUOTA_TEMA = 0;              // lo fija el reparto, tema a tema
let busquedasTema = 0;
const quedaBusqueda = () =>
  busquedasTema < CUOTA_TEMA &&
  busquedas < TOPE_SEMANA_MAX &&
  cabe(gasto, ajus, 'tavily', 'cap_tavily_mes', 'mes');
const quedaGemini = () => cabe(gasto, ajus, 'gemini', 'cap_gemini_dia', 'hoy');

// ── Los temas ────────────────────────────────────────────────────────────
const temas = await sb('rpc/glossa_radar_temas_semana', {
  method: 'POST',
  body: JSON.stringify({ desde: desde.toISOString(), hasta: finDia.toISOString() }),
});
if (!temas?.length) { console.log('Ningún tema reunió material esta semana.'); process.exit(0); }
console.log(`${temas.length} temas con material.`);

// Los dominios de las fuentes seguidas: buscar y encontrarse a uno mismo no es
// salir a ningún sitio.
const fuentes = await sb('glossa_radar_sources?select=feed_url,name');
const dominiosFuente = new Set((fuentes ?? []).map(f => dominio(f.feed_url ?? '')).filter(Boolean));

// Lo que ya está en la tabla, para no volver a traerlo ni a pagarlo.
const yaHay = await sb(
  `glossa_radar_items?select=url&published_at=gte.${desde.toISOString()}&limit=2000`);
const huellasVistas = new Set((yaHay ?? []).map(x => huellaUrl(x.url)).filter(Boolean));

const EXCLUIR = [...new Set([...dominiosFuente, ...PLATAFORMAS, ...CHATARRA, ...REFERENCIA])];

// ── Buscar ───────────────────────────────────────────────────────────────
async function buscar(q) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TAVILY}` },
    body: JSON.stringify({
      query: String(q).slice(0, 380), topic: 'news',
      // Los días de búsqueda son los de la VENTANA. Con 8 fijos, un viernes se
      // pagaban resultados de días que el filtro de fecha iba a tirar.
      days: Math.max(2, Math.ceil((finDia - desde) / 864e5)), max_results: 5,
      search_depth: 'advanced',
      include_raw_content: true,       // ← toda la diferencia con el cotejo
      exclude_domains: EXCLUIR.slice(0, 150),
    }),
  });
  if (!r.ok) throw new Error(`tavily ${r.status}: ${(await r.text()).slice(0, 200)}`);
  // Se apunta DESPUÉS de saber que respondió: una clave rotada devolvía 401 y
  // aun así registraba dos créditos y quemaba una búsqueda del cupo — y la
  // corrida entera habría concluido «no había más que divergiera» cuando lo
  // cierto era que nada funcionó. `advanced` cuesta dos créditos, y se apunta
  // también en la copia local: el contador de `cabe()` es una foto del arranque.
  busquedas++; busquedasTema++;
  await apuntar(URL_SB, KEY, 'tavily', 2);
  apuntarLocal(gasto, 'tavily', 2);
  return (await r.json()).results ?? [];
}

async function gemini(prompt, maxTokens = 4096) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens },
      }) });
  if (!r.ok) {
    // El tramo gratuito devuelve 503 «high demand» a menudo, y no es culpa del
    // documento. Perder un reportaje por eso sería tirar una búsqueda ya pagada.
    if (r.status === 503 || r.status === 429) {
      await new Promise(x => setTimeout(x, 4000));
      const r2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
        { method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens },
          }) });
      if (!r2.ok) throw new Error(`gemini ${r2.status}`);
      return leerGemini(await r2.json());
    }
    throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  return leerGemini(await r.json());
}

/**
 * El primer objeto JSON completo de una respuesta.
 *
 * Con `responseMimeType: 'application/json'` puesto, este modelo aun así devolvió
 * un objeto y luego más texto —«Unexpected non-whitespace character after JSON at
 * position 605»—, y el tema entero se perdió por eso. Se recorta contando llaves
 * en vez de confiar en que la respuesta acabe donde debería.
 */
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

async function leerGemini(d) {
  const tok = d.usageMetadata?.totalTokenCount ?? 0;
  await apuntar(URL_SB, KEY, 'gemini', 1, tok);
  apuntarLocal(gasto, 'gemini', 1);
  const txt = (d.candidates?.[0]?.content?.parts ?? []).map(x => x.text || '').join('');
  return jsonDeModelo(txt);
}

// ── Las consultas: el modelo propone, el código manda ─────────────────────
const ANGLOFONOS = new Set(['US','GB','UK','AU','NZ','CA','IE']);

async function proponerConsultas(tema, material, pista, vistos) {
  let out;
  try { out = await gemini(promptConsultas(tema, material, pista, vistos), 1024); }
  catch (e) { console.log(`    consultas: ${String(e).slice(0, 90)}`); return { paises: [], consultas: [] }; }

  const paises = (out.countries ?? []).map(c => String(c).toUpperCase().slice(0, 2)).slice(0, 3);
  const etiqueta = String(tema.label).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const consultas = (out.queries ?? [])
    .map(q => ({ q: String(q.q ?? '').trim().slice(0, 380),
                 lang: String(q.lang ?? 'en').slice(0, 2),
                 // El modelo devuelve `terms` como texto unas veces y como lista
                 // otras. Sin esto, la lista se volvía «Trump,Iran,Hormuz», la
                 // limpieza se comía las comas y quedaba una palabra pegada que
                 // no existe en ningún titular: cero notas, y el barrido
                 // concluyendo «nadie lo cubrió».
                 terms: (Array.isArray(q.terms) ? q.terms.join(' ') : String(q.terms ?? ''))
                          .trim().slice(0, 80) }))
    // Una consulta que es la etiqueta con puntuación no es una consulta: es lo
    // que ya sabíamos, y devuelve teletipo.
    .filter(q => q.q.length > 8 &&
                 q.q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() !== etiqueta)
    .slice(0, 2);

  // Si el tema toca un país no anglófono y todas las consultas salieron en
  // inglés, el código añade una: la prensa de ese país no publica en inglés, y
  // aceptar el juego entero en inglés es no haber salido.
  const otro = paises.find(p => !ANGLOFONOS.has(p));
  if (otro && consultas.length && consultas.every(q => q.lang === 'en')) {
    consultas[consultas.length - 1] = { q: `${tema.label} ${otro}`.slice(0, 380), lang: 'xx', forzada: true };
  }
  return { paises, consultas };
}

// ── Filtros mecánicos, antes de gastar nada ──────────────────────────────
function filtrar(resultados, estado) {
  const pasan = [];
  // Los dominios que ya llevan un candidato EN ESTA TANDA. Sin esto, dos
  // resultados de la misma búsqueda y el mismo medio pasaban los dos: el
  // registro de dominios aceptados solo se marcaba después de digerir, así que
  // dentro de una tanda no había nada que los separara. Pasó con bbc.com.
  const enTanda = new Set();
  for (const h of resultados) {
    const url = h.url || '';
    if (!url) { estado.descartes.sin_url = (estado.descartes.sin_url || 0) + 1; continue; }
    const dom = dominio(url);

    if (esReferencia(url) || esChatarra(url) || esPlataforma(url)) {
      estado.descartes.plataforma_o_referencia = (estado.descartes.plataforma_o_referencia || 0) + 1; continue;
    }
    if (dominiosFuente.has(dom)) {
      estado.descartes.fuente_propia = (estado.descartes.fuente_propia || 0) + 1; continue;
    }
    // Un medio por tema. Seis medios contando la misma historia es el modo de
    // fallo que esto existe para no cometer, y limitar el dominio es la mitad
    // más barata del arreglo.
    if (estado.dominios.has(dom) || enTanda.has(dom)) {
      estado.descartes.dominio_repetido = (estado.descartes.dominio_repetido || 0) + 1; continue;
    }
    const hu = huellaUrl(url);
    if (huellasVistas.has(hu)) {
      estado.descartes.ya_en_la_tabla = (estado.descartes.ya_en_la_tabla || 0) + 1; continue;
    }
    const texto = String(h.raw_content ?? h.content ?? '');
    // Los recortes de muro de pago mueren aquí, y hay que CONTARLOS: son lo que
    // tuerce la base de fuentes hacia agencias y radios públicas.
    if (texto.length < 400) {
      estado.vacios.add(dom);
      estado.descartes.sin_texto = (estado.descartes.sin_texto || 0) + 1; continue;
    }
    if (!h.published_date) {
      estado.descartes.sin_fecha = (estado.descartes.sin_fecha || 0) + 1; continue;
    }
    const fecha = new Date(h.published_date);
    if (!(fecha >= desde && fecha < finDia)) {
      estado.descartes.fuera_de_ventana = (estado.descartes.fuera_de_ventana || 0) + 1; continue;
    }
    enTanda.add(dom);
    pasan.push({ url, dom, titulo: h.title || dom, texto, fecha, huella: hu });
  }
  return pasan;
}

// ── Medir si los medios divergen ─────────────────────────────────────────
//
// Esto es lo que ajusta el gasto solo. Se mide sobre el reportaje YA digerido,
// no sobre el texto crudo: `what_happened` viene en inglés y normalizado, así
// que dos reportes de la misma historia en idiomas distintos se parecen de
// verdad, y `figures` da una prueba de choque limpia que un regex sobre el
// artículo entero no puede dar.
function medir(entradas) {
  const relatos = [];
  for (const e of entradas) {
    const f = fichas(e.reporte.what_happened || e.titulo);
    const ag = e.reporte.wire && e.reporte.wire !== 'none' ? e.reporte.wire : null;
    const enc = relatos.find(r =>
      jaccard(r.fichas, f) >= 0.6 || (ag && r.agencia === ag && jaccard(r.fichas, f) >= 0.4));
    if (enc) enc.miembros.push(e);
    else relatos.push({ fichas: f, agencia: ag, miembros: [e] });
  }

  // Choque: dos reportes que miden LO MISMO y publican cifras distintas. No es
  // solo la señal para seguir buscando — es la pieza.
  const choques = [];
  for (let i = 0; i < entradas.length; i++) {
    for (let j = i + 1; j < entradas.length; j++) {
      for (const a of entradas[i].reporte.figures ?? []) {
        for (const b of entradas[j].reporte.figures ?? []) {
          if (jaccard(fichas(a.measures), fichas(b.measures)) < 0.5) continue;
          const na = String(a.figure).replace(/[^\d.]/g, '');
          const nb = String(b.figure).replace(/[^\d.]/g, '');
          if (!na || !nb || na === nb) continue;
          choques.push(`${entradas[i].dom} says ${a.figure} and ${entradas[j].dom} says ${b.figure} ` +
                       `for the same thing (${a.measures})`);
        }
      }
    }
  }

  // Quién aparece citado en más de un reporte: dos medios que entrevistaron por
  // su cuenta al MISMO funcionario se parecen a reporteo independiente y no lo
  // son del todo. No se descarta —se cuenta y se dice.
  const bocas = {};
  for (const e of entradas) {
    for (const a of e.reporte.attributed ?? []) {
      const nombre = String(a.who ?? '').split(/[(,]/)[0].trim();
      if (nombre.split(/\s+/).length < 2) continue;
      const k = nombre.toLowerCase();
      (bocas[k] ||= { nombre, medios: new Set() }).medios.add(e.dom);
    }
  }
  const compartidas = Object.values(bocas).filter(b => b.medios.size > 1)
    .map(b => `${b.nombre} was on the record in ${[...b.medios].join(' and ')} — ` +
              `two outlets relaying the same person is one account, not two`);

  return {
    relatos: relatos.length,
    dispersion: entradas.length ? Number((relatos.length / entradas.length).toFixed(2)) : 0,
    colapsados: relatos.filter(r => r.miembros.length > 1).map(r => ({
      agencia: r.agencia, medios: r.miembros.map(m => m.dom),
    })),
    choques, compartidas,
    paises: [...new Set(entradas.map(e => e.reporte.country).filter(Boolean))],
  };
}

// ── El material concreto de un tema ──────────────────────────────────────
//
// El ángulo sale de lo CONCRETO. La etiqueta —«Security dynamics in the Middle
// East»— es una abstracción del clasificador y buscarla no devuelve nada
// aprovechable; lo que se puede buscar son las cifras, los nombres y las fechas
// que dijeron los canales.
async function materialDe(tema) {
  const suyos = await sb(
    `glossa_radar_item_topics?select=item_id&topic_id=eq.${tema.topic_id}&limit=200`);
  const ids = (suyos ?? []).map(x => x.item_id);
  const elementos = ids.length ? await sb(
    `glossa_radar_items?select=digest,published_at&id=in.(${ids.slice(0, 100).join(',')})` +
    `&state=eq.digested&origin=eq.feed&order=published_at.desc&limit=8`) : [];
  const material = [];
  for (const e of elementos) {
    if (e.digest?.thesis) material.push(e.digest.thesis);
    for (const c of (e.digest?.claims ?? []).slice(0, 3)) {
      if (c.checkable && c.claim) material.push(c.claim);
    }
  }
  return material;
}

// ── Fase 1 · La anchura, que no cuesta ───────────────────────────────────
//
// TODOS los temas salen a la calle, no los seis mayores. Puede hacerse porque
// esta pasada no gasta cupo: Google News RSS no cobra, no pide clave y no tiene
// tope. Lo que devuelve es el censo —quién cubrió el asunto, desde qué país y
// con qué titular— y no el texto, que va cifrado.
//
// Y eso es exactamente lo que hace falta aquí, porque la pregunta de esta fase
// no es «¿qué dijeron?» sino «¿merece la pena pagar por leerlo?». Si cuarenta
// medios de cinco países titulan lo mismo, el asunto ya está corroborado y
// comprarlo otra vez no compra nada. Ese cero es lo que financia a los temas de
// los que nadie más ha escrito.

const TEMAS_BARRIDO = Number(process.env.REPORTAJE_TEMAS) ||
                      Number(ajus.reportaje_temas_barrido ?? 14);

console.log(`\n── Barrido (gratis) sobre ${Math.min(temas.length, TEMAS_BARRIDO)} temas ──`);
const leidos = [];
for (const tema of temas.slice(0, TEMAS_BARRIDO)) {
  const material = await materialDe(tema);
  let prop = { paises: [], consultas: [] };
  if (quedaGemini()) prop = await proponerConsultas(tema, material.slice(0, 12), '', []);

  const paises = [...new Set([...BASE, ...prop.paises])].filter(x => LOCALES[x]);
  // El censo lo hace GDELT: una consulta suya devuelve más medios y más países
  // que catorce de Google News, y además trae la URL real. Google News queda de
  // reserva para cuando GDELT no contesta —su límite de cortesía es duro— porque
  // quedarse sin censo es peor que tener uno más pobre.
  const claves = prop.consultas.map(c => c.terms || c.q).filter(Boolean);
  let notas = [], consultadas = [], via = 'gdelt';

  if (claves.length && gdeltVivo()) {
    const cens = await censo(claves, { desde, hasta: finDia, maxConsultas: 2 });
    notas = cens.articulos;
    consultadas = cens.consultadas.map(q => ({ q, pais: 'mundo' }));

    // Solo se cae a la reserva si GDELT NO contestó. Si contestó y no había
    // nada, eso es una respuesta y hay que respetarla: repetir la pregunta en
    // otro sitio para obtener la que gusta es lo contrario de comprobar.
    if (cens.motivos.length) console.log(`      censo: ${cens.motivos.join(' · ')}`);
    if (!consultadas.length && cens.fallos) {
      const g = await barrido(claves, paises, { desde, hasta: finDia, maxConsultas: 14 });
      notas = g.notas; consultadas = g.consultadas; via = 'gnews';
      if (g.motivos?.length) console.log(`      reserva: ${g.motivos.slice(0, 3).join(' · ')}`);
    }
  } else if (claves.length) {
    // GDELT apagado por el cortacircuitos: se va directo a la reserva sin pagar
    // otra espera. Se dice, porque un censo más pobre que nadie anunció es
    // indistinguible de una semana sin noticias.
    const g = await barrido(claves, paises, { desde, hasta: finDia, maxConsultas: 14 });
    notas = g.notas; consultadas = g.consultadas; via = 'gnews (gdelt apagado)';
    if (g.motivos?.length) console.log(`      reserva: ${g.motivos.slice(0, 3).join(' · ')}`);
  }
  const lect = { ...lectura(notas, consultadas), via };
  const urg  = urgencia(lect);

  leidos.push({ tema, material, prop, barrido: lect, urgencia: urg });
  console.log(`  ${String(lect.notas).padStart(3)} notas · ${String(lect.medios).padStart(3)} medios · ` +
              `${(lect.paises.join(',') || '—').padEnd(14)} acuerdo ${lect.acuerdo ?? '—'} · ` +
              `urgencia ${urg.nivel} (${urg.porque}) · ${tema.label.slice(0, 46)}`);
  if (process.env.REPORTAJE_VERBOSO === '1') {
    console.log(`      consultas: ${(lect.consultas_texto ?? []).map(q => `«${q}»`).join(' ') || '—'}` +
                `  ·  largas: ${prop.consultas.map(c => `«${c.q.slice(0, 60)}»`).join(' ') || '—'}`);
  }
}

// ── Fase 2 · La profundidad, que sí cuesta ───────────────────────────────
const tav   = await estadoTavily(TAVILY);
const otros = await otrosGastos(sb);
const dias  = diasHastaReset(ahora, Number(ajus.tavily_dia_reset ?? 1));
const rep   = reparto({
  restantes: tav.ok ? tav.restantes : null,
  dias, otrosPorSemana: otros, maximo: TOPE_SEMANA_MAX * 2,
});
// El cupo se mide en créditos y una búsqueda «advanced» son dos.
const BUSQUEDAS_SEMANA = Math.max(1, Math.floor(rep.semana / 2));

console.log(`\n── Cupo ──`);
console.log(tav.ok
  ? `  Tavily ${tav.usados}/${tav.tope} usados · ${tav.restantes} libres · renueva en ${dias} d`
  : `  Tavily no contestó (${tav.motivo}); se cae al tope de mano`);
console.log(`  ${rep.nota}`);
console.log(`  Esta semana: ${BUSQUEDAS_SEMANA} búsquedas para el reportaje`);

// Se deja anotado para el panel. La alternativa era darle al panel la clave de
// Tavily para que preguntara él; esto expone un secreto menos y da la misma
// cifra, con la fecha al lado para que se vea si está rancia.
if (!SECO && tav.ok) {
  await sb('glossa_radar_settings?on_conflict=key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{
      key: 'tavily_estado',
      value: {
        usados: tav.usados, tope: tav.tope, restantes: tav.restantes, plan: tav.plan,
        dias_para_renovar: dias, otros_por_semana: otros,
        busquedas_semana: BUSQUEDAS_SEMANA, visto: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }]),
  }).catch(e => console.log(`  · no se pudo anotar el cupo: ${String(e).slice(0, 80)}`));
}

const conCuota = repartirEntreTemas(leidos, BUSQUEDAS_SEMANA, { porTemaMax: POR_TEMA_MAX + 3 });
for (const t of conCuota) {
  console.log(`  ${String(t.cuota).padStart(2)} → ${t.tema.label.slice(0, 60)}`);
}

// El plan sin comprarlo. Sirve para probar el barrido sin gastar cupo, y sirve
// para lo otro: ver a qué se va a ir el dinero de la semana ANTES de que se vaya.
if (process.env.REPORTAJE_SOLO_BARRIDO === '1') {
  console.log('\nSolo barrido: no se gasta nada.');
  process.exit(0);
}

// ── Corrida ──────────────────────────────────────────────────────────────
const partes = [];
let entranTotal = 0;

for (const leido of conCuota) {
  const { tema, material, barrido: lect, urgencia: urg, cuota } = leido;
  if (entranTotal >= TOTAL_MAX) { console.log('Tope de reportajes de la semana alcanzado.'); break; }

  CUOTA_TEMA = cuota; busquedasTema = 0;

  // Cuota cero no es un tema saltado: es un tema comprobado gratis y hallado
  // corroborado. Se escribe su parte igual, o el número no podría distinguir
  // «nadie lo verificó» de «lo verificaron cuarenta medios».
  if (cuota <= 0) {
    console.log(`\n▸ ${tema.label}  · sin gasto: ${urg.porque} (${lect.medios} medios, ${lect.paises.length} países)`);
    partes.push({ tema: tema.label, fila: {
      topic_id: tema.topic_id, week_start: SEMANA, label: tema.label,
      queries: [], paises: lect.paises, rondas: 0, busquedas: 0,
      hallados: 0, entran: 0, colapsados: [], dominios_vacios: [],
      dispersion: null, paro: 'corroborado_gratis',
      barrido: lect, urgencia: urg, cuota: 0,
    } });
    continue;
  }

  console.log(`\n▸ ${tema.label}  (${tema.n_items} elem., ${tema.n_canales} canales) · cuota ${cuota} · ${urg.porque}`);

  const estado = { dominios: new Set(), vacios: new Set(), descartes: {} };
  const entradas = [];
  const consultasHechas = [];
  let paisesPropuestos = [];
  let paro = null, ronda = 0, medida = null;

  while (ronda < RONDAS_MAX) {
    ronda++;
    if (!quedaBusqueda()) { paro = 'tope_semana'; break; }

    // Qué perseguir en esta ronda. En la primera no hay nada que perseguir.
    let pista = '';
    if (medida?.choques?.length) {
      pista = `Outlets disagree on a number: ${medida.choques[0]}. Find what was actually ` +
              `published, and by whom.`;
    } else if (paisesPropuestos.some(p => !medida?.paises?.includes(p))) {
      const falta = paisesPropuestos.filter(p => !medida.paises.includes(p));
      pista = `Nothing came back filed from ${falta.join(', ')}. Find what the press there reported.`;
    }

    // En la ronda 1 se reutilizan las consultas que ya propuso el barrido: son
    // las mismas y volver a pedirlas sería pagar dos veces por la misma idea.
    const prop = (ronda === 1 && leido.prop.consultas.length)
      ? leido.prop
      : await proponerConsultas(tema, material.slice(0, 12), pista, [...estado.dominios]);
    if (ronda === 1) paisesPropuestos = prop.paises;
    if (!prop.consultas.length) { paro = paro ?? 'sin_consultas'; break; }

    const relatosAntes = medida?.relatos ?? 0;
    let nuevosEstaRonda = 0;
    for (const c of prop.consultas) {
      // Se comprueba ANTES de cada consulta, no una vez por tema: un solo tema
      // con dos consultas puede agotar la corrida él solo. Y el cupo también va
      // aquí: en la primera prueba se pagaron dos búsquedas de una ronda cuyos
      // cinco resultados no cabían ya, y encima se archivó como «sin hallazgos».
      if (entradas.length >= POR_TEMA_MAX + 2) { paro = 'cupo'; break; }
      if (!quedaBusqueda()) { paro = 'tope_semana'; break; }
      let brutos = [];
      try { brutos = await buscar(c.q); }
      catch (e) { console.log(`    ✗ ${String(e).slice(0, 90)}`); continue; }
      // Se anota tras el éxito: una consulta que falló no es una búsqueda hecha,
      // y el parte la contaba como si el mundo hubiera contestado vacío.
      consultasHechas.push({ ronda, ...c });

      const pasan = filtrar(brutos, estado);
      console.log(`    r${ronda} «${c.q.slice(0, 62)}» → ${brutos.length} · pasan ${pasan.length}`);

      for (const h of pasan) {
        if (entradas.length >= POR_TEMA_MAX + 2) break;   // margen para poder elegir
        if (!quedaGemini()) break;
        let rep;
        try { rep = await gemini(promptReporte({ sitio: h.dom, titulo: h.titulo,
                                                 fecha: h.fecha.toISOString().slice(0, 10),
                                                 texto: h.texto }, tema)); }
        catch (e) { console.log(`      ✗ digest ${h.dom}: ${String(e).slice(0, 70)}`); continue; }

        if (rep.skip) { estado.descartes.no_es_reporte = (estado.descartes.no_es_reporte || 0) + 1;
                        console.log(`      – ${h.dom}: no es un reporte`); continue; }
        if (rep.bears_on_topic === false) {
          estado.descartes.otro_asunto = (estado.descartes.otro_asunto || 0) + 1;
          console.log(`      – ${h.dom}: es de otra cosa`); continue;
        }
        estado.dominios.add(h.dom);
        huellasVistas.add(h.huella);
        entradas.push({ ...h, reporte: rep });
        nuevosEstaRonda++;
        console.log(`      ✓ ${h.dom} · ${rep.country ?? '??'} · ${rep.lang}` +
                    (rep.wire && rep.wire !== 'none' ? ` · ${rep.wire}` : ''));
      }
    }
    if (paro) break;

    medida = medir(entradas);

    // ── Cuándo dejar de buscar ─────────────────────────────────────────────
    //
    // Esto es lo que ajusta el gasto solo, y la forma que tiene es deliberada:
    // se gasta MÁS donde la primera pasada volvió pobre y MENOS donde volvió
    // rica. Un tema del que ya volvieron cuatro reportes distintos no necesita
    // otra ronda; uno del que volvió uno, sí.
    //
    // La dispersión sola no bastaba. En la primera prueba dio 1 —seis historias
    // distintas— y habría mandado buscar tres rondas siempre, porque una
    // etiqueta abstracta como «U.S. strategy and hegemony» nunca produce seis
    // versiones de UN hecho. Sirve para el caso contrario, que sí existe: todos
    // llevando el mismo despacho.
    if (!entradas.length)  { paro = 'sin_hallazgos'; break; }
    if (!nuevosEstaRonda)  { paro = 'sin_hallazgos'; break; }
    // Nada de esta ronda contó algo que no estuviera ya contado.
    if (medida.relatos <= relatosAntes) { paro = 'convergen'; break; }
    // Todos cuentan el mismo relato y ninguna cifra choca.
    if (medida.dispersion < 0.4 && !medida.choques.length) { paro = 'convergen'; break; }
    // Ya hay de sobra. La excepción es un choque de cifras: eso sí merece otra
    // ronda, porque es lo que va a ser la pieza.
    if (entradas.length >= POR_TEMA_MAX && !medida.choques.length) { paro = 'cupo'; break; }
    if (ronda >= RONDAS_MAX) paro = 'tope_tema';
  }

  medida = medida ?? medir(entradas);
  // Se quedan los de más peso: los que chocan primero, luego los que no son de
  // agencia, luego los de fuera de EE. UU.
  const entran = entradas
    .sort((a, b) =>
      (b.reporte.figures?.length ?? 0) - (a.reporte.figures?.length ?? 0) ||
      ((a.reporte.wire && a.reporte.wire !== 'none') ? 1 : 0) - ((b.reporte.wire && b.reporte.wire !== 'none') ? 1 : 0) ||
      ((b.reporte.country && b.reporte.country !== 'US') ? 1 : 0) - ((a.reporte.country && a.reporte.country !== 'US') ? 1 : 0))
    .slice(0, Math.min(POR_TEMA_MAX, TOTAL_MAX - entranTotal));

  console.log(`  → ${entradas.length} reportes, entran ${entran.length}; ` +
              `dispersión ${medida.dispersion}, ${medida.choques.length} choques; paró por ${paro ?? '—'}`);
  if (medida.colapsados.length) {
    for (const c of medida.colapsados) {
      console.log(`     · ${c.medios.join(', ')} cuentan lo mismo` + (c.agencia ? ` (${c.agencia})` : ''));
    }
  }
  if (Object.keys(estado.descartes).length) {
    console.log(`     descartes: ${Object.entries(estado.descartes).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  }

  // Los hechos que el número va a citar —choques, despachos compartidos, bocas
  // repetidas, países— se miden sobre lo que ENTRA, no sobre todo lo hallado.
  // `medir(entradas)` sirve para decidir si seguir buscando; pero un choque
  // entre dos reportes que NO entraron habría puesto en el número una
  // discrepancia sin ningún `r` que la sostuviera, y «reports filed from TR,
  // MX» cuando los dos se recortaron. En una publicación cuya premisa es la
  // procedencia, esa es la categoría más cara de mentira.
  const medidaEntran = medir(entran);

  // ── Escribir ───────────────────────────────────────────────────────────
  let entraronTema = 0;
  if (!SECO) {
    for (const e of entran) {
      const fila = {
        source_id: null, origin: 'reportaje',
        external_id: e.url, url: e.url,
        title: String(e.titulo).slice(0, 400),
        author: e.dom,
        published_at: e.fecha.toISOString(),
        body_text: e.texto.slice(0, 200_000),
        lang: e.reporte.lang || null,
        state: 'digested', digest: e.reporte,
        digested_at: new Date().toISOString(),
      };
      let puesto;
      try {
        puesto = await sb('glossa_radar_items?on_conflict=external_id&select=id', {
          method: 'POST',
          headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
          body: JSON.stringify([fila]),
        });
      } catch (err) { console.log(`     ✗ no se pudo guardar ${e.dom}: ${String(err).slice(0, 90)}`); continue; }

      // Un upsert `ignore-duplicates` de una URL ya presente devuelve VACÍO, así
      // que sin esto el mismo documento hallado por dos temas perdería el enlace
      // del segundo. Se busca por `external_id` en vez de dar por hecho que se
      // insertó.
      let itemId = puesto?.[0]?.id;
      if (!itemId) {
        const hay = await sb(`glossa_radar_items?select=id&external_id=eq.${encodeURIComponent(e.url)}&limit=1`);
        itemId = hay?.[0]?.id;
      }
      if (!itemId) { console.log(`     ✗ sin id para ${e.dom}`); continue; }

      // El enlace al tema lo escribe el guion: el tema que motivó la búsqueda es
      // verdad de campo, no conjetura de un clasificador. Y como
      // `glossa_radar_sin_temas` excluye lo que ya tiene tema, esto además evita
      // que el radar gaste otra llamada en adivinarlo.
      await sb('glossa_radar_item_topics?on_conflict=item_id,topic_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify([{ item_id: itemId, topic_id: tema.topic_id, relevance: 'central' }]),
      }).catch(err => console.log(`     · enlace al tema no escrito para ${e.dom}: ${String(err).slice(0, 80)}`));
      entranTotal++; entraronTema++;
    }
  }

  // El parte NO se escribe aquí: se acumula y se escribe al final de la corrida,
  // porque `dominios_vacios` tiene que filtrarse contra lo aceptado en TODA la
  // corrida — un medio puede devolver un recorte en el tema A y un artículo
  // completo en el B, y el parte del A habría dicho que «no devolvió nada» un
  // medio que el número está citando dos párrafos más abajo.
  partes.push({
    tema: tema.label,
    fila: {
      topic_id: tema.topic_id, week_start: SEMANA, label: tema.label,
      queries: consultasHechas, paises: medidaEntran.paises, rondas: ronda,
      busquedas: consultasHechas.length,
      // Lo que vio el barrido gratis y lo que se decidió con ello. Va al parte
      // porque es la mitad del trabajo: un tema con cero búsquedas de pago puede
      // estar mejor corroborado que uno con seis, y sin esto no habría forma de
      // saberlo desde fuera.
      barrido: lect, urgencia: urg, cuota,
      hallados: entradas.length,
      // Lo que de verdad se escribió, no lo que se intentó: un fallo de guardado
      // dejaba el parte afirmando reportaje para un asunto con cero filas.
      entran: SECO ? entran.length : entraronTema,
      colapsados: { relatos: medidaEntran.colapsados, choques: medidaEntran.choques,
                    bocas_compartidas: medidaEntran.compartidas, descartes: estado.descartes,
                    // El proceso de búsqueda, aparte de los hechos citables:
                    // sirve para responder «¿no había nada, o lo comió el filtro?»
                    proceso: { dispersion: medida.dispersion, hallados_brutos: entradas.length } },
      vacios_tema: [...estado.vacios],
      dispersion: medida.dispersion, paro,
    },
    aceptados: [...estado.dominios],
    entradas: entradas.length, entran: entran.length, paro,
  });
}

// ── Los partes, con los vacíos filtrados contra toda la corrida ───────────
if (!SECO) {
  const aceptadosRun = new Set(partes.flatMap(x => x.aceptados));
  for (const x of partes) {
    const { vacios_tema, ...fila } = x.fila;
    fila.dominios_vacios = vacios_tema.filter(d => !aceptadosRun.has(d));
    await sb('glossa_radar_reportajes?on_conflict=topic_id,week_start', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([fila]),
    }).catch(e => console.log(`  ✗ parte «${x.tema}»: ${String(e).slice(0, 120)}`));
  }
}

console.log(`\n${busquedas} de ${TOPE_SEMANA} búsquedas · ${entranTotal} reportajes entran`);
if (busquedas < TOPE_SEMANA) {
  console.log(`Sobraron ${TOPE_SEMANA - busquedas}: no había más que divergiera.`);
}
if (SECO) console.log('REPORTAJE_DRY — no se escribió nada.');
