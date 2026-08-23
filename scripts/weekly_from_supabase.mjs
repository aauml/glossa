// weekly_from_supabase.mjs — arma el número semanal de Glossa.
//
// Por qué vive aquí y no en una edge function: escribir el número tarda. Se
// midieron seis modelos sobre el mismo material y sólo uno terminó dentro de los
// 150 s de una edge function —el más flojo—. Kimi K3, que es el que se eligió,
// tardó 952 s. Un GitHub Action no tiene ese techo, así que el reloj se muda
// aquí y `glossa-weekly-run` queda para disparos manuales desde el panel.
//
// Cadena: cron del Action (domingos 11:00 UTC = 04:00 en California)
//         -> lee glossa_radar_items digeridos de los últimos 7 días
//         -> calcula concentración de canales e invitados que se repiten
//         -> Kimi K3 escribe el número
//         -> UPSERT en glossa_radar_weekly como 'borrador'.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, MOONSHOT_API_KEY.

import https from 'node:https';
import { ajustes, uso as gastoActual, apuntar, cabeCoste } from '../src/lib/presupuesto.js';
import { revisar } from '../src/lib/fusible.js';

const URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const MOONSHOT = process.env.MOONSHOT_API_KEY || '';
const MODELO = process.env.WEEKLY_MODEL || 'kimi-k3';

