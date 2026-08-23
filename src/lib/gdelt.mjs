// ── GDELT: el censo mundial, gratis y con el texto dentro ────────────────
//
// GDELT indexa la prensa del mundo en 65 idiomas y su API DOC 2.0 es abierta:
// sin clave, sin cuenta y sin cupo. Una sola consulta devolvió el 2026-08-23
// **250 artículos de 213 medios distintos, de unos treinta países y diez
// idiomas** — y, a diferencia de Google News, con la URL real, de modo que el
// texto se lee gratis con el mismo `textoDePagina()` de siempre.
//
// Por qué esto importa aquí y no es «otro buscador más»: el encargo es que las
// fuentes den los TEMAS y que el sistema salga a buscar fuera, en cualquier
// idioma y país, antes de escribir. Con Tavily eso costaba dos créditos por
// consulta y había que racionarlo. Con esto la anchura deja de tener precio, y
// lo de pago se reserva para lo que esto no alcanza: el medio que bloquea al
// robot y el documento que hay que leer entero.
//
// El único límite es de cortesía y es duro: **una petición cada 5 segundos.**
// Se respeta en el propio módulo, no en quien llama — un tope que hay que
// recordar cumplir no es un tope. Un 429 devuelve texto plano, no JSON, y por
// eso todo se envuelve.
//
// Lo que GDELT NO es: una fuente citable por sí misma. Lo que da es dónde
// mirar. Lo que se cite sale del texto del medio, leído y digerido como
// cualquier otro.

// El ritmo. GDELT pide una petición cada cinco segundos y lo hace cumplir con un
// 429 que además persiste un rato largo después de una ráfaga: no basta con
// volver al ritmo, hay que dejar que se enfríe. Por eso el turno se ensancha
// solo cuando llega un estrangulamiento y se va estrechando cuando deja de
// llegar. Un ritmo fijo que hay que acordarse de respetar no es un ritmo.
const ESPERA_BASE = 6000;
const ESPERA_TOPE = 90_000;
let espera = ESPERA_BASE;
let ultima = 0;

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

async function turno() {
  const falta = espera - (Date.now() - ultima);
  if (falta > 0) await dormir(falta);
  ultima = Date.now();
}

function frena()  { espera = Math.min(ESPERA_TOPE, Math.max(30_000, espera * 2)); }
function afloja() { espera = Math.max(ESPERA_BASE, espera * 0.7); }

// Cortacircuitos. GDELT no solo estrangula: tras una ráfaga deja de aceptar la
// conexión durante un buen rato. Sin esto, un GDELT caído cuesta veinticinco
// segundos POR TEMA y la corrida entera se va en esperar a algo que ya se sabe
// que no va a contestar. A los tres seguidos se apaga y todo cae a la reserva,
// que es lo que la reserva es.
const CAIDAS_MAX = 3;
let caidasSeguidas = 0;
export const gdeltVivo = () => caidasSeguidas < CAIDAS_MAX;

// YYYYMMDDHHMMSS, catorce dígitos y sin la «T». Quitar solo guiones y dos
// puntos dejaba «20260816T00000000», que GDELT rechaza con un mensaje en texto
// plano — y ese rechazo, contado como caída, apagaba el servicio entero.
const marca = (d) => new Date(d).toISOString().replace(/[-:T]/g, '').slice(0, 14);

/**
 * Una consulta al índice.
 *
 * Devuelve `{ ok, articulos }` o `{ ok:false, motivo }` — nunca un `null` mudo.
 * «No pude preguntar» y «pregunté y no hay nada» piden cosas opuestas, y si
 * además no se dice POR QUÉ no se pudo, un límite de cortesía que se está
 * incumpliendo es indistinguible de un mundo en el que nadie escribió del asunto.
 * Este proyecto ya se ha tropezado dos veces con la misma piedra: algo dejó de
 * funcionar y nada lo dijo.
 */
