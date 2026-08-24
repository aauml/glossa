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

// ── Utilidades compartidas por las dos fases ───────────────────────────────

/** Contabiliza los votos de una convocatoria y deja el registro en la base. */
async function registrar({ convocadoPor, ranura, evidencia, pregunta: q, votos, decision, motivo, aplicado }) {
  const validos = votos.filter(v => !v.error);
  const coste = validos.reduce((n, v) => n + (v.tokens ?? 0), 0) / 1e6 * 1.0;   // ~$1/Mtok mezclando las tres
  await sb('glossa_radar_consejo', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify([{
      convocado_por: convocadoPor, ranura, evidencia, pregunta: q,
      votos: votos.map(({ casa, modelo, cambiar, propuesta, razon, error, alta, veredicto }) =>
        ({ casa, modelo, cambiar: cambiar ?? null, propuesta: propuesta ?? null,
           alta: alta ?? null, veredicto: veredicto ?? null, razon: razon ?? null, error: error ?? null })),
      decision, motivo, aplicado, coste_usd: coste,
    }]),
  });
  // El coste va a la fila del PROVEEDOR, no solo al registro del consejo: la casa
  // kimi comparte fila con el número semanal, y apuntarle $0 dejaba `llamadas`
  // subiendo sin coste que cuadrara — dos columnas de la misma fila en desacuerdo.
  for (const v of validos) if (v.tokens) {
    await apuntar(URL_SB, KEY, v.casa, 1, v.tokens, (v.tokens / 1e6) * 1.0);
  }
}

// ── Fase 1 · Calibración de las etiquetas ──────────────────────────────────
async function faseCalibracion(ajus) {
  const calibracion = await sb('rpc/glossa_radar_calibracion', { method: 'POST', body: '{}' });
  const MINIMO = Number(ajus.consejo_minimo_muestra ?? 12);
  const UMBRAL = Number(ajus.consejo_umbral_calibracion ?? 0.34);

  const doc = (calibracion ?? []).find(c => c.etiqueta_analisis === 'documentado');
  if (!doc) { console.log('Todavía no hay nada comprobado con etiqueta «documentado».'); return; }

  const tasa = doc.comprobadas ? Number(doc.confirmadas) / Number(doc.comprobadas) : 1;
  console.log(`Calibración de «documentado»: ${doc.confirmadas} de ${doc.comprobadas} confirmadas (${(tasa * 100).toFixed(0)}%)`);

  // El freno que evita corregir por ruido. Con cuatro casos no se toca nada: se
  // espera. Un comité convocado sobre una muestra que no distingue señal de ruido
  // produce una corrección con toda la ceremonia y ninguna base.
  if (Number(doc.comprobadas) < MINIMO) {
    console.log(`Muestra de ${doc.comprobadas}, hacen falta ${MINIMO}. No se convoca — con estos números no se distingue un fallo real del azar.`);
    return;
  }
  if (tasa >= UMBRAL) {
    console.log(`Por encima del umbral (${(UMBRAL * 100).toFixed(0)}%). No hace falta corregir nada.`);
    return;
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
  if (validos.length < 2) { console.log('Menos de dos votos válidos: no hay comité. No se cambia nada.'); process.exitCode = 1; return; }

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

  await registrar({
    convocadoPor: `calibracion_documentado: ${doc.confirmadas}/${doc.comprobadas}`,
    ranura: 'prompt_calibracion_digest', evidencia, pregunta: q, votos,
    decision, motivo, aplicado: !!decision,
  });

  if (decision) {
    await sb('glossa_radar_settings', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ key: 'prompt_calibracion_digest', value: decision,
                              updated_at: new Date().toISOString() }]),
    });
    console.log('Aplicada. Reversible desde el panel con un clic.');
  }
}

