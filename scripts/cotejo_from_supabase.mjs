// cotejo_from_supabase.mjs — salir a comprobar lo que se afirma.
//
// Es la razón de ser del proyecto. Hasta ahora el número decía honestamente que
// varias voces coinciden y que eso no es corroboración; pero no salía a
// comprobarlo. Un dato que circula por cinco canales sin respaldo se quedaba en
// «nadie lo respaldó AQUÍ DENTRO». La afirmación fuerte es otra: «lo buscamos
// fuera y no existe».
//
// Corre el sábado, un día antes del número: necesita búsquedas, un modelo y
// minutos, y así el número siempre lee un cotejo TERMINADO en vez de competir
// con uno a medias. No se mete dentro del guion semanal a propósito — ese ya
// tarda 16 minutos y es lo que no puede volverse frágil.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, TAVILY_API_KEY, GEMINI_API_KEY.

import { createHash } from 'node:crypto';
import { ajustes, uso as gastoActual, apuntar, cabe } from '../src/lib/presupuesto.js';
import { promptCotejo } from './prompts_cotejo.mjs';

const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const TAVILY = process.env.TAVILY_API_KEY || '';
const GEMINI = process.env.GEMINI_API_KEY || '';
const MODELO = 'gemini-3.1-flash-lite';
for (const [n, v] of [['SUPABASE_URL', URL_SB], ['SUPABASE_SERVICE_KEY', KEY],
                      ['TAVILY_API_KEY', TAVILY], ['GEMINI_API_KEY', GEMINI]])
  if (!v) { console.error(`Falta ${n}`); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const huella = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 24);

