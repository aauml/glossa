// Glosa semanal automática de cada canal YouTube elegido en el panel.
// Lee los digests ya pagados del radar; nunca vuelve a descargar ni transcribir.
import { ajustes, apuntar, precioChat, PRECIOS } from '../src/lib/presupuesto.js';

const URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const MODEL = process.env.CHANNEL_WEEKLY_MODEL || 'deepseek-v4-pro';
const PROVIDER = MODEL.startsWith('deepseek') ? 'deepseek' : 'moonshot';
const MODEL_KEY = PROVIDER === 'deepseek' ? process.env.DEEPSEEK_API_KEY : process.env.MOONSHOT_API_KEY;
const ENDPOINT = PROVIDER === 'deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://api.moonshot.ai/v1/chat/completions';
const OUTPUT_TOKENS = 5000;
const MAX_COST = Number(process.env.CHANNEL_WEEKLY_MAX_USD || '0.75');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

export function estimateCost(chars, model = MODEL, outputTokens = OUTPUT_TOKENS) {
  const price = PRECIOS[model];
  if (!price) throw new Error(`modelo sin precio conocido: ${model}`);
  return ((Math.ceil(chars / 4) + 1500) * price.in + outputTokens * price.out) / 1e6;
}

export function materialFor(item) {
  const d = item.digest || {};
  return {
    id: item.id, title: item.title, url: item.url,
    published_at: item.published_at, lang: item.lang,
    speakers: (Array.isArray(d.speakers) ? d.speakers : []).slice(0, 5),
    thesis: String(d.thesis ?? '').slice(0, 700),
    framing: String(d.framing ?? '').slice(0, 500),
    claims: (Array.isArray(d.claims) ? d.claims : []).slice(0, 5)
      .map(c => ({ text: String(c.text ?? c.claim ?? '').slice(0, 450),
                   status: String(c.status ?? '').slice(0, 40),
                   checkable: String(c.checkable ?? '').slice(0, 250) })),
  };
}

export function validateGlossa(body, ids) {
  if (!body || typeof body !== 'object') throw new Error('respuesta no es un objeto');
  if (typeof body.title !== 'string' || body.title.length < 10 || body.title.length > 140)
    throw new Error('título ausente o inválido');
  if (typeof body.lead !== 'string' || body.lead.length < 80 || body.lead.length > 1800)
    throw new Error('entrada ausente o inválida');
  if (!Array.isArray(body.sections) || body.sections.length < 1 || body.sections.length > 12)
    throw new Error('secciones ausentes o excesivas');
  for (const s of body.sections) {
    if (typeof s.heading !== 'string' || !s.heading.trim() ||
        typeof s.text !== 'string' || s.text.length < 100 || s.text.length > 5000 ||
        !Array.isArray(s.item_ids) || !s.item_ids.length ||
        s.item_ids.some(id => !ids.has(id)))
      throw new Error('sección inválida o referencia ajena al canal');
  }
  if (typeof body.closing !== 'string' || body.closing.length < 40 || body.closing.length > 1800)
    throw new Error('cierre ausente o inválido');
  // No hay citas directas: el radar conserva textos breves y en varias lenguas.
  const prose = [body.title, body.lead, ...body.sections.map(s => s.text), body.closing].join(' ');
  if (/[“”«»]/.test(prose) || /"[^"]{10,}"/.test(prose))
    throw new Error('citas directas no verificables');
  return body;
}

async function sb(path, init = {}) {
  const r = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 250)}`);
  return t ? JSON.parse(t) : null;
}

async function reserve(source, week, patch) {
  const rows = await sb('glossa_channel_weeklies?on_conflict=source_key,week_start', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ source_key: source.id, source_id: source.id, source_name: source.name,
      week_start: week.week_start, week_end: week.week_end, state: 'running', ...patch }),
  });
  return rows?.length > 0;
}

async function update(source, week, patch) {
  await sb(`glossa_channel_weeklies?source_key=eq.${source.id}&week_start=eq.${week.week_start}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch),
  });
}