if (!URL || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!MOONSHOT)     { console.error('Falta MOONSHOT_API_KEY'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const iso = d => d.toISOString().slice(0, 10);

async function sb(path, init = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const txt = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

// ── La semana ────────────────────────────────────────────────────────────
// La ventana se ancla al DOMINGO, no a «los últimos siete días desde hoy». Con
// lo segundo, un corte a mano el martes cubría 18→24 y escribía una fila
// `2026-08-18` en vez de actualizar la de la semana: cada corte intermedio
// creaba una revista suelta con fechas que no son las de ninguna semana. Así
// aparecieron las filas huérfanas que había guardadas.
//
//   domingo    → la semana que ACABA de cerrarse (domingo→sábado). Es el corte
//                oficial, el que corre solo de madrugada.
//   otro día   → de este domingo hasta ahora. Es un corte parcial, para ver cómo
//                va, y pisa siempre la MISMA fila; el domingo lo cierra.
// La ventana NO se calcula aquí: la da `glossa_semana_actual()`, en hora de Los
// Ángeles. Cada consumidor calculándola por su cuenta era cuatro definiciones
// que podían discrepar en silencio —y anclada a UTC, además, el número decía
// cubrir el sábado y en realidad cerraba el viernes a las cinco de la tarde—.
//
// `WEEK_END` significa «finge que hoy es X»: se pasa como referencia. Solo un
// domingo produce un corte OFICIAL.
const ahora = process.env.WEEK_END ? new Date(process.env.WEEK_END) : new Date();
if (Number.isNaN(ahora.getTime())) {
  console.error(`WEEK_END no es una fecha: «${process.env.WEEK_END}». Formato: YYYY-MM-DD, y un domingo para un corte oficial.`);
  process.exit(1);
}
const [ventana] = await sb('rpc/glossa_semana_actual', {
  method: 'POST', body: JSON.stringify({ ref: ahora.toISOString() }),
});
if (!ventana) { console.error('No se pudo leer la ventana de la semana.'); process.exit(1); }
const desde   = new Date(ventana.desde);
const finDia  = new Date(ventana.hasta);
const PARCIAL = !!ventana.parcial;
const weekEnd = new Date(finDia.getTime() - 864e5);

console.log(`Semana ${iso(desde)} → ${iso(weekEnd)} (hora de Los Ángeles)` +
            `${PARCIAL ? ' · corte parcial, la semana sigue abierta' : ''}`);

// ── Lo que se puede decidir SIN el texto, se decide antes de pagarlo ─────
// Kimi tarda ~16 minutos y cuesta dinero. Que la semana ya esté publicada, o
// que un parcial no pueda pisar a un oficial, no dependen de lo que el modelo
// escriba: se sabían desde el principio y se comprobaban al final, después de
// haber pagado la llamada entera para tirarla. Un «Cut now» sobre una semana ya
// publicada gastaba dieciséis minutos para decir «no se toca».
{
  const [ya] = await sb(`glossa_radar_weekly?select=state,parcial&week_start=eq.${iso(desde)}`);
  if (ya && ya.state === 'publicado') {
    console.log(`Ya hay un número PUBLICADO para la semana del ${iso(desde)}; no se toca. ` +
                `Para rehacerlo, retíralo primero desde el panel.`);
    process.exit(0);
  }
  if (ya && PARCIAL && !ya.parcial) {
    console.log('Ya existe el número OFICIAL de esta semana; un corte parcial no lo toca.');
    process.exit(0);
  }
}


// Kimi es lo único que cuesta dinero aquí, así que es lo único con tope en
// dólares. Alcanzarlo no es un error: se sale sin escribir y se dice por qué.
const ajus = await ajustes(URL, KEY);
const gasto = await gastoActual(URL, KEY);
if (!cabeCoste(gasto, ajus, 'moonshot', 'cap_moonshot_mes_usd')) {
  console.log(`Tope mensual alcanzado: $${gasto.moonshot?.coste_mes} de ` +
              `$${ajus.cap_moonshot_mes_usd}. No se escribe el número.`);
  process.exit(0);
}

// Con orden y con la trampa dicha: sin `order`, al pasar de 500 PostgREST
// devolvía 500 filas ARBITRARIAS — el mismo truncado silencioso que la 0029
// eliminó para los temas, reintroducido en la consulta principal.
const items = await sb(
  `glossa_radar_items?select=id,title,author,url,published_at,digest,origin,lang,glossa_radar_sources(name)` +
  `&state=eq.digested&published_at=gte.${desde.toISOString()}&published_at=lt.${finDia.toISOString()}` +
  `&order=published_at.desc&limit=500`);
if (items?.length === 500) {
  console.log('  AVISO: la semana superó las 500 filas; entra lo más nuevo y se recorta lo más viejo.');
}

if (!items.length) { console.log('Sin material digerido esta semana — no se escribe nada.'); process.exit(0); }

// ── Dos fondos, y se separan aquí ────────────────────────────────────────
// Un reportaje entra en `items` como cualquier otra cosa, y ahí está el peligro:
// `ficha()` lo pintaría idéntico a un episodio y la distinción se perdería en el
// punto de entrada, donde ningún prompt posterior la recupera.
//
// El coro es lo que dijeron los canales seguidos. El reportaje es lo que se
// salió a buscar fuera, y NO es una quinta voz en la sala: es contra lo que se
// mide la sala.
const episodios = items.filter(x => x.origin !== 'reportaje');
const reportes  = items.filter(x => x.origin === 'reportaje');
console.log(`${episodios.length} episodios` + (reportes.length ? ` · ${reportes.length} reportajes` : ''));

const canal = x => x.glossa_radar_sources?.name || '—';

// ── Lo que el modelo NO debe deducir ─────────────────────────────────────
// Se le da calculado. Cuando se le dejó inferirlo, acertó dos nombres de tres:
// el tercero era el copresentador del canal, no un invitado que rotara. Contar
// es trabajo de código; interpretar es trabajo del modelo.
// Los tres recuentos de procedencia van sobre EL CORO: solo `origin='feed'`.
// `episodios` incluye también lo pegado y los hallazgos de monitores, y contarlos
// aquí metía una fila fantasma — «Mexico politics» salía como canal con un
// episodio, y un pegado aparecía en la lista de invitados cruzados como un canal
// llamado «—».
const coro = episodios.filter(x => x.origin === 'feed');
const porCanal = {};
for (const x of coro) porCanal[canal(x)] = (porCanal[canal(x)] || 0) + 1;
const concentracion = Object.entries(porCanal).sort((a, b) => b[1] - a[1])
  .filter(([, n]) => n > 1).map(([c, n]) => `${n} of the ${coro.length} episodes came through ${c}`);

const donde = {};
for (const x of coro) {
  const nombres = (x.digest?.speakers?.length ? x.digest.speakers : [x.author]).filter(Boolean);
  for (const raw of nombres) {
    const nom = String(raw).split(/[(,]/)[0].trim();
    if (nom.split(/\s+/).length < 2) continue;
    (donde[nom] ||= new Set()).add(canal(x));
  }
}
const cruzan = Object.entries(donde).filter(([, s]) => s.size > 1)
  .map(([n, s]) => `${n} appears on ${[...s].sort().join(' and ')}`);

// Un mismo canal descargando todo el mismo día es una señal distinta a
// publicar repartido: indica una tanda editorial, no una semana de noticias.
const porDia = {};
for (const x of coro) {
  const k = `${canal(x)}|${String(x.published_at).slice(0, 10)}`;
  porDia[k] = (porDia[k] || 0) + 1;
}
const tandas = Object.entries(porDia).filter(([, n]) => n >= 5)
  .map(([k, n]) => { const [c, d] = k.split('|'); return `${c} filed ${n} episodes on ${d} alone`; });

// ── Cuánto material cabe ─────────────────────────────────────────────────
// Una semana estable son ~294 episodios: unos 112.000 tokens si se manda todo.
// No es el precio lo que estorba —serían siete céntimos— sino que volcar
// trescientos episodios en una llamada produce peor escritura, no mejor.
//
// Así que se prioriza en vez de truncar por la cola. Un episodio vale por los
// temas donde es CENTRAL: eso es lo que la etapa de clasificación ya decidió
// leyendo el contenido, y es mejor señal que la fecha.
// Bajado de 90.000 a 55.000 tras un fallo en producción. El material creció a 166
// episodios y 71.260 tokens, y K3 pasó de los treinta minutos de tiempo máximo
// que tenía puesto. El presupuesto es el control que manda aquí: a más material,
// más tarda, y el material va a seguir creciendo —al ritmo actual, 294 episodios
// por semana—.
//
// No se pierde nada por bajarlo: el número son cinco piezas de quinientas
// palabras pase lo que pase, y lo que se recorta es lo MENOS conectado con los
// temas vivos, que es lo que menos iba a aparecer.
const TOPE_TOKENS = Number(process.env.WEEKLY_TOKEN_BUDGET || 55_000);

// El peso lo cuenta SQL sobre la ventana. Antes se pedía la tabla de enlaces
// ENTERA con `limit=5000` y sin filtro de fecha: mientras cupo funcionó por
// accidente, y al pasarse habría empezado a ordenar el material con un mapa
// truncado —un número mal armado sin un solo error en el registro—.
const filas = await sb('rpc/glossa_radar_pesos', {
  method: 'POST',
  body: JSON.stringify({ desde: desde.toISOString(), hasta: finDia.toISOString() }),
});
const peso = Object.fromEntries((filas ?? []).map(f => [f.item_id, Number(f.peso)]));

// ── En qué se agrupó la semana ───────────────────────────────────────────
// Esto llevaba sin llegar al modelo. El prompt le pedía «merge the raw topics
// into 4-5 pieces» y no le pasaba ni un tema: agrupaba deduciendo del texto lo
// que la clasificación ya había decidido leyendo el contenido.
//
// Se le dan como recuentos, no como índice. Un tema aquí no tiene derecho a una
// sección; es material para decidir, igual que la concentración de canales.
const temas = await sb('rpc/glossa_radar_temas_semana', {
  method: 'POST',
  body: JSON.stringify({ desde: desde.toISOString(), hasta: finDia.toISOString() }),
}).catch(() => []);

const TOPE_TEMAS = 12;
const racimos = (temas ?? []).slice(0, TOPE_TEMAS).map(t => {
  const canales = Number(t.n_canales) > 0
    ? `${t.n_items} items across ${t.n_canales} channel${t.n_canales > 1 ? 's' : ''}`
    : `${t.n_items} items, no followed channel covered it`;
  const fuera = Number(t.n_medios) > 0
    ? `, ${t.n_medios} outside outlet${t.n_medios > 1 ? 's' : ''}`
    : '';
  return `${t.label} — ${canales}${fuera}`;
});
if (temas?.length) {
  console.log(`  ${temas.length} temas con material` +
    (temas.length > TOPE_TEMAS ? ` (se le pasan los ${TOPE_TEMAS} mayores)` : ''));
}

// Los cotejos del sábado, indexados por episodio y posición de la afirmación.
// El número los recibe como HECHOS, no como sugerencias: los decidió el código y
// una pasada aparte, y volver a juzgarlos aquí sería deshacer el trabajo.
// `claim_text` y `title` NO son opcionales: el fusible construye de ahí el
// vocabulario que justifica cada dorado. Faltaban, la normalización degradaba a
// un set vacío, y TODO dorado habría levantado «dorado sin cotejo» — la regla
// central llevaba muerta desde su commit sin haberse disparado ni una vez.
//
// Y la ventana es la de la semana, no «10 días hacia atrás»: aquello alcanzaba
// DOS corridas de sábado, `cotejo_count` exageraba el doble, y un dorado de esta
// semana podía justificarse con un cotejo de la pasada.
const cotejos = await sb(
  `glossa_radar_cotejos?select=item_id,claim_idx,claim_text,title,verdict,verdict_reason,url,source_domain,` +
  `published_date,independence&created_at=gte.${desde.toISOString()}&limit=500`);
// Cómo le ha ido a cada fuente cuando se la ha comprobado. Es un recuento, no un
// juicio, y es lo único que ninguna lectura del canal puede dar: «de 7
// afirmaciones comprobadas, ninguna documentada, 1 contradicha».
const historial = await sb('rpc/glossa_radar_historial_fuentes', { method: 'POST', body: '{}' })
  .catch(() => []);

// El parte de la salida a buscar. Se lee aunque no haya traído nada: una
// AUSENCIA no tiene fila en `items`, y «se buscó sobre esto y no había nada
// fuera» es justo lo que el número no podría decir sin esto.
const partes = await sb(
  `glossa_radar_reportajes?select=label,entran,hallados,paro,colapsados,dominios_vacios,paises` +
  `&week_start=eq.${iso(desde)}&limit=50`).catch(() => []);

const porClaim = {};
for (const c of cotejos ?? []) porClaim[`${c.item_id}:${c.claim_idx}`] = c;
if (cotejos?.length) console.log(`  ${cotejos.length} cotejos de esta semana`);

// Cada episodio lleva un id corto. El modelo lo cita en `sources`, y al pintar
// se convierte en un enlace al original. Sin esto no hay forma de llegar a la
// fuente desde el número, que en una publicación cuya premisa es la procedencia
// es una omisión seria.
const idCorto = new Map();
const ficha = (x, i) => {
  const eid = `e${i + 1}`;
  idCorto.set(eid, { url: x.url, title: x.title, channel: canal(x) });
  return {
    id: eid,
    title: x.title, channel: canal(x), when: String(x.published_at).slice(0, 10),
    speakers: x.digest?.speakers || [x.author],
    title_mismatch: x.digest?.title_mismatch || null,
    thesis: x.digest?.thesis, framing: x.digest?.framing,
    claims: (x.digest?.claims || []).slice(0, 6).map((c, k) => {
      const cot = porClaim[`${x.id}:${k}`];
      return { c: c.claim, status: c.status,
               ...(cot ? { check: { verdict: cot.verdict, why: cot.verdict_reason,
                                    doc: cot.source_domain, when: cot.published_date,
                                    independence: cot.independence } } : {}) };
    }),
    quotes: (x.digest?.quotes || []).slice(0, 2).map(q => ({ q: q.text, who: q.who })),
  };
};

/**
 * Un reportaje, con la forma que le corresponde.
 *
 * No lleva `thesis`, ni `framing`, ni `channel`, y esa ausencia es el diseño: un
 * reporte no es una voz y darle una lo convertiría en un comentarista más. La
 * forma misma es la distinción, antes de que ninguna regla del prompt tenga que
 * defenderla.
 *
 * Comparte el mapa `idCorto` con los episodios, así que `renderIssue` no cambia
 * y al pie del número los reportajes salen como `reuters.com ↗` junto a los
 * canales — que es lo que se pidió: todas las fuentes de donde salió.
 */
const fichaReporte = (x, i) => {
  const rid = `r${i + 1}`;
  const d = x.digest || {};
  idCorto.set(rid, { url: x.url, title: x.title, channel: d.outlet || x.author, kind: 'report' });
  return {
    id: rid,
    outlet: d.outlet || x.author, country: d.country || null,
    when: String(x.published_at).slice(0, 10),
    wire: d.wire && d.wire !== 'none' ? d.wire : null,
    lang: x.lang || d.lang || null,
    what_happened: d.what_happened,
    attributed: (d.attributed || []).slice(0, 5),
    figures: (d.figures || []).slice(0, 4),
    records: (d.records || []).slice(0, 4),
    quotes: (d.quotes || []).slice(0, 2).map(q => ({ q: q.text, who: q.who })),
    not_covered: d.not_covered || null,
  };
};

// ── Cuánto entra de cada fondo ───────────────────────────────────────────
// Los reportajes DESPLAZAN, no suman: el tope es el mismo para los dos juntos.
// Se les reserva una quinta parte y se llena primero, porque un reporte de fuera
// vale más por token que el trigésimo episodio de opinión — y porque K3 ya
// reventó un tiempo límite de treinta minutos a 71.000 tokens, así que subir el
// tope no es una salida.
const RESERVA = Math.round(TOPE_TOKENS * 0.20);

const reportaje = [];
let coste = 0;
for (const [i, x] of reportes.entries()) {
  const f = fichaReporte(x, i);
  const n = JSON.stringify(f).length / 4;
  if (coste + n > RESERVA) continue;
  reportaje.push(f); coste += n;
}

const ordenados = [...episodios].sort((a, b) =>
  (peso[b.id] || 0) - (peso[a.id] || 0) ||
  String(b.published_at).localeCompare(String(a.published_at)));

const material = [];
const dejadosFuera = [];
for (const [orden, x] of ordenados.entries()) {
  const f = ficha(x, orden);
  const n = JSON.stringify(f).length / 4;
  if (coste + n > TOPE_TOKENS) { dejadosFuera.push(x); continue; }
  material.push(f); coste += n;
}

// El mapa de ids se poda a lo que ENTRÓ. `ficha()` lo llenó para los ~290
// elementos traídos, pero el modelo solo vio los que cupieron: un id alucinado
// dentro del rango habría pintado un enlace ↗ a un episodio que la pieza no usó,
// y el fusible lo habría dado por bueno.
{
  const vistos = new Set([...material, ...reportaje].map(f => f.id));
  for (const k of [...idCorto.keys()]) if (!vistos.has(k)) idCorto.delete(k);
}

// Un recorte silencioso se lee igual que "lo cubrimos todo". Si sobra material,
// hay que decirlo aquí y decírselo también al modelo, para que el número no
// afirme una cobertura que no tuvo.
const fuera = dejadosFuera.length;
if (fuera > 0) {
  const dejados = {};
  for (const x of dejadosFuera) dejados[canal(x)] = (dejados[canal(x)] || 0) + 1;
  console.log(`  fuera del número por presupuesto: ${fuera} episodios ` +
    `(${Object.entries(dejados).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c} ${n}`).join(', ')})`);
}
if (reportes.length > reportaje.length) {
  console.log(`  fuera por la reserva: ${reportes.length - reportaje.length} reportajes`);
}
console.log(`  material: ${material.length} episodios + ${reportaje.length} reportajes ` +
            `≈ ${Math.round(coste).toLocaleString()} tokens`);

const bullets = a => a.length ? a.map(s => '  - ' + s).join('\n') : '  - (none)';

// ── Lo que dice la salida a buscar, contado ──────────────────────────────
// La penúltima línea es la invariante que se mide a sí misma: el día que diga
// que todos los reportes se presentaron desde un solo país, el número lo estará
// diciendo por su cuenta en su propio texto.
const hechosDeFuera = [];
if (partes?.length) {
  const conAlgo = partes.filter(p => Number(p.entran) > 0);
  const sinNada = partes.filter(p => !Number(p.entran));
  hechosDeFuera.push(`Reporting was searched for ${partes.length} subjects and found for ${conAlgo.length}.`);
  if (sinNada.length) {
    hechosDeFuera.push(`Nothing was found outside for: ${sinNada.map(p => p.label).join('; ')}.`);
  }
  for (const p of partes) {
    for (const r of p.colapsados?.relatos ?? []) {
      if ((r.medios ?? []).length < 2) continue;
      hechosDeFuera.push(`${r.medios.join(', ')} carried the same account of ${p.label}` +
        (r.agencia ? ` (an ${r.agencia} dispatch)` : '') + '; it is counted once here.');
    }
    for (const c of p.colapsados?.choques ?? []) hechosDeFuera.push(c);
    for (const b of p.colapsados?.bocas_compartidas ?? []) hechosDeFuera.push(b);
  }
  const paises = [...new Set(partes.flatMap(p => p.paises ?? []).filter(Boolean))];
  const fuera = paises.filter(p => p !== 'US');
  hechosDeFuera.push(fuera.length
    ? `Reports were filed from ${paises.join(', ')} — ${fuera.length} of ${paises.length} outside the United States.`
    : `Every report found was filed from the United States. Nothing came back from anywhere else.`);
  const vacios = [...new Set(partes.flatMap(p => p.dominios_vacios ?? []))];
  if (vacios.length) {
    hechosDeFuera.push(`${vacios.length} outlets returned nothing readable and could not be used: ` +
      `${vacios.slice(0, 10).join(', ')}.`);
  }
}

const PROMPT = `You are the editor of Glossa, writing this week's issue.

Glossa is a reading apparatus, not an aggregator. Its whole value is refusing to
flatten distinctions: what someone asserted without support stays "asserted";
what several aligned voices agree on is alignment, NOT corroboration.

COMMENTARY — what the followed channels said. ${material.length}${fuera ? ` of ${episodios.length}` : ''} episodes, ${iso(desde)} to ${iso(weekEnd)}${fuera ? ` (the ${fuera} least-connected were left out for space — do not claim to have covered everything)` : ''}:
${JSON.stringify(material)}
${reportaje.length ? `
REPORTING — ${reportaje.length} documents filed this week by outlets nobody here
follows. Each was searched for because the week clustered around these subjects;
none was sent in. They are not a fifth voice in the room. They are what the room
can be measured against.
${JSON.stringify(reportaje)}
` : ''}
WHAT THE WEEK CLUSTERED INTO — counted from how the material was classified, not
a list of sections. Fold, split or ignore these as the writing requires; a
subject here is owed nothing.
${bullets(racimos)}

COMPUTED FACTS ABOUT PROVENANCE — these are counted, not inferred. Use them; do
not restate them as your own deduction, and do not add names to these lists.
Channel concentration:
${bullets(concentracion)}
People appearing on more than one channel:
${bullets(cruzan)}
Same-day batches:
${bullets(tandas)}
${partes?.length ? `Outside reporting — counted, including where it found nothing:
${bullets(hechosDeFuera)}
` : ''}
TRACK RECORD — what happened when these sources' claims were checked against
outside documents, counted over time. Not an opinion about them; a count.
${bullets((historial ?? []).slice(0, 8).map(h =>
  `${h.name}: ${h.comprobadas} claims checked — ${h.documentadas} documented, ` +
  `${h.repetidas} only repeated elsewhere, ${h.contradichas} contradicted`))}

CROSS-CHECKS — some claims below carry a \`check\` field. Each was searched
against documents OUTSIDE this list of sources. The verdicts were decided by code
and by a separate pass; they are findings, not suggestions. Do not re-adjudicate
them, and do not soften them.
${cotejos?.length ? `  ${cotejos.length} claims were checked this week.` : '  (nothing was checked this week)'}

Write a magazine issue. Return ONLY JSON:
{
 "headline": "a thesis, not a label. Under 12 words.",
 "standfirst": "60-90 words. What made this week different. Not a list of what follows.",
 "pieces": [
   {"subject":"what this piece is ABOUT, 2-4 words, as a reader would name it",
    "title":"short, specific",
    "dek":"one line for the index, under 18 words",
    "body":"400-550 words of CONTINUOUS PROSE. Markdown paragraphs only.",
    "sources_note":"one or two sentences: who this came from, and say so plainly if the provenance weakens it",
    "sources":["the ids this piece drew on — episodes as e3, e12 and outside reports as r1, r4. Ids only, from above"]}
 ],
 "closing": ["4-6 items. Each: what NOBODY in the material said, and why it matters."]
}

RULES — the first is the one that matters:
- COINCIDING IS NOT CORROBORATING. If voices share a school or a channel, say so in
  the prose. Only treat agreement as confirmation when it survives opposite priors.
- Merge what the week clustered into 4-5 pieces. Thin subjects get folded in, not
  given a section. Those clusters are what the classification produced, not a
  contents page: several of them are usually one piece, and the labels are the
  classifier's, not yours to reuse.
- The sections are whatever this week produced. There is no standing list and no
  section is owed a place: if nothing on a subject arrived, it simply is not here.
- "subject" is a plain label so a reader scanning the contents knows what each piece
  covers before reading the title — the title alone rarely says. Name the actual
  thing: "Iran war", "AI policy", "White House staffing", "Mexico politics",
  "Israel-Turkey". NEVER a generic bucket like "politics", "economy", "analysis",
  "geopolitics" or "media" — a label that could sit on any piece tells the reader
  nothing. Two pieces may share a subject only if they genuinely cover the same one.
- Mark epistemic status IN THE PROSE using these inline spans, exactly:
    <span class="doc">…</span>   traceable to a named document or body
    <span class="attr">…</span>  attributed to a third party, unverified
    <span class="said">…</span>  asserted by the speaker, no support offered
  Wrap the CLAIM, not the whole sentence.
- Name people and their affiliation. Say who said what, and why they would say it.
- Look ACROSS pieces for contradictions between speakers that nobody in the material
  noticed. That is the most valuable thing you can find.
- No bullet lists inside "body". No section labels like "Where they clash". Prose.
- Never say how many episodes, voices or channels there were — not in a piece, not
  anywhere. The reader came for what the week meant, not for a tour of the machinery
  that read it. The concentration of sources is context for HOW you write, not
  something to report: it should show in how much weight you give a claim, never in
  a paragraph counting who filed what.
- English throughout.
- "sources" carries the ids of everything the piece actually used — episodes (\`e\`)
  and outside reports (\`r\`) in the same list. They become links back to the
  original, so a reader can go and read or hear it. Ids only, exactly as given;
  never invent one, and never list something you did not use.

${reportaje.length ? `REPORTING RULES — these govern how the outside documents may be used:
- A report is not a voice, and you must not give it one. Never write that an outlet
  "argues", "believes" or "warns". Write what it reported, who was on the record in
  it, and what it says is still unknown.
- Where COMMENTARY and REPORTING disagree, the disagreement IS the piece. Say who
  said what, and say which of the two went out and looked.
- A subject that appears only in REPORTING and in no channel CAN be its own piece.
  When it is, say so plainly inside the piece: nobody among the channels followed
  here mentioned it. That absence is the finding, not an embarrassment to cover.
- Agreement between a report and a channel is not corroboration either. An outlet
  relaying what the same officials told everyone is one source, not two.
- \`wire\` names the agency a report came through. Several outlets carrying one
  agency dispatch is ONE report, already counted once above. Never write it as
  several outlets converging.
- Where two reports give different numbers for the same thing, that clash is
  reportable and you should report it, naming both figures and who published each.
- \`records\` lists documents a report NAMES — a bill, a docket, a dataset. Naming a
  record is not being one, and it does NOT license <span class="doc">, which is
  still governed only by \`check.verdict\` and by nothing else.
- \`country\` says where a report was filed from. Where a story touches a country,
  say what the press there reported and where it differs. Never present one
  country's coverage as the account, and where the reports all come from one place
  the piece should read like it knows that.
- \`quotes\` from REPORTING obey the same rule as everywhere: verbatim English only.
  \`what_happened\` and \`attributed[].what\` are already English and are PARAPHRASE —
  use them freely, and never inside quotation marks.
- Every report you drew on goes in "sources" by its \`r\` id, exactly as an episode
  goes in by its \`e\` id. A piece that used a report and did not list it hid where
  it got something.

` : ''}CROSS-CHECK RULES — these govern what you may claim about evidence:
- A claim may be wrapped in <span class="doc"> ONLY if its \`check.verdict\` is
  "documenta". No cross-check means no gold marking, however solid the claim reads.
- "repite" means the claim was found elsewhere and the elsewhere is downstream, or
  from the same orbit. Write it as repetition and say where it repeats from. NEVER
  as confirmation — that is the exact error this publication exists to avoid.
- "contradice" MUST appear in the prose. A contradicted claim presented without its
  contradiction is the worst thing this issue can contain. Name the document.
- The TRACK RECORD is context, not a verdict on anyone. Small counts mean little:
  do not call a source unreliable off three checks. What it is for is proportion —
  a claim from a source whose claims have not once survived checking deserves more
  hedging than one from a source whose have, and the issue should read that way
  without ever saying so as an accusation.
- "sin_hallazgo" licenses one specific sentence — that the claim could not be traced
  to any document — and only where such a check exists. The absence of a check is
  NOT evidence of absence; say nothing about claims that were never checked.

WRITING CONSTRAINTS — these exist because earlier drafts failed on them:
- Keep sentences short enough to read once. Two subordinate clauses is the ceiling.
- At most seven named people per piece. If more appear in the material, choose the
  ones who carry the argument and drop the rest; a name the reader cannot hold is noise.
- QUOTE ONLY VERBATIM ENGLISH from the material. Some digests are stored in Spanish;
  if a quote is not already in English, PARAPHRASE it without quotation marks. Never
  translate a quotation and present it as the speaker's words.
- Quote sparingly and briefly, always attributed. Never reproduce passages.
- Where a headline misrepresents its own episode, say plainly what the episode
  actually contained and what the title claimed. Never allude to a title the reader
  has not seen, and never build a sentence on the reader recognising one.`;

// ── Escribir ─────────────────────────────────────────────────────────────
// max_tokens generoso a propósito: K3 razona antes de responder y ambas cosas
// salen del mismo presupuesto. Con 16.000 el razonamiento se lo comió entero y
// `content` volvió VACÍO — un fallo que parecía un error de parseo y no lo era.
console.log(`Escribiendo con ${MODELO}…`);
const t0 = Date.now();
// `fetch` NO sirve aquí. Su dispatcher aborta a los 300 s esperando cabeceras
// (UND_ERR_HEADERS_TIMEOUT) y este modelo razona durante ~950 s antes de emitir
// nada. Falló en la primera prueba real, en silencio y sin llegar a la API.
// `node:https` deja el tiempo en nuestras manos.
// La cuenta admite UNA petición a la vez. Sin reintento, cualquier solape
// —una corrida anterior que aún no soltó el hueco, un «Rebuild» a mano mientras
// corre el domingo— tira el número entero con un 429. Pasó en la segunda prueba
// de publicación automática: la corrida previa seguía ocupando el turno.
async function pedirAKimi(intento = 0) {
  return await new Promise((ok, ko) => {
    const cuerpo = JSON.stringify({ model: MODELO, max_tokens: 64000,
      messages: [{ role: 'user', content: PROMPT }] });
    const req = https.request({
      hostname: 'api.moonshot.ai', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo),
                 Authorization: `Bearer ${MOONSHOT}` },
    }, res => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', c => { b += c; });
      res.on('end', () => (res.statusCode < 300 ? ok(b)
        : ko(Object.assign(new Error(`moonshot ${res.statusCode}: ${b.slice(0, 400)}`),
                           { status: res.statusCode }))));
    });
    req.on('error', ko);
    // 35 minutos, por debajo de los 50 del workflow para que el error lo dé este
    // guion —que sabe decir qué pasó— y no un corte seco del runner.
    req.setTimeout(35 * 60_000, () => req.destroy(new Error('sin respuesta en 35 min')));
    req.end(cuerpo);
  }).catch(async (e) => {
    const transitorio = e.status === 429 || e.status === 503;
    if (!transitorio || intento >= 4) throw e;
    // Esperas largas a propósito: si el hueco lo tiene otra corrida, puede tardar
    // veinte minutos en soltarlo. Reintentar a los dos segundos solo gasta turnos.
    const espera = [60, 180, 420, 900][intento] * 1000;
    console.log(`  ${String(e.message).slice(0, 70)} — reintento en ${espera / 60000} min`);
    await new Promise(r => setTimeout(r, espera));
    return pedirAKimi(intento + 1);
  });
}