// ── Fase 2 · Fuentes orgánicas (0044) ──────────────────────────────────────
//
// El directorio de fuentes crece desde el material: las menciones del radar y
// los hallazgos del reportaje alimentan expedientes, y aquí el comité decide
// altas y veredictos. Las mismas tres casas, y la misma razón de fondo: quien
// analiza los episodios (Gemini) no vota sobre qué fuentes analizará.
//
// Dos frenos estructurales, ninguno de gusto:
//   - `fuentes_altas_por_semana`: cada fuente nueva cuesta cuota de Gemini a
//     diario; un domingo entusiasta no puede duplicar el gasto del sistema.
//   - `fuentes_tope_por_tema`: contra la cámara de eco no basta con contar
//     menciones — todo un racimo citándose a sí mismo produce menciones de
//     sobra. El tope obliga a elegir, y la pregunta al comité lleva la lista de
//     QUIÉNES citan al candidato para que la endogamia se vea.

/** Busca el RSS de un medio: primero lo que declare el HTML, luego los caminos de siempre. */
async function descubrirFeed(homepage) {
  const candidatas = [];
  try {
    const r = await fetch(homepage, { signal: AbortSignal.timeout(12_000),
                                      headers: { 'User-Agent': 'glossa-radar/1.0' } });
    if (r.ok) {
      const html = (await r.text()).slice(0, 300_000);
      for (const m of html.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
        const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
        if (href) { try { candidatas.push(new URL(href, homepage).href); } catch { /* href roto */ } }
      }
    }
  } catch { /* la portada no contestó; se prueban los caminos de siempre */ }
  for (const p of ['/feed', '/rss', '/rss.xml', '/atom.xml', '/index.xml']) {
    try { candidatas.push(new URL(p, homepage).href); } catch { /* homepage rota */ }
  }
  for (const url of [...new Set(candidatas)].slice(0, 7)) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000),
                                   headers: { 'User-Agent': 'glossa-radar/1.0' } });
      if (!r.ok) continue;
      if (/<(rss|feed|rdf)[\s>]/i.test((await r.text()).slice(0, 5_000))) return url;
    } catch { /* siguiente candidata */ }
  }
  return null;
}

function preguntaAlta(cand, contexto) {
  return [
    'You are one of three independent reviewers on a committee that decides which NEW',
    'sources a weekly review starts following. The models that analyse the material do',
    'not get a vote — that is the point of you being here.',
    '',
    'THE CANDIDATE:',
    JSON.stringify(cand, null, 2),
    '',
    'CONTEXT — sources already covering the topics this candidate would join, and how',
    'the current sources fared when their claims were checked against outside documents:',
    JSON.stringify(contexto, null, 2),
    '',
    'Return only a json object, nothing else:',
    '{"alta": true|false,',
    ' "razon": "one sentence: what in the evidence justifies this"}',
    '',
    'RULES FOR YOUR VOTE:',
    '- Being cited a lot is NOT enough. Look at WHO cites the candidate: if every citer',
    '  belongs to the same school or the same conversation, the mentions measure',
    '  alignment, not reach. An echo chamber produces abundant mentions by itself.',
    '- What earns admission is the prospect of material the review does not already',
    '  have: different countries, different method, primary documents, or a track',
    '  record of publishing figures others later confirmed.',
    '- Admission is ON PROBATION and scoped to the listed topics. You are not granting',
    '  trust; you are granting an audition that a later verification pass will grade.',
    '- If the evidence is thin, vote false. A source added by noise costs quota every',
    '  single day and crowds out a better one.',
  ].join('\n');
}