export async function consultar(q, opciones = {}) {
  const { desde, hasta, max = 250, fetchImpl = fetch, timeoutMs = 25_000, reintentos = 1 } = opciones;
  const texto = String(q || '').trim();
  // GDELT rechaza las consultas muy cortas con un mensaje en texto plano.
  if (texto.length < 5) return { ok: false, motivo: 'consulta_corta' };
  if (!gdeltVivo()) return { ok: false, motivo: 'apagado tras 3 fallos seguidos' };

  const p = new URLSearchParams({
    query: texto, mode: 'artlist', format: 'json',
    maxrecords: String(Math.min(250, max)), sort: 'datedesc',
  });
  if (desde) p.set('startdatetime', marca(desde));
  if (hasta) p.set('enddatetime', marca(hasta));
  if (!desde && !hasta) p.set('timespan', '7d');

  await turno();
  let cuerpo, estado;
  try {
    const r = await fetchImpl(`https://api.gdeltproject.org/api/v2/doc/doc?${p}`, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    estado = r.status;
    cuerpo = await r.text();
  } catch (e) {
    caidasSeguidas++;
    // `ConnectTimeoutError` es lo que devuelve undici cuando GDELT deja de
    // aceptar la conexión, y no lleva la palabra «timeout» en el nombre de la
    // clase: buscarla solo a ella clasificaba un bloqueo como un fallo de red
    // cualquiera.
    const txt = String(e?.name || '') + ' ' + String(e?.message || e);
    return { ok: false, motivo: /timeout/i.test(txt) ? 'sin_conexion (timeout)' : `red: ${txt.slice(0, 50)}` };
  }

  if (estado === 429 || /limit requests/i.test(cuerpo)) {
    frena(); caidasSeguidas++;
    if (reintentos > 0) { await dormir(espera); return consultar(q, { ...opciones, reintentos: reintentos - 1 }); }
    return { ok: false, motivo: `estrangulado (espera ${Math.round(espera / 1000)} s)` };
  }
  if (estado !== 200) { caidasSeguidas++; return { ok: false, motivo: `http_${estado}` }; }

  let d;
  try { d = JSON.parse(cuerpo); }
  catch {
    // GDELT contesta 200 con texto plano cuando la consulta está mal formada.
    // Eso NO es una caída: el servidor entendió y dijo que no. Contarlo como
    // caída fue lo que apagó el censo entero por un error de formato de fecha
    // mío — el servicio estaba perfectamente y la culpa era de quien preguntaba.
    // Se devuelve el texto para que se lea en el registro, y no se toca el
    // cortacircuitos.
    return { ok: false, motivo: `rechazada: ${cuerpo.slice(0, 70).replace(/\s+/g, ' ')}` };
  }

  afloja(); caidasSeguidas = 0;
  return {
    ok: true,
    articulos: (d.articles ?? []).map(a => ({
      url: a.url,
      titular: String(a.title ?? '').trim(),
      medio: a.domain ?? '',
      pais: a.sourcecountry ?? '',
      lang: a.language ?? '',
      fecha: a.seendate ?? null,
    })).filter(a => a.url && a.titular),
  };
}

/**
 * El censo de un tema: varias consultas, sin repetir medio ni titular.
 *
 * Devuelve `consultadas` y `motivos`, que es lo que permite decir «pregunté y no
 * hay» en vez de «no lo sé». Un tema cuyo censo falló entero no puede tratarse
 * como un tema del que nadie escribió.
 */
export async function censo(consultas, opciones = {}) {
  const vistos = new Set();
  const articulos = [];
  const consultadas = [];
  const motivos = [];

  for (const q of [...new Set(consultas.filter(Boolean))].slice(0, opciones.maxConsultas ?? 3)) {
    const r = await consultar(q, opciones);
    if (!r.ok) { motivos.push(`${q}: ${r.motivo}`); continue; }
    consultadas.push(q);
    for (const a of r.articulos) {
      const huella = `${a.medio.toLowerCase()}|${a.titular.toLowerCase().slice(0, 90)}`;
      if (vistos.has(huella)) continue;
      vistos.add(huella);
      articulos.push(a);
    }
  }
  return { articulos, consultadas, motivos, fallos: motivos.length };
}