// Ver el prompt sin escribir el número. Kimi cuesta dinero y sólo admite una
// petición a la vez, así que comprobar que el material y los recuentos entran
// bien no puede exigir gastar una corrida entera.
if (process.env.WEEKLY_DRY) {
  console.log('\n' + '─'.repeat(72) + '\n' + PROMPT + '\n' + '─'.repeat(72));
  console.log(`\n${Math.round(PROMPT.length / 4).toLocaleString()} tokens aprox. — WEEKLY_DRY, no se llama al modelo.`);
  process.exit(0);
}

const raw = await pedirAKimi();
// El parse va protegido para que el GASTO se apunte igual: la llamada de ~950 s
// ya se facturó respondiera lo que respondiera, y morir antes de apuntarla la
// dejaba invisible para el único tope que se mide en dólares.
let d;
try { d = JSON.parse(raw); }
catch {
  await apuntar(URL, KEY, 'moonshot', 1, 0, 0.05);   // estimación conservadora: no hay usage que leer
  console.error(`Moonshot devolvió algo que no es JSON (${raw.slice(0, 160)}). La llamada queda apuntada.`);
  process.exit(1);
}
const uso = d.usage || {};
const msg = d.choices?.[0]?.message || {};
let txt = (msg.content || '').trim();
console.log(`  ${Math.round((Date.now() - t0) / 1000)}s · razonó ${uso.completion_tokens_details?.reasoning_tokens ?? '?'} tok`);
if (!txt) {
  console.error(`El modelo no devolvió texto (finish=${d.choices?.[0]?.finish_reason}). Sube max_tokens.`);
  process.exit(1);
}
txt = txt.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
txt = txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1);
// Precios de Moonshot por millón de tokens, agosto 2026. Si cambian, esta cifra
// miente en silencio — por eso el tope de verdad se mide contra el saldo de la
// cuenta y esto solo sirve para verlo venir.
const COSTE = (uso) => (uso.prompt_tokens ?? 0) / 1e6 * 0.60
                     + (uso.completion_tokens ?? 0) / 1e6 * 2.50;