async function sb(path, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 240)}`);
  return t ? JSON.parse(t) : null;
}

const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
// La huella normaliza la URL: mismo documento con distintos parámetros de
// campaña no debe contarse dos veces.
const huellaUrl = (u) => {
  try { const x = new URL(u); return huella(x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')); }
  catch { return huella(u); }
};

// ── Qué se comprueba ───────────────────────────────────────────────────────
//
// Hay ~960 afirmaciones por semana y presupuesto para 20 búsquedas. Elegir con
// un modelo costaría más que comprobar, así que la selección es mecánica.
const PALABRAS_VACIAS = new Set(['the','and','that','with','from','this','have','has','for','are',
  'was','were','not','but','his','her','its','their','which','while','they','than','into','over']);
const fichas = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter(w => w.length > 3 && !PALABRAS_VACIAS.has(w)));
const jaccard = (a, b) => {
  const inter = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
};
// Un año, una cifra, un porcentaje, una cantidad: sin un ancla concreta no hay
// búsqueda posible, solo una frase de opinión.
const TIENE_ANCLA = /\b(19|20)\d{2}\b|\d[\d.,]*\s*(%|percent|billion|million|trillion|kg|barrels?|\$)|\$\s?\d/i;

/**
 * La huella temática de una afirmación: su cifra y sus dos sustantivos más
 * largos.
 *
 * Agrupar por parecido de palabras no bastó. En la primera corrida, OCHO de las
 * veinte comprobaciones fueron la misma afirmación —la deuda de 40 billones—
 * dicha por ocho personas con palabras distintas: «has reached», «is heading
 * to», «currently facing», «has exceeded». El parecido entre esas frases queda
 * por debajo de cualquier umbral razonable, pero la cifra es idéntica y es lo
 * único que se va a comprobar.
 */
function ancla(texto) {
  const t = String(texto).toLowerCase();
  const num = (t.match(/\d[\d.,]*\s*(%|percent|billion|million|trillion|kg|barrels?)?/) || [''])[0]
    .replace(/[.,]/g, '').replace(/\s+/g, '');
  const palabras = [...fichas(t)].sort((a, b) => b.length - a.length).slice(0, 2).sort();
  return `${num}|${palabras.join(',')}`;
}

// Dominios que no sostienen nada. Un contador de deuda con widget, una red
// social o un agregador pueden repetir una cifra, pero llamar a eso «contradice»
// —como pasó cinco veces en la primera corrida con us-debt-clock.com— convierte
// el veredicto más valioso en ruido.
const CHATARRA = ['facebook.com','instagram.com','twitter.com','x.com','tiktok.com','reddit.com',
  'us-debt-clock.com','usdebtclock.org','pinterest.com','quora.com','medium.com','substack.com'];
const esChatarra = (dom) => CHATARRA.some(d => dom === d || dom.endsWith('.' + d));

function seleccionar(items, centrales, yaCotejadas, tope) {
  const cands = [];
  for (const it of items) {
    const claims = it.digest?.claims ?? [];
    claims.forEach((c, idx) => {
      const texto = c.claim ?? '';
      if (!c.checkable || String(c.checkable).length < 15) return;   // el analista no supo cómo comprobarlo
      if (!texto || texto.length < 25) return;
      const hash = huella(texto);
      if (yaCotejadas.has(hash)) return;                              // comprobada hace poco: gratis saltársela

      let peso = 0;
      // `atribuido` pesa lo mismo que la repetición y no es obvio: ahí es
      // exactamente donde vive la mala atribución — alguien contando lo que dijo
      // un tercero que no está para desmentirlo.
      peso += c.status === 'atribuido' ? 3 : c.status === 'documentado' ? 2 : 1;
      if (TIENE_ANCLA.test(texto)) peso += 2;
      if (centrales.has(it.id)) peso += 2;
      cands.push({ item: it, idx, texto, hash, checkable: c.checkable, status: c.status, peso,
                   fichas: fichas(texto) });
    });
  }

  // La señal más valiosa: la misma afirmación en más de una voz. Es justo la que
  // el número estará tentado de presentar como corroborada, y la que —según la
  // regla editorial— nunca debe presentarse así sin comprobarla fuera.
  //
  // Se agrupa por ancla y por parecido de palabras. Lo primero caza la cifra
  // repetida con otras palabras; lo segundo, la misma frase sin cifra.
  const grupos = new Map();
  for (const a of cands) {
    a.ancla = ancla(a.texto);
    let clave = a.ancla;
    for (const [k, g] of grupos) {
      if (k === a.ancla) { clave = k; break; }
      if (jaccard(a.fichas, g[0].fichas) >= 0.5) { clave = k; break; }
    }
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(a);
  }

  // Un grupo, una comprobación. La representante es la de más peso, y hereda el
  // bono por venir de varias voces: comprobarla contesta por todo el grupo.
  const representantes = [];
  for (const g of grupos.values()) {
    const voces = new Set(g.map(x => x.item.id));
    const mejor = g.sort((x, y) => y.peso - x.peso)[0];
    if (voces.size > 1) mejor.peso += 3;
    mejor.voces = voces;
    mejor.hermanas = g.length - 1;
    representantes.push(mejor);
  }

  const orden = representantes.sort((x, y) => y.peso - x.peso);

  // Tope por episodio para que una semana ruidosa no se coma el presupuesto en
  // un solo asunto.
  const porItem = new Map();
  const elegidas = [];
  for (const c of orden) {
    if (elegidas.length >= tope) break;
    const n = porItem.get(c.item.id) ?? 0;
    if (n >= 2) continue;
    porItem.set(c.item.id, n + 1);
    elegidas.push(c);
  }
  return elegidas;
}

// ── Compuertas mecánicas ───────────────────────────────────────────────────
//
// Corren ANTES del modelo y solo pueden rebajar el veredicto, nunca subirlo.
// Esa asimetría es lo que hace seguro todo el sistema: un modelo equivocado
// hacia lo permisivo pone un subrayado dorado falso en una página pública; hacia
// lo restrictivo deja una afirmación marcada más débil de lo que merece, que es
// el fallo que esta publicación sí puede permitirse.
function compuertas(hallazgo, item, dominiosFuente, primarios) {
  const dom = dominio(hallazgo.url);

  // Un dominio que no sostiene nada no puede contradecir nada. Antes esta
  // comprobación solo cubría `documenta`, y el resultado fue que un contador de
  // deuda con widget «contradijo» cinco afirmaciones. El veredicto más valioso
  // que tiene este sistema no puede salir de ahí.
  if (esChatarra(dom))
    return { verdict: 'no_concluyente', gate: 'dominio_sin_autoridad' };

  // La nota que el propio canal escribió sobre su propio episodio. Es el falso
  // positivo más común y sale gratis cazarlo.
  if (dom && (dom === dominio(item.url) || dominiosFuente.has(dom)))
    return { verdict: 'repite', independence: 'misma_orbita', gate: 'mismo_dominio' };

  // Un documento publicado DESPUÉS del episodio no puede ser aquello a lo que el
  // hablante se refería; es cobertura del episodio.
  if (hallazgo.published_date && item.published_at &&
      new Date(hallazgo.published_date) > new Date(item.published_at))
    return { gate: 'posterior_al_episodio' };

  if (!primarios.some(p => dom === p.replace(/^\./, '') || dom.endsWith(p)))
    return { gate: 'dominio_no_primario' };

  return {};
}



// ── Buscar y juzgar ────────────────────────────────────────────────────────

async function buscarDocumento(claim) {
  // La consulta sale de `checkable`, que es lo que el analista dijo que habría
  // que consultar, más el ancla concreta de la afirmación. Buscar la frase
  // entera devuelve páginas que la citan, no el documento que la respalda.
  const ancla = (claim.texto.match(TIENE_ANCLA) || [])[0] ?? '';
  const q = `${claim.checkable} ${ancla}`.trim().slice(0, 380);
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TAVILY}` },
    body: JSON.stringify({ query: q, max_results: 4, search_depth: 'advanced',
                           include_raw_content: false }),
  });
  // Dos créditos, no uno: `advanced` cuesta el doble que `basic`. Apuntar 1 hacía
  // que el tope midiera la mitad de lo que se gastaba, así que se agotaba la
  // cuota real mucho antes de que `cabe()` dijera nada.
  await apuntar(URL_SB, KEY, 'tavily', 2);
  if (!r.ok) throw new Error(`tavily ${r.status}`);
  return { query: q, resultados: (await r.json()).results ?? [] };
}

