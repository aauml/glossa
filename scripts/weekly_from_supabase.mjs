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
const TOPE_TOKENS = Number(process.env.WEEKLY_TOKEN_BUDGET || 90_000);

const enlaces = await sb(`glossa_radar_item_topics?select=item_id,relevance,topic_id&limit=5000`);
const peso = {};
for (const e of enlaces) {
  peso[e.item_id] = (peso[e.item_id] || 0) + (e.relevance === 'central' ? 3 : 1);
}

const ficha = x => ({
  title: x.title, channel: canal(x), when: String(x.published_at).slice(0, 10),
  speakers: x.digest?.speakers || [x.author],
  title_mismatch: x.digest?.title_mismatch || null,
  thesis: x.digest?.thesis, framing: x.digest?.framing,
  claims: (x.digest?.claims || []).slice(0, 6).map(c => ({ c: c.claim, status: c.status })),
  quotes: (x.digest?.quotes || []).slice(0, 2).map(q => ({ q: q.text, who: q.who })),
});

const ordenados = [...items].sort((a, b) =>
  (peso[b.id] || 0) - (peso[a.id] || 0) ||
  String(b.published_at).localeCompare(String(a.published_at)));

const material = [];
let coste = 0;
for (const x of ordenados) {
  const f = ficha(x);
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

Write a magazine issue. Return ONLY JSON:
{
 "headline": "a thesis, not a label. Under 12 words.",
 "standfirst": "60-90 words. What made this week different. Not a list of what follows.",
 "pieces": [
   {"subject":"what this piece is ABOUT, 2-4 words, as a reader would name it",
    "title":"short, specific",
    "dek":"one line for the index, under 18 words",
    "body":"400-550 words of CONTINUOUS PROSE. Markdown paragraphs only.",
    "sources_note":"one or two sentences: who this came from, and say so plainly if the provenance weakens it"}
 ],
 "closing": ["4-6 items. Each: what NOBODY in the material said, and why it matters."],
 "colophon": "80-120 words on how much of this week came through how few channels."
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
- Never say how many episodes or voices a topic had.
- English throughout.

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
  // Sin actividad en 30 min es que algo murió; el máximo medido fue 952 s.
  req.setTimeout(30 * 60_000, () => req.destroy(new Error('sin respuesta en 30 min')));
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

const fila = {
  week_start: iso(desde), week_end: iso(weekEnd),
  body: numero, state: 'borrador',
  item_count: items.length, topic_count: secciones.length,
  tokens_used: uso.total_tokens ?? null,
  generated_at: new Date().toISOString(),
};
await sb('glossa_radar_weekly?on_conflict=week_start', {
  method: 'POST', body: JSON.stringify(fila),
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
});
console.log(`Número guardado como borrador · ${iso(desde)} → ${iso(weekEnd)}`);
console.log(`Titular: ${numero.headline}`);