await apuntar(URL, KEY, 'moonshot', 1, uso.total_tokens ?? 0, COSTE(uso));

const numero = JSON.parse(txt);
const secciones = numero.pieces || [];
console.log(`  ${secciones.length} piezas · ${secciones.reduce((n, p) => n + String(p.body || '').split(/\s+/).length, 0)} palabras`);

// ── No pisar un número mejor ─────────────────────────────────────────────
// Pasó de verdad con la versión anterior: una pasada parcial sobrescribió un
// número completo. "Se regeneró" y "se regeneró entero" no son lo mismo.
//
// (Las dos compuertas que no dependen del texto ya se comprobaron ARRIBA, antes
// de llamar al modelo. Esta relectura es para la comparación por piezas, que sí
// necesita saber cuántas salieron.)
const [actual] = await sb(`glossa_radar_weekly?select=id,topic_count,state,parcial&week_start=eq.${iso(desde)}`);
// La compuerta de pisado, asimétrica de verdad:
//
//   parcial  → oficial   NUNCA. Antes esta celda pisaba siempre, y era alcanzable
//                        con el WEEK_END que la propia ayuda del workflow
//                        sugería: «el día siguiente al último» daba un sábado,
//                        el sábado es parcial, y el parcial machacaba el número
//                        oficial ya escrito.
//   oficial  → parcial   siempre: el domingo cierra la semana.
//   mismo    → mismo     gana el de más piezas (una pasada a medias ya pisó una
//                        completa una vez; no se repite).
if (actual && PARCIAL && !actual.parcial) {
  console.log('Ya existe el número OFICIAL de esta semana; un corte parcial no lo toca.');
  process.exit(0);
}
if (actual && PARCIAL === !!actual.parcial && (actual.topic_count || 0) > secciones.length) {
  console.log(`El número existente tiene ${actual.topic_count} piezas y esta pasada armó ${secciones.length}; se conserva el bueno.`);
  process.exit(0);
}

