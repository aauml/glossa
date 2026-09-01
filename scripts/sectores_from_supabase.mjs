// sectores_from_supabase.mjs — pone cada tema en su sector.
//
// El clasificador del radar crea temas episodio a episodio y nunca ve el
// conjunto, así que la lista acaba siendo 196 asuntos donde la guerra de Ucrania
// convive con la liga de fútbol y la dermatología. Esto los agrupa.
//
// La lista de sectores está CERRADA. Dejar que el modelo invente categorías
// produce treinta sectores con un tema cada uno, que es la lista original con
// más pasos. Si un tema no encaja en ninguno, va a «Other» y ahí se ve.
//
// Solo toca los que aún no tienen sector, así que correrlo cada cuatro horas
// desde el vigilante cuesta cero cuando no hay temas nuevos.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY.

import { ajustes, uso, apuntar, apuntarLocal, cabe } from '../src/lib/presupuesto.js';

const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY    = process.env.SUPABASE_SERVICE_KEY || '';
const GEMINI = process.env.GEMINI_API_KEY || '';
if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!GEMINI)         { console.error('Falta GEMINI_API_KEY'); process.exit(1); }

// El orden importa: es el que usa el panel para pintar los grupos, de lo que
// más se lee a lo que menos.
export const SECTORES = [
  'Geopolitics & war',
  'Economy & markets',
  'AI & technology',
  'Energy & resources',
  'U.S. politics',
  'Latin America',
  'Justice & crime',
  'Media & information',
  'Society & culture',
  'Other',
];

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
async function sb(path, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 240)}`);
  return t ? JSON.parse(t) : null;
}

const pendientes = await sb('glossa_radar_topics?select=id,label,description&sector=is.null&merged_into=is.null&limit=400');
if (!pendientes?.length) { console.log('Todos los temas ya tienen sector.'); process.exit(0); }
console.log(`${pendientes.length} tema(s) sin sector.`);

// Este gasto también es Gemini y también cuenta: corría cada hora contra la
// API sin `apuntar` ni `cabe`, así que los topes del día se medían contra un
// número corto y este consumo era invisible en el panel.
const ajus  = await ajustes(URL_SB, KEY);
const gasto = await uso(URL_SB, KEY);

// De 40 en 40: un lote enorme invita al modelo a devolver menos filas de las que
// recibió, y entonces no se sabe cuál se saltó.
const LOTE = 40;
let puestos = 0;

for (let i = 0; i < pendientes.length; i += LOTE) {
  const lote = pendientes.slice(i, i + LOTE);
  const prompt = [
    'Put each topic in exactly one sector. The list of sectors is CLOSED: never invent one.',
    '',
    'SECTORS:',
    ...SECTORES.map(s => `  - ${s}`),
    '',
    'TOPICS:',
    ...lote.map((t, n) => `  ${n + 1}. ${t.label}${t.description ? ` — ${String(t.description).slice(0, 120)}` : ''}`),
    '',
    `Return ONLY JSON: {"sectors":["<sector for 1>","<sector for 2>", …]} with EXACTLY ${lote.length} entries, in order.`,
    '',
    'Rules:',
    '- "Geopolitics & war" covers interstate conflict, alliances, foreign policy and defence.',
    '- "Economy & markets" covers debt, trade, sanctions as economic tools, corporate finance.',
    '- "Energy & resources" covers oil, gas, minerals, water, food systems.',
    '- "U.S. politics" is domestic: elections, Congress, parties, courts as politics.',
    '- "Latin America" wins over the others when the subject is a country in the region.',
    '- Sport, entertainment, health and everyday life go to "Society & culture".',
    '- Use "Other" only when nothing fits. It should be rare.',
  ].join('\n');

  if (!cabe(gasto, ajus, 'gemini', 'cap_gemini_dia')) {
    console.log('Tope diario de Gemini alcanzado: los temas que quedan esperan a mañana.');
    break;
  }
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 } }),
  });
  if (!r.ok) { console.error(`gemini ${r.status}: ${(await r.text()).slice(0, 200)}`); break; }
  const d = await r.json();
  await apuntar(URL_SB, KEY, 'gemini', 1, d.usageMetadata?.totalTokenCount ?? 0);
  apuntarLocal(gasto, 'gemini', 1);
  const txt = (d.candidates?.[0]?.content?.parts ?? []).map(x => x.text || '').join('');
  let sectores;
  try { sectores = JSON.parse(txt.replace(/^\s*```(?:json)?/, '').replace(/```\s*$/, '')).sectors; }
  catch { console.error('respuesta ilegible; se salta el lote'); continue; }

  // Si el modelo devuelve otra cantidad, NO se adivina el emparejamiento: se
  // salta el lote entero. Un tema con el sector de otro es peor que sin sector.
  if (!Array.isArray(sectores) || sectores.length !== lote.length) {
    console.error(`el lote devolvió ${sectores?.length ?? 0} de ${lote.length}; se salta`);
    continue;
  }

  for (let k = 0; k < lote.length; k++) {
    const sector = SECTORES.includes(sectores[k]) ? sectores[k] : 'Other';
    await sb(`glossa_radar_topics?id=eq.${lote[k].id}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ sector }),
    });
    puestos++;
  }
  console.log(`  ${puestos}/${pendientes.length}`);
}

console.log(`${puestos} tema(s) con sector.`);