function preguntaPrueba(fuente, historial) {
  return [
    'You are one of three independent reviewers on a committee. A weekly review admitted',
    'the source below ON PROBATION some weeks ago. Decide its verdict now.',
    '',
    'THE SOURCE AND ITS FILE:',
    JSON.stringify(fuente, null, 2),
    '',
    'WHAT HAPPENED WHEN ITS CLAIMS WERE CHECKED against outside documents (verdicts were',
    'decided by an independent checking pass, not by the source or by this committee):',
    JSON.stringify(historial, null, 2),
    '',
    'Return only a json object, nothing else:',
    '{"veredicto": "confianza" | "degradar" | "seguir",',
    ' "razon": "one sentence grounded in the numbers above"}',
    '',
    'RULES FOR YOUR VOTE:',
    '- "confianza" only if it contributed material that HELD UP under checking, or',
    '  brought accounts genuinely distinct from what the existing sources already said.',
    '- "degradar" if it only ever repeated what better sources had already said, or its',
    '  claims were contradicted when checked. Redundancy is a reason to degrade: every',
    '  slot it occupies costs quota daily and crowds out a different voice.',
    '- "seguir" (stay on probation) if the sample is still too small to tell. That is a',
    '  real answer, not a failure to decide.',
  ].join('\n');
}