async function generate(source, week, settings) {
  const items = await sb(`glossa_radar_items?select=id,title,url,published_at,lang,digest` +
    `&source_id=eq.${source.id}&state=eq.digested&published_at=gte.${week.desde}` +
    `&published_at=lt.${week.hasta}&order=published_at.asc&limit=1000`);
  if (!items?.length) return console.log(`${source.name}: sin videos analizados`);
  if (items.length === 1000) throw new Error(`${source.name}: 1000+ videos; no se puede garantizar que entren todos`);
  const material = items.map(materialFor);
  const payload = JSON.stringify(material);
  const estimate = estimateCost(payload.length);
  const limit = Math.min(MAX_COST, Number(settings.cap_glosa_canal_usd || MAX_COST));
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('límite de costo inválido');
  console.log(`${source.name}: ${items.length} videos · estimado $${estimate.toFixed(3)} · límite $${limit.toFixed(2)}`);
  const prompt = `Escribe una glosa semanal en español SOLO sobre los videos de este canal, publicados del ${week.week_start} al ${week.week_end}.
Lee todo el material y cubre todos los videos de la semana, agrupándolos por asunto cuando tenga sentido. Sintetiza con contexto suficiente, separa hechos de opiniones y muestra desacuerdos y límites. Trata los claims marcados como afirmados o atribuidos como afirmaciones, no como hechos confirmados. No inventes hechos, citas ni una tesis humana. No uses comillas de cita directa: los digests pueden proceder de otros idiomas. Cada sección debe citar los id de los videos que la sostienen. No uses fuentes externas. Devuelve solo JSON con esta forma: {"title":"Título", "lead":"Entrada", "sections":[{"heading":"Tema", "text":"Párrafos de síntesis", "item_ids":["id real de un video"]}], "closing":"Cierre"}. La lectura debe ser sustantiva, sin repetir la misma idea ni mencionar instrucciones técnicas.
Canal: ${source.name}\nMaterial: ${payload}`;
  // Un token no puede representar menos de un byte: este techo es deliberadamente
  // más conservador que la cifra estimada que ve Arturo en el panel.
  const price = PRECIOS[MODEL];
  const hardUpper = (Buffer.byteLength(prompt, 'utf8') * price.in + OUTPUT_TOKENS * price.out) / 1e6;
  if (estimate > limit || hardUpper > limit)
    throw new Error(`${source.name}: costo posible $${hardUpper.toFixed(3)} supera el límite $${limit}; no se llamó al modelo`);
  // La clave única decide quién genera. Una ejecución concurrente no vuelve a llamar al modelo.
  if (!await reserve(source, week, { item_count: items.length,
    estimated_cost_usd: estimate, model: MODEL }))
    return console.log(`${source.name}: semana ya reservada; no se vuelve a cobrar`);
  try {
    const response = await fetch(ENDPOINT, { method: 'POST', signal: AbortSignal.timeout(20 * 60_000),
      headers: { Authorization: `Bearer ${MODEL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: OUTPUT_TOKENS,
        ...(PROVIDER === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }] }) });
    const raw = await response.text();
    if (!response.ok) throw new Error(`${PROVIDER} ${response.status}: ${raw.slice(0, 180)}`);
    const result = JSON.parse(raw);
    const actual = precioChat(MODEL, result.usage || {});
    await apuntar(URL, KEY, PROVIDER, 1, result.usage?.total_tokens ?? 0, actual);
    if (result.choices?.[0]?.finish_reason !== 'stop') throw new Error('respuesta truncada o incompleta');
    const body = validateGlossa(JSON.parse(result.choices[0].message.content), new Set(items.map(x => x.id)));
    await update(source, week, { state: 'publicado', body,
      items: items.map(({ id, title, url, published_at }) => ({ id, title, url, published_at })),
      item_count: items.length, model: MODEL, estimated_cost_usd: estimate,
      actual_cost_usd: actual, published_at: new Date().toISOString(), error: null });
    console.log(`${source.name}: publicado · $${actual.toFixed(3)}`);
  } catch (e) {
    await update(source, week, { state: 'error', error: String(e).slice(0, 500) });
    throw e;
  }
}

if (process.argv[1]?.endsWith('channel_weekly.mjs')) {
  if (!URL || !KEY || !MODEL_KEY || !Number.isFinite(MAX_COST) || MAX_COST <= 0)
    throw new Error('configuración incompleta o límite inválido');
  const [window] = await sb('rpc/glossa_semana_actual', { method: 'POST', body: '{}' });
  if (window.parcial) throw new Error('el corte oficial solo corre el domingo, después de cerrar la semana');
  const weekStart = window.desde.slice(0, 10);
  const week = { desde: window.desde, hasta: window.hasta,
    week_start: weekStart,
    week_end: new Date(Date.parse(`${weekStart}T00:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10) };
  const settings = await ajustes(URL, KEY);
  const sources = await sb('glossa_radar_sources?select=id,name,kind,active,weekly_gloss_enabled' +
    '&kind=eq.youtube&active=eq.true&weekly_gloss_enabled=eq.true');
  for (const source of sources) {
    try { await generate(source, week, settings); }
    catch (e) {
      console.error(`${source.name}: ${String(e).slice(0, 260)}`);
      process.exitCode = 1;
    }
  }
}
