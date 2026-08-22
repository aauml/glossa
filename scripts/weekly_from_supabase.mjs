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
// Corre el domingo de madrugada, así que la semana que acaba de cerrarse es
// domingo→sábado: empieza hace siete días y termina ayer. Se toma la ventana
// completa hasta la medianoche de ayer para no cortar un sábado por la mitad.
const ahora   = process.env.WEEK_END ? new Date(process.env.WEEK_END) : new Date();
const finDia  = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
const desde   = new Date(finDia); desde.setUTCDate(desde.getUTCDate() - 7);
const weekEnd = new Date(finDia); weekEnd.setUTCDate(weekEnd.getUTCDate() - 1);

console.log(`Semana ${iso(desde)} → ${iso(weekEnd)}`);

// Kimi es lo único que cuesta dinero aquí, así que es lo único con tope en
// dólares. Alcanzarlo no es un error: se sale sin escribir y se dice por qué.
const ajus = await ajustes(URL, KEY);
const gasto = await gastoActual(URL, KEY);
if (!cabeCoste(gasto, ajus, 'moonshot', 'cap_moonshot_mes_usd')) {
  console.log(`Tope mensual alcanzado: $${gasto.moonshot?.coste_mes} de ` +
              `$${ajus.cap_moonshot_mes_usd}. No se escribe el número.`);
  process.exit(0);
}

const items = await sb(
  `glossa_radar_items?select=id,title,author,url,published_at,digest,glossa_radar_sources(name)` +
  `&state=eq.digested&published_at=gte.${desde.toISOString()}&published_at=lt.${finDia.toISOString()}&limit=500`);

if (!items.length) { console.log('Sin material digerido esta semana — no se escribe nada.'); process.exit(0); }
console.log(`${items.length} episodios`);

const canal = x => x.glossa_radar_sources?.name || '—';

// ── Lo que el modelo NO debe deducir ─────────────────────────────────────
// Se le da calculado. Cuando se le dejó inferirlo, acertó dos nombres de tres:
// el tercero era el copresentador del canal, no un invitado que rotara. Contar
// es trabajo de código; interpretar es trabajo del modelo.
const porCanal = {};
for (const x of items) porCanal[canal(x)] = (porCanal[canal(x)] || 0) + 1;
const concentracion = Object.entries(porCanal).sort((a, b) => b[1] - a[1])
  .filter(([, n]) => n > 1).map(([c, n]) => `${n} of the ${items.length} episodes came through ${c}`);

