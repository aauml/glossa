// consejo_from_supabase.mjs — autocorrección con contrapeso.
//
// El cotejo mide los juicios del propio sistema. Cuando esa medición dice que
// una etapa calibra mal —por ejemplo, que marca «documentado» cosas que no
// sobreviven a la comprobación—, esto convoca a un comité de OTROS modelos para
// decidir qué corregir.
//
// La regla que lo hace algo distinto de la deriva, copiada de thesis (D-038):
// **el comité es contrapeso, no puede corregir sus propios deberes.** Quien
// analiza es Gemini, así que Gemini no vota sobre cómo analizar. Si algún día se
// corrige al que escribe el número —Kimi—, Kimi sale del comité y entra otro.
//
// Y tres límites que hacen esto reversible en vez de acumulativo:
//   1. Solo se escribe en RANURAS con nombre. Nunca se reescribe un prompt.
//   2. Todo queda registrado: qué se midió, quién votó qué, por qué.
//   3. Se revierte con un clic desde el panel.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, MOONSHOT_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY.

import { apuntar } from '../src/lib/presupuesto.js';

const URL_SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
if (!URL_SB || !KEY) { console.error('Falta SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function sb(path, init = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers || {}) } });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${r.status}: ${t.slice(0, 240)}`);
  return t ? JSON.parse(t) : null;
}

// ── El comité ──────────────────────────────────────────────────────────────
//
// Tres casas distintas, todas baratas. Ninguna es Gemini, que es quien analiza:
// esa es toda la gracia. Una deliberación son ~3.000 tokens de entrada y ~600 de
// salida, una vez por semana como mucho — céntimos al año.
// Tres casas distintas, todas del tramo barato. Ninguna es Gemini, que es quien
// analiza: esa es toda la gracia.
//
// El tramo barato no es una concesión, es lo medido. Puestos a decidir sobre una
// muestra de cuatro casos, `gpt-5-nano` y `deepseek-v4-flash` dijeron que no daba
// para concluir; `gpt-5-mini`, que cuesta más, votó cambiar. Para esta tarea
// —leer unos recuentos y decidir si significan algo— el modelo caro no compra
// nada, y de hecho se dejó llevar por el ruido.
//
// Qwen por Groq quedó fuera: no emite JSON limpio de forma fiable.
//
// Una deliberación son ~6.000 tokens entre los tres, una vez por semana como
// mucho. Céntimos al año.
const COMITE = [
  { casa: 'deepseek', modelo: 'deepseek-v4-flash', url: 'https://api.deepseek.com/chat/completions',   env: 'DEEPSEEK_API_KEY' },
  // La familia gpt-5 rechaza `max_tokens` y quiere `max_completion_tokens`; se
  // declara aquí en vez de llenar `votar()` de condicionales por proveedor.
  { casa: 'openai',   modelo: 'gpt-5-nano',        url: 'https://api.openai.com/v1/chat/completions',  env: 'OPENAI_API_KEY',
    campoTokens: 'max_completion_tokens' },
  { casa: 'moonshot', modelo: 'kimi-k2.6',         url: 'https://api.moonshot.ai/v1/chat/completions', env: 'MOONSHOT_API_KEY' },
];

async function votar(miembro, pregunta) {
  const clave = process.env[miembro.env];
  if (!clave) return { ...miembro, error: `sin ${miembro.env}` };
  try {
    const r = await fetch(miembro.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
      body: JSON.stringify({
        model: miembro.modelo,
        ...(miembro.campoTokens ? { [miembro.campoTokens]: 8000 } : {}),
        // Holgado a propósito. Kimi razona antes de responder y lo paga del mismo
        // presupuesto: con 1.200 devolvió la respuesta vacía, que es el mismo
        // fallo que ya costó una tarde con K3.
        ...(miembro.campoTokens ? {} : { max_tokens: 8000 }),
        // Sin `response_format`. Tres proveedores distintos lo implementan de
        // tres maneras —Groq exige la palabra «json» en minúscula y devuelve un
        // 400 sin ella— y no hace falta: el JSON se recorta entre llaves más
        // abajo, que funciona igual en los tres.
        messages: [{ role: 'user', content: pregunta }],
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) return { ...miembro, error: `${r.status}: ${(await r.text()).slice(0, 120)}` };
    const d = await r.json();
    let txt = (d.choices?.[0]?.message?.content || '').trim();
    txt = txt.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
    const i = txt.indexOf('{'), j = txt.lastIndexOf('}');
    if (i >= 0) txt = txt.slice(i, j + 1);
    return { ...miembro, ...JSON.parse(txt), tokens: d.usage?.total_tokens ?? 0 };
  } catch (e) {
    return { ...miembro, error: String(e).slice(0, 140) };
  }
}

function pregunta(evidencia, reglaActual, ranuraActual) {
  return [
    'You are one of three independent reviewers on a committee. You are NOT the model',
    'whose work is being reviewed — that is the point of you being here.',
    '',
    'A publication marks every claim it reads as one of: asserted (no support offered),',
    'attributed (to a third party), or documented (traceable to a real record). A separate,',
    'later pass then searches each claim against outside documents and records what it found.',
    '',
    'MEASURED, over the period below:',
    JSON.stringify(evidencia, null, 2),
    '',
    'THE RULE THAT PRODUCED THOSE LABELS, as currently written:',
    `  ${reglaActual}`,
    '',
    ranuraActual ? `A previous committee already added this note:\n  "${ranuraActual}"` : '(no previous correction is in force)',
    '',
    'Return only a json object, nothing else:',
    '{"cambiar": true|false,',
    ' "propuesta": "one or two sentences to ADD to the rule, in English, or null",',
    ' "razon": "one sentence: what in the numbers justifies this"}',
    '',
    'RULES FOR YOUR VOTE:',
    '- A small sample proves nothing. If the counts are too few to distinguish a real',
    '  miscalibration from noise, vote `cambiar: false` and say so. That is a real answer,',
    '  not a failure to decide.',
    '- Your proposal ADDS to the rule; it never replaces it. Keep it under 40 words.',
    '- Correct in the direction the evidence points. If the labeller is over-claiming',
    '  "documented", the fix makes that label harder to earn, not easier.',
    '- Do not propose anything that would make the labeller assert MORE confidence than',
    '  the evidence supports. On a publication whose whole premise is not overstating what',
    '  is known, a permissive error is worse than a strict one.',
    '- Never propose removing a distinction. Fewer categories always reads as more certainty.',
  ].filter(Boolean).join('\n');
}

// ── Corrida ────────────────────────────────────────────────────────────────
const [ajustesRaw, calibracion] = await Promise.all([
  sb('glossa_radar_settings?select=key,value'),
  sb('rpc/glossa_radar_calibracion', { method: 'POST', body: '{}' }),
]);
const ajus = Object.fromEntries((ajustesRaw ?? []).map(r => [r.key, r.value]));
const MINIMO = Number(ajus.consejo_minimo_muestra ?? 12);
const UMBRAL = Number(ajus.consejo_umbral_calibracion ?? 0.34);

const doc = (calibracion ?? []).find(c => c.etiqueta_analisis === 'documentado');
if (!doc) { console.log('Todavía no hay nada comprobado con etiqueta «documentado».'); process.exit(0); }

const tasa = doc.comprobadas ? Number(doc.confirmadas) / Number(doc.comprobadas) : 1;
console.log(`Calibración de «documentado»: ${doc.confirmadas} de ${doc.comprobadas} confirmadas (${(tasa * 100).toFixed(0)}%)`);

// El freno que evita corregir por ruido. Con cuatro casos no se toca nada: se
// espera. Un comité convocado sobre una muestra que no distingue señal de ruido
// produce una corrección con toda la ceremonia y ninguna base.
if (Number(doc.comprobadas) < MINIMO) {
  console.log(`Muestra de ${doc.comprobadas}, hacen falta ${MINIMO}. No se convoca — con estos números no se distingue un fallo real del azar.`);
  process.exit(0);
}
if (tasa >= UMBRAL) {
  console.log(`Por encima del umbral (${(UMBRAL * 100).toFixed(0)}%). No hace falta corregir nada.`);
  process.exit(0);
}

const REGLA = '"documentado" solo si remite a un documento concreto y verificable.';
const ranuraActual = String(ajus.prompt_calibracion_digest ?? '');
const evidencia = { periodo: 'desde que existe el cotejo', por_etiqueta: calibracion };
const q = pregunta(evidencia, REGLA, ranuraActual);

console.log(`Convocando: ${COMITE.map(m => m.casa).join(', ')} — y NO Gemini, que es a quien se corrige.`);
const votos = await Promise.all(COMITE.map(m => votar(m, q)));
for (const v of votos)
  console.log(`  ${v.casa.padEnd(9)} ${v.error ? 'ERROR: ' + v.error : (v.cambiar ? 'cambiar' : 'no cambiar') + ' — ' + String(v.razon ?? '').slice(0, 76)}`);

const validos = votos.filter(v => !v.error);
if (validos.length < 2) { console.log('Menos de dos votos válidos: no hay comité. No se cambia nada.'); process.exit(1); }

const aFavor = validos.filter(v => v.cambiar && v.propuesta);
const hayMayoria = aFavor.length > validos.length / 2;

let decision = null, motivo;
if (!hayMayoria) {
  motivo = `${aFavor.length} de ${validos.length} a favor: sin mayoría, no se toca nada.`;
} else {
  // La propuesta más corta que tenga mayoría. No se fusionan textos de varios
  // modelos: un pegote de tres frases no lo escribió nadie y no lo revisó nadie.
  decision = aFavor.map(v => String(v.propuesta).trim()).sort((a, b) => a.length - b.length)[0];
  motivo = `${aFavor.length} de ${validos.length} a favor. Se toma la propuesta más breve.`;
}
console.log(`\n${motivo}`);
if (decision) console.log(`Nota añadida a la ranura:\n  «${decision}»`);

const coste = validos.reduce((n, v) => n + (v.tokens ?? 0), 0) / 1e6 * 1.0;   // ~$1/Mtok mezclando las tres
await sb('glossa_radar_consejo', {
  method: 'POST', headers: { Prefer: 'return=minimal' },
  body: JSON.stringify([{
    convocado_por: `calibracion_documentado: ${doc.confirmadas}/${doc.comprobadas}`,
    ranura: 'prompt_calibracion_digest', evidencia, pregunta: q,
    votos: votos.map(({ casa, modelo, cambiar, propuesta, razon, error }) =>
      ({ casa, modelo, cambiar: cambiar ?? null, propuesta: propuesta ?? null, razon: razon ?? null, error: error ?? null })),
    decision, motivo, aplicado: !!decision, coste_usd: coste,
  }]),
});
for (const v of validos) if (v.tokens) await apuntar(URL_SB, KEY, v.casa, 1, v.tokens, 0);

if (decision) {
  await sb('glossa_radar_settings', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ key: 'prompt_calibracion_digest', value: decision,
                            updated_at: new Date().toISOString() }]),
  });
  console.log('Aplicada. Reversible desde el panel con un clic.');
}