async function faseFuentes(ajus) {
  console.log('\n── Fuentes orgánicas ──');
  const MENC_MIN   = Number(ajus.candidato_menciones_minimas ?? 2);
  const SEM_MIN    = Number(ajus.candidato_semanas_reportaje ?? 2);
  const TOPE_TEMA  = Number(ajus.fuentes_tope_por_tema ?? 6);
  const ALTAS_MAX  = Number(ajus.fuentes_altas_por_semana ?? 2);
  const PRUEBA_SEM = Number(ajus.prueba_semanas_minimas ?? 3);

  // 1. Del grafo de citas a los expedientes. El RPC ya trae la independencia
  //    contada: cuántas fuentes DISTINTAS citan a cada clave.
  const expedientes = await sb(`rpc/glossa_radar_expedientes`, {
    method: 'POST', body: JSON.stringify({ minimo: MENC_MIN }),
  }).catch(() => []);
  for (const e of expedientes ?? []) {
    try {
      const [hay] = await sb(`glossa_radar_candidatos?select=id,estado,expediente&clave=eq.${encodeURIComponent(e.clave)}&limit=1`) ?? [];
      if (hay && hay.estado !== 'candidato') continue;   // vetado, a prueba o ya decidido: no se reescribe
      await sb('glossa_radar_candidatos?on_conflict=clave', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([{
          clave: e.clave, nombre: e.citado, tipo: e.tipo,
          temas: e.temas ?? [],
          expediente: { ...(hay?.expediente ?? {}),
                        menciones: { fuentes_distintas: e.fuentes_distintas, total: e.menciones,
                                     citado_por: e.citado_por, primera: e.primera, ultima: e.ultima } },
          updated_at: new Date().toISOString(),
        }]),
      });
    } catch (err) { console.log(`  · expediente ${e.clave}: ${String(err).slice(0, 80)}`); }
  }
  console.log(`  ${expedientes?.length ?? 0} claves con ≥${MENC_MIN} fuentes citándolas.`);

  // 2. Elegibles para el alta: por menciones independientes o por reportaje repetido.
  const candidatos = await sb(`glossa_radar_candidatos?select=*&estado=eq.candidato&order=updated_at.desc&limit=60`) ?? [];
  const elegibles = candidatos.filter(c => {
    const m = c.expediente?.menciones;
    const semanas = new Set((c.expediente?.reportaje ?? []).map(x => x.semana));
    return (m && Number(m.fuentes_distintas) >= MENC_MIN) || semanas.size >= SEM_MIN;
  });
  if (!elegibles.length) { console.log('  Ningún candidato alcanza el umbral todavía.'); }

  // El contexto que ve el comité: el cupo por tema y el historial de las fuentes
  // que ya están, una vez por corrida.
  const fuentesOrg = await sb(`glossa_radar_sources?select=id,name,estado,temas,active,created_at&candidato_id=not.is.null`) ?? [];
  const historial  = await sb('rpc/glossa_radar_historial_fuentes', { method: 'POST', body: '{}' }).catch(() => []);
  const ocupados = {};
  for (const s of fuentesOrg) if (s.active) for (const t of (s.temas ?? [])) ocupados[t] = (ocupados[t] ?? 0) + 1;

  let altas = 0;
  for (const c of elegibles.slice(0, 4)) {
    if (altas >= ALTAS_MAX) { console.log(`  Freno semanal: ya hubo ${ALTAS_MAX} altas.`); break; }

    // Sin feed no hay fuente que sondear. A las personas se les busca el feed
    // igual (muchos tienen Substack o podcast en su homepage); si no aparece,
    // el expediente queda a la vista en el panel y no se convoca al comité.
    let feed = c.feed_url;
    if (!feed && c.homepage) feed = await descubrirFeed(c.homepage);
    if (!feed) {
      await sb(`glossa_radar_candidatos?id=eq.${c.id}`, {
        method: 'PATCH', body: JSON.stringify({
          motivo: 'elegible, pero sin feed detectable: no hay nada que sondear todavía',
          updated_at: new Date().toISOString() }),
      }).catch(() => {});
      console.log(`  · ${c.nombre}: elegible y sin feed — queda en el panel.`);
      continue;
    }

    const temas = (c.temas ?? []).slice(0, 4);
    const lleno = temas.filter(t => (ocupados[t] ?? 0) >= TOPE_TEMA);
    if (temas.length && lleno.length === temas.length) {
      console.log(`  · ${c.nombre}: sus temas están al tope (${lleno.join(', ')}); no se convoca.`);
      continue;
    }

    const contexto = {
      cupo: { tope_por_tema: TOPE_TEMA, ocupacion: Object.fromEntries(temas.map(t => [t, ocupados[t] ?? 0])) },
      historial_fuentes_actuales: (historial ?? []).slice(0, 20),
    };
    const q = preguntaAlta({ nombre: c.nombre, tipo: c.tipo, temas, expediente: c.expediente }, contexto);
    const votos = await Promise.all(COMITE.map(m => votar(m, q)));
    for (const v of votos)
      console.log(`    ${v.casa.padEnd(9)} ${v.error ? 'ERROR: ' + v.error : (v.alta ? 'alta' : 'no') + ' — ' + String(v.razon ?? '').slice(0, 70)}`);
    const validos = votos.filter(v => !v.error);
    const aFavor = validos.filter(v => v.alta === true);
    const admite = validos.length >= 2 && aFavor.length > validos.length / 2;
    const motivo = validos.length < 2
      ? 'menos de dos votos válidos: no hay comité'
      : `${aFavor.length} de ${validos.length} a favor del alta a prueba`;

    if (admite) {
      const puesto = await sb('glossa_radar_sources?on_conflict=feed_url&select=id', {
        method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify([{
          kind: 'rss', name: c.nombre, feed_url: feed, homepage: c.homepage,
          active: true, estado: 'a_prueba', temas, candidato_id: c.id,
          notes: `alta a prueba por el consejo · ${new Date().toISOString().slice(0, 10)}`,
        }]),
      }).catch(err => { console.log(`    ✗ alta: ${String(err).slice(0, 90)}`); return null; });
      const sourceId = puesto?.[0]?.id;
      await sb(`glossa_radar_candidatos?id=eq.${c.id}`, {
        method: 'PATCH', body: JSON.stringify({
          estado: sourceId ? 'a_prueba' : 'candidato', feed_url: feed,
          source_id: sourceId ?? null, motivo, decidido_en: new Date().toISOString(),
          updated_at: new Date().toISOString() }),
      }).catch(() => {});
      if (sourceId) { altas++; for (const t of temas) ocupados[t] = (ocupados[t] ?? 0) + 1; }
      console.log(`    → ${c.nombre} entra A PRUEBA (${temas.join(', ') || 'general'})`);
    } else {
      await sb(`glossa_radar_candidatos?id=eq.${c.id}`, {
        method: 'PATCH', body: JSON.stringify({ motivo, decidido_en: new Date().toISOString(),
                                                updated_at: new Date().toISOString() }),
      }).catch(() => {});
    }
    await registrar({
      convocadoPor: `fuentes_organicas alta: ${c.clave}`, ranura: 'fuentes_organicas',
      evidencia: { candidato: c.clave, expediente: c.expediente, temas, contexto: contexto.cupo },
      pregunta: q, votos, decision: admite ? `alta a prueba: ${c.nombre} (${feed})` : null,
      motivo, aplicado: admite,
    });
  }

  // 3. Las que llevan semanas a prueba reciben veredicto.
  const corte = new Date(Date.now() - PRUEBA_SEM * 7 * 864e5).toISOString();
  const enPrueba = (fuentesOrg ?? []).filter(s => s.estado === 'a_prueba' && s.active && s.created_at < corte);
  for (const s of enPrueba.slice(0, 4)) {
    const suyo = (historial ?? []).find(h => h.source_id === s.id) ?? { comprobadas: 0 };
    const digeridos = await sb(`glossa_radar_items?select=id&source_id=eq.${s.id}&state=eq.digested&limit=500`) ?? [];
    const q = preguntaPrueba(
      { nombre: s.name, temas: s.temas, en_prueba_desde: s.created_at, episodios_digeridos: digeridos.length },
      suyo);
    const votos = await Promise.all(COMITE.map(m => votar(m, q)));
    for (const v of votos)
      console.log(`    ${v.casa.padEnd(9)} ${v.error ? 'ERROR: ' + v.error : String(v.veredicto ?? '?') + ' — ' + String(v.razon ?? '').slice(0, 70)}`);
    const validos = votos.filter(v => !v.error);
    if (validos.length < 2) continue;
    const cuenta = {};
    for (const v of validos) cuenta[v.veredicto] = (cuenta[v.veredicto] ?? 0) + 1;
    const [veredicto, n] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0] ?? ['seguir', 0];
    const decide = n > validos.length / 2 ? veredicto : 'seguir';
    const motivo = `${n} de ${validos.length} por «${decide}»`;

    if (decide === 'confianza') {
      await sb(`glossa_radar_sources?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'confianza' }) });
      await sb(`glossa_radar_candidatos?source_id=eq.${s.id}`, {
        method: 'PATCH', body: JSON.stringify({ estado: 'confianza', motivo, decidido_en: new Date().toISOString(),
                                                updated_at: new Date().toISOString() }) });
    } else if (decide === 'degradar') {
      await sb(`glossa_radar_sources?id=eq.${s.id}`, { method: 'PATCH', body: JSON.stringify({ active: false }) });
      await sb(`glossa_radar_candidatos?source_id=eq.${s.id}`, {
        method: 'PATCH', body: JSON.stringify({ estado: 'degradado', motivo, decidido_en: new Date().toISOString(),
                                                updated_at: new Date().toISOString() }) });
    }
    console.log(`    → ${s.name}: ${decide}`);
    await registrar({
      convocadoPor: `fuentes_organicas veredicto: ${s.name}`, ranura: 'fuentes_organicas',
      evidencia: { source_id: s.id, historial: suyo, en_prueba_desde: s.created_at },
      pregunta: q, votos, decision: decide === 'seguir' ? null : `${decide}: ${s.name}`,
      motivo, aplicado: decide !== 'seguir',
    });
  }
  if (!elegibles.length && !enPrueba.length) console.log('  Nada que decidir esta semana.');
}

// ── Corrida ────────────────────────────────────────────────────────────────
const ajustesRaw = await sb('glossa_radar_settings?select=key,value');
const ajus = Object.fromEntries((ajustesRaw ?? []).map(r => [r.key, r.value]));

await faseCalibracion(ajus);
await faseFuentes(ajus);