const donde = {};
for (const x of items) {
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
for (const x of items) {
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

const enlaces = await sb(`glossa_radar_item_topics?select=item_id,relevance,topic_id&limit=5000`);
const peso = {};
for (const e of enlaces) {
  peso[e.item_id] = (peso[e.item_id] || 0) + (e.relevance === 'central' ? 3 : 1);
}

// Los cotejos del sábado, indexados por episodio y posición de la afirmación.
// El número los recibe como HECHOS, no como sugerencias: los decidió el código y
// una pasada aparte, y volver a juzgarlos aquí sería deshacer el trabajo.
const cotejos = await sb(
  `glossa_radar_cotejos?select=item_id,claim_idx,verdict,verdict_reason,url,source_domain,` +
  `published_date,independence&created_at=gte.${new Date(Date.now() - 10 * 864e5).toISOString()}&limit=500`);
// Cómo le ha ido a cada fuente cuando se la ha comprobado. Es un recuento, no un
// juicio, y es lo único que ninguna lectura del canal puede dar: «de 7
// afirmaciones comprobadas, ninguna documentada, 1 contradicha».
const historial = await sb('rpc/glossa_radar_historial_fuentes', { method: 'POST', body: '{}' })
  .catch(() => []);

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

const ordenados = [...items].sort((a, b) =>
  (peso[b.id] || 0) - (peso[a.id] || 0) ||
  String(b.published_at).localeCompare(String(a.published_at)));

const material = [];
let coste = 0;
for (const [orden, x] of ordenados.entries()) {
  const f = ficha(x, orden);
  const n = JSON.stringify(f).length / 4;
  if (coste + n > TOPE_TOKENS) continue;
  material.push(f); coste += n;
}

// Un recorte silencioso se lee igual que "lo cubrimos todo". Si sobra material,
// hay que decirlo aquí y decírselo también al modelo, para que el número no
// afirme una cobertura que no tuvo.
const fuera = items.length - material.length;
if (fuera > 0) {
  const dejados = {};
  for (const x of ordenados.slice(material.length)) dejados[canal(x)] = (dejados[canal(x)] || 0) + 1;
  console.log(`  fuera del número por presupuesto: ${fuera} episodios ` +
    `(${Object.entries(dejados).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`${c} ${n}`).join(', ')})`);
}
console.log(`  material: ${material.length} episodios ≈ ${Math.round(coste).toLocaleString()} tokens`);

const bullets = a => a.length ? a.map(s => '  - ' + s).join('\n') : '  - (none)';

const PROMPT = `You are the editor of Glossa, writing this week's issue.

Glossa is a reading apparatus, not an aggregator. Its whole value is refusing to
flatten distinctions: what someone asserted without support stays "asserted";
what several aligned voices agree on is alignment, NOT corroboration.

MATERIAL — ${material.length}${fuera ? ` of ${items.length}` : ''} episodes, ${iso(desde)} to ${iso(weekEnd)}${fuera ? ` (the ${fuera} least-connected were left out for space — do not claim to have covered everything)` : ''}:
${JSON.stringify(material)}

COMPUTED FACTS ABOUT PROVENANCE — these are counted, not inferred. Use them; do
not restate them as your own deduction, and do not add names to these lists.
Channel concentration:
${bullets(concentracion)}
People appearing on more than one channel:
${bullets(cruzan)}
Same-day batches:
${bullets(tandas)}

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
    "sources":["the ids of the episodes this piece drew on, e.g. e3, e12 — ids only, from the material above"]}
 ],
 "closing": ["4-6 items. Each: what NOBODY in the material said, and why it matters."]
}

RULES — the first is the one that matters:
- COINCIDING IS NOT CORROBORATING. If voices share a school or a channel, say so in
  the prose. Only treat agreement as confirmation when it survives opposite priors.
- Merge the raw topics into 4-5 pieces. Thin topics get folded in, not given a section.
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
- "sources" carries the ids of the episodes the piece actually used. They become
  links back to the original, so a reader can go and hear it. Ids only, exactly as
  given; never invent one, and never list an episode you did not use.

CROSS-CHECK RULES — these govern what you may claim about evidence:
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
const raw = await new Promise((ok, ko) => {
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
      : ko(new Error(`moonshot ${res.statusCode}: ${b.slice(0, 400)}`))));
  });
  req.on('error', ko);
  // 35 minutos, por debajo de los 50 del workflow para que el error lo dé este
  // guion —que sabe decir qué pasó— y no un corte seco del runner.
  req.setTimeout(35 * 60_000, () => req.destroy(new Error('sin respuesta en 35 min')));
  req.end(cuerpo);
});
const d = JSON.parse(raw);
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
const [actual] = await sb(`glossa_radar_weekly?select=id,topic_count,state&week_start=eq.${iso(desde)}`);
if (actual && actual.state === 'publicado') {
  console.log('Ya hay un número PUBLICADO para esta semana; no se toca.'); process.exit(0);
}
if (actual && (actual.topic_count || 0) > secciones.length) {
  console.log(`El número existente tiene ${actual.topic_count} piezas y esta pasada armó ${secciones.length}; se conserva el bueno.`);
  process.exit(0);
}

// El fusible, antes de guardar. Corre igual aquí, junto al botón de publicar y
// en la vía automática: si los tres no dan el mismo veredicto, no sirve de nada.
const veredicto = revisar(numero, { items, cotejos: cotejos ?? [] });
const graves = veredicto.fallos.filter(f => f.grave);
console.log(graves.length
  ? `  fusible: ${graves.length} fallo(s) grave(s) — no puede publicarse solo`
  : `  fusible: pasa${veredicto.fallos.length ? ` (${veredicto.fallos.length} aviso(s))` : ''}`);
for (const f of veredicto.fallos.slice(0, 6))
  console.log(`    ${f.grave ? '✗' : '·'} ${f.regla}: ${String(f.detalle).slice(0, 88)}`);

const fila = {
  fuse: { ...veredicto, ran_at: new Date().toISOString() },
  cotejo_count: (cotejos ?? []).length,
  week_start: iso(desde), week_end: iso(weekEnd),
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
if (ajus.auto_publish === true) {
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