// El fusible, antes de guardar. Corre igual aquí, junto al botón de publicar y
// en la vía automática: si los tres no dan el mismo veredicto, no sirve de nada.
const veredicto = revisar(numero, { items, cotejos: cotejos ?? [], ids: new Set(idCorto.keys()),
                                    reportaje_count: reportaje.length });
const graves = veredicto.fallos.filter(f => f.grave);
console.log(graves.length
  ? `  fusible: ${graves.length} fallo(s) grave(s) — no puede publicarse solo`
  : `  fusible: pasa${veredicto.fallos.length ? ` (${veredicto.fallos.length} aviso(s))` : ''}`);
for (const f of veredicto.fallos.slice(0, 6))
  console.log(`    ${f.grave ? '✗' : '·'} ${f.regla}: ${String(f.detalle).slice(0, 88)}`);

const fila = {
  fuse: { ...veredicto, ran_at: new Date().toISOString() },
  cotejo_count: (cotejos ?? []).length,
  // Las dos cifras que dicen si salir a buscar sirve. `reportaje_count` es lo
  // que entró; `piezas_sin_reportaje`, cuántas piezas lo ignoraron habiéndolo.
  reportaje_count: reportaje.length,
  piezas_sin_reportaje: veredicto.piezas_sin_reportaje ?? 0,
  week_start: iso(desde), week_end: iso(weekEnd), parcial: PARCIAL,
  // El mapa de ids va con el cuerpo: sin él, `sources: ["e3"]` no lleva a
  // ninguna parte cuando se pinta.
  body: { ...numero, sources_index: Object.fromEntries(idCorto) }, state: 'borrador',
  item_count: items.length, topic_count: secciones.length,
  tokens_used: uso.total_tokens ?? null,
  generated_at: new Date().toISOString(),
};
await sb('glossa_radar_weekly?on_conflict=week_start', {
  method: 'POST', body: JSON.stringify(fila),
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
});