async function juzgar(claim, item, hallazgo, intento = 0) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`,
    { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptCotejo(claim, item, hallazgo) }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
      }) });
  if (!r.ok) {
    const txt = await r.text();
    // El tramo gratuito devuelve 503 «high demand» a menudo, y no es culpa de la
    // afirmación. Perder una comprobación por eso sería tirar una búsqueda ya
    // pagada a Tavily.
    if ((r.status === 503 || r.status === 429) && intento < 2) {
      await new Promise(x => setTimeout(x, 4000 * (intento + 1)));
      return juzgar(claim, item, hallazgo, intento + 1);
    }
    throw new Error(`gemini ${r.status}: ${txt.slice(0, 160)}`);
  }
  const d = await r.json();
  const tok = d.usageMetadata?.totalTokenCount ?? 0;
  await apuntar(URL_SB, KEY, 'gemini', 1, tok);
  const txt = (d.candidates?.[0]?.content?.parts ?? []).map(x => x.text || '').join('');
  return { ...JSON.parse(txt.replace(/^\s*```(?:json)?/, '').replace(/```\s*$/, '')), tokens: tok };
}

// ── Corrida ────────────────────────────────────────────────────────────────
const ahora = new Date();
const finDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() + 1));
const desde = new Date(finDia); desde.setUTCDate(desde.getUTCDate() - 8);

const ajus = await ajustes(URL_SB, KEY);
const gasto = await gastoActual(URL_SB, KEY);
const TOPE = Number(ajus.cotejo_busquedas_semana ?? 20);
const primarios = Array.isArray(ajus.cotejo_dominios_primarios) ? ajus.cotejo_dominios_primarios : [];

// `origin=eq.feed` a propósito: lo que se coteja son los EPISODIOS. Sin ese
// filtro entraban también los hallazgos de búsqueda, y se pagaba a Tavily por
// comprobar un artículo contra otros artículos —que no es cotejar, es dar una
// vuelta—. También es lo que mantiene fuera los reportajes sin tener que
// nombrarlos aquí.
const items = await sb(
  `glossa_radar_items?select=id,title,url,author,published_at,digest,source_id` +
  `&state=eq.digested&origin=eq.feed` +
  `&published_at=gte.${desde.toISOString()}&published_at=lt.${finDia.toISOString()}&limit=500`);
if (!items.length) { console.log('Sin material analizado esta semana.'); process.exit(0); }

const [enlaces, fuentes, recientes] = await Promise.all([
  sb('glossa_radar_item_topics?select=item_id,relevance&relevance=eq.central&limit=5000'),
  sb('glossa_radar_sources?select=feed_url,name'),
  sb(`glossa_radar_cotejos?select=claim_hash&created_at=gte.${new Date(Date.now() - 30 * 864e5).toISOString()}`),
]);
const centrales = new Set((enlaces ?? []).map(e => e.item_id));
const dominiosFuente = new Set((fuentes ?? []).map(f => dominio(f.feed_url ?? '')).filter(Boolean));
const yaCotejadas = new Set((recientes ?? []).map(c => c.claim_hash));

const elegidas = seleccionar(items, centrales, yaCotejadas, TOPE);
console.log(`${items.length} episodios · ${elegidas.length} afirmaciones a comprobar (tope ${TOPE})`);

const cuenta = { documenta: 0, repite: 0, contradice: 0, no_concluyente: 0, sin_hallazgo: 0 };

for (const c of elegidas) {
  if (!cabe(gasto, ajus, 'tavily', 'cap_tavily_mes', 'mes')) {
    console.log('  tope mensual de Tavily alcanzado — se para aquí'); break;
  }
  try {
    const { query, resultados } = await buscarDocumento(c);

    // Nada encontrado es un RESULTADO, no un fallo. Es lo único que permite al
    // número escribir «no se pudo rastrear a ningún documento» en vez de
    // deducirlo de una ausencia.
    if (!resultados.length) {
      await sb('glossa_radar_cotejos?on_conflict=item_id,claim_idx,fingerprint', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify([{ item_id: c.item.id, claim_idx: c.idx, claim_hash: c.hash,
          claim_text: c.texto, query, fingerprint: huella('sin:' + c.hash),
          verdict: 'sin_hallazgo', verdict_reason: 'the search returned nothing' }]),
      });
      cuenta.sin_hallazgo++;
      console.log(`  · sin hallazgo — ${c.texto.slice(0, 56)}`);
      continue;
    }

    const h = resultados[0];
    const hallazgo = { url: h.url, title: h.title, source_domain: dominio(h.url),
                       published_date: h.published_date ?? null, snippet: h.content };

    const g = compuertas(hallazgo, c.item, dominiosFuente, primarios);
    let veredicto = g.verdict, razon = null, indep = g.independence ?? null, tokens = null;

    if (!veredicto) {
      const j = await juzgar(c, c.item, hallazgo);
      veredicto = j.verdict; razon = j.reason; indep = j.independence ?? indep; tokens = j.tokens;

      // LA ASIMETRÍA. El código puede vetar al modelo; el modelo nunca al código.
      // Si dice «documenta» pero el dominio no es una fuente primaria, o no supo
      // nombrar el registro, se guarda «repite».
      if (veredicto === 'documenta' && (g.gate === 'dominio_no_primario' || !j.documento)) {
        veredicto = 'repite';
        razon = `${razon ?? ''} [rebajado: ${!j.documento ? 'no nombró el documento' : 'dominio no primario'}]`.trim();
      }
    } else {
      razon = `mechanical gate: ${g.gate}`;
    }

    await sb('glossa_radar_cotejos?on_conflict=item_id,claim_idx,fingerprint', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([{
        item_id: c.item.id, claim_idx: c.idx, claim_hash: c.hash, claim_text: c.texto,
        query, url: hallazgo.url, title: hallazgo.title, source_domain: hallazgo.source_domain,
        published_date: hallazgo.published_date, snippet: String(hallazgo.snippet ?? '').slice(0, 2000),
        fingerprint: huellaUrl(hallazgo.url), verdict: veredicto, verdict_reason: razon,
        independence: indep, gate: g.gate ?? null, model: tokens ? MODELO : null, tokens_used: tokens,
      }]),
    });
    cuenta[veredicto] = (cuenta[veredicto] ?? 0) + 1;
    console.log(`  · ${veredicto.padEnd(15)} ${hallazgo.source_domain.padEnd(22)} ${c.texto.slice(0, 44)}`);
  } catch (e) {
    console.error(`  · fallo: ${String(e).slice(0, 120)}`);
  }
}

console.log(`\n${Object.entries(cuenta).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(' · ') || 'nada comprobado'}`);