// ── Publicar solo, si procede ──────────────────────────────────────────────
//
// Tres condiciones, y las tres tienen que darse: el interruptor encendido, el
// fusible en verde, y el número no publicado ya. Un fallo grave del fusible NO
// se puede saltar por aquí — una persona sí puede publicar igualmente desde el
// panel, la automatización no. Esa asimetría es el diseño: quien lee sabe cosas
// que el fusible no.
if (ajus.auto_publish === true && PARCIAL) {
  // La condición existe por su cola, no por el bochorno: un parcial publicado
  // deja `state='publicado'`, y el domingo siguiente el guion ve eso y NO
  // escribe el número real de la semana. Nadie lo notaría — el vigilante solo
  // comprueba que la fila exista.
  console.log('Corte parcial: no se publica solo aunque el fusible pase. El oficial del domingo decide.');
} else if (ajus.auto_publish === true) {
  if (graves.length) {
    console.log(`No se publica solo: el fusible marcó ${graves.length} fallo(s). Espera en el panel.`);
  } else {
    await sb(`glossa_radar_weekly?week_start=eq.${iso(desde)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ state: 'publicado', published_at: new Date().toISOString() }),
    });
    console.log(`PUBLICADO en https://glossa.ademas.ai/weekly/${iso(desde)}/`);
  }
} else {
  console.log('Queda en borrador: la publicación automática está apagada.');
}
console.log(`Número guardado como borrador · ${iso(desde)} → ${iso(weekEnd)}`);
console.log(`Titular: ${numero.headline}`);
