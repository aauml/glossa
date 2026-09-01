// revisor_es.mjs — la edición española que se corrige a sí misma.
//
// Antes había dos cascadas de traducción y ninguna aprendía de sus fallos: la
// de la pieza se quedaba con el PRIMER modelo que no lanzara excepción (sin
// mirar el resultado), y la del semanal sí miraba, pero cambiaba de modelo sin
// decirle al que falló QUÉ falló. Aquí vive una sola cascada con el bucle
// completo:
//
//   1. intento → validador determinista (`comprobar`, que el llamador arma con
//      revisarEspanol + lo suyo);
//   2. fallos graves → REINTENTO AL MISMO MODELO con los fallos dichos (la
//      fórmula que el contrato inglés de la pieza ya usaba);
//   3. sigue grave → siguiente modelo de la cascada;
//   4. cuando el determinista pasa, el REVISOR (Kimi) dictamina — calcos que
//      una regex no caza, concordancias, registro— y si dice «corrige», una
//      última vuelta al mismo traductor con esos fallos, revalidada.
//
// «El código veta al modelo, nunca al revés»: el veredicto de Kimi obliga a
// reintentar, pero solo el determinista aprueba. Y el revisor DICTAMINA, no
// reescribe — usar su texto directamente saltaría el contrato entero.
//
// Env: GEMINI_API_KEY / XAI_API_KEY / ANTHROPIC_API_KEY (cascada; basta uno),
//      MOONSHOT_API_KEY (revisor; sin ella se publica con solo el determinista),
//      REVISOR_DRY=1 (imprime el prompt del revisor y simula «publica»).

import { request as httpsRequest } from 'node:https';

// La cascada, por orden de DESPERDICIO medido (ver traducir_from_supabase.mjs):
// un modelo de razonamiento traduciendo es dinero quemado en pensar.
export const TRADUCTORES = [
  { n: 'gemini-3.1-flash-lite',        casa: 'gemini',    env: 'GEMINI_API_KEY' },
  { n: 'grok-4.20-0309-non-reasoning', casa: 'xai',       env: 'XAI_API_KEY' },
  { n: 'claude-haiku-4-5-20251001',    casa: 'anthropic', env: 'ANTHROPIC_API_KEY' },
];

const MODELO_REVISOR = process.env.REVISOR_MODEL || 'kimi-k3';
const SIN_SALDO = /insufficient balance|exceeded_current_quota|suspended|billing/i;

/** El primer objeto JSON completo: algunos modelos añaden texto después. */
export function jsonDeModelo(txt) {
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
  throw new SyntaxError('objeto sin cerrar — la respuesta se truncó');
}

/** Una llamada a un traductor de la cascada. Devuelve {es, tok, coste, casa}. */
export async function traducirCon(m, prompt) {
  if (m.casa === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m.n}:generateContent`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32000 } }),
        signal: AbortSignal.timeout(300_000) });
    const d = await r.json();
    if (!r.ok) throw new Error(`gemini ${r.status}: ${JSON.stringify(d).slice(0, 120)}`);
    return { es: jsonDeModelo((d.candidates?.[0]?.content?.parts ?? []).map(x => x.text || '').join('')),
             tok: d.usageMetadata?.totalTokenCount ?? 0, coste: 0, casa: 'gemini' };
  }
  if (m.casa === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages',
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY,
                                   'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: m.n, max_tokens: 32000, messages: [{ role: 'user', content: prompt }] }),
        signal: AbortSignal.timeout(300_000) });
    const d = await r.json();
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${JSON.stringify(d).slice(0, 120)}`);
    const u = d.usage ?? {};
    return { es: jsonDeModelo((d.content ?? []).map(x => x.text || '').join('')),
             tok: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
             coste: ((u.input_tokens ?? 0) / 1e6) * 1.0 + ((u.output_tokens ?? 0) / 1e6) * 5.0, casa: 'anthropic' };
  }
  const r = await fetch('https://api.x.ai/v1/chat/completions',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify({ model: m.n, max_tokens: 32000, messages: [{ role: 'user', content: prompt }] }),
      signal: AbortSignal.timeout(300_000) });
  const d = await r.json();
  if (!r.ok) throw new Error(`xai ${r.status}: ${JSON.stringify(d).slice(0, 120)}`);
  const u = d.usage ?? {};
  return { es: jsonDeModelo(d.choices?.[0]?.message?.content ?? ''),
           tok: u.total_tokens ?? 0,
           coste: ((u.prompt_tokens ?? 0) / 1e6) * 0.20 + ((u.completion_tokens ?? 0) / 1e6) * 0.50, casa: 'xai' };
}

// Por `node:https` y no por fetch: el fetch de Node corta a los 5 minutos de
// esperar cabeceras y ese límite no lo controla AbortSignal (lección de la
// pieza). Un dictamen es corto, pero la cuenta admite una petición a la vez y
// puede hacer cola detrás de una escritura larga.
function kimiCrudo(cuerpo) {
  return new Promise((ok, ko) => {
    const req = httpsRequest({
      hostname: 'api.moonshot.ai', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cuerpo),
                 Authorization: `Bearer ${process.env.MOONSHOT_API_KEY}` },
    }, res => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', c => { b += c; });
      res.on('end', () => (res.statusCode < 300 ? ok(b)
        : ko(Object.assign(new Error(`moonshot ${res.statusCode}: ${b.slice(0, 300)}`),
                           { status: res.statusCode }))));
    });
    req.on('error', ko);
    req.setTimeout(15 * 60_000, () => req.destroy(new Error('kimi sin respuesta en 15 min')));
    req.end(cuerpo);
  });
}

function promptRevisor(es, en) {
  return [
    'Eres el corrector de estilo de una publicación en español de México',
    '(registro Letras Libres / Nexos: editorial, sobrio, vivo). Te llegan dos',
    'ediciones del mismo material: la original en inglés y la española. La',
    'española es una EDICIÓN con libertad de forma —puede recomponer, reordenar,',
    'glosar— pero ninguna en los hechos.',
    '',
    'NO reescribas nada. DICTAMINA. Devuelve SOLO JSON:',
    '{"veredicto":"publica"|"corrige",',
    ' "fallos":[{"donde":"campo o primeras palabras del pasaje",',
    '            "que":"qué está mal, concreto",',
    '            "como_deberia":"cómo debería decirse"}]}',
    '',
    'Busca EXACTAMENTE esto, en orden de gravedad:',
    '1. Frases que delatan que se escribieron primero en inglés: calcos de',
    '   imagen o de idiom («tómese al valor que él le da», «movimiento analítico»,',
    '   «voluntaria oscuridad»), sintaxis inglesa con palabras españolas, pasiva',
    '   calcada («está siendo preparada»).',
    '2. Gramática rota: concordancias («los agencias»), subjuntivos indebidos,',
    '   comparativos imposibles.',
    '3. Pérdida de matiz frente al original: una glosa amputada, un rango',
    '   convertido en cifra, una precisión de fuente que desapareció.',
    '4. Registro inconsistente: mezclar tú/usted/ustedes, peninsular donde debe',
    '   ser mexicano, burocratismos («implementar», «decisores»).',
    '5. Adjetivos de valoración que el original no trae.',
    '',
    'Si la edición se sostiene, veredicto «publica» con fallos vacíos o menores.',
    '«Corrige» SOLO si hay fallos que un corrector humano no dejaría pasar.',
    'Máximo 12 fallos, los peores primero.',
    '',
    'ORIGINAL (inglés):', JSON.stringify(en),
    '', 'EDICIÓN ESPAÑOLA:', JSON.stringify(es),
  ].join('\n');
}

/**
 * El dictamen de Kimi. Devuelve {veredicto, fallos, tok, coste} o null si no
 * hay clave, no hay saldo o el dictamen mismo falla — el revisor nunca tumba
 * una publicación por su propia ausencia.
 */
export async function revisorKimi(es, en, { log = console.log } = {}) {
  if (!process.env.MOONSHOT_API_KEY) { log('  revisor: sin MOONSHOT_API_KEY — se salta'); return null; }
  const prompt = promptRevisor(es, en);
  if (process.env.REVISOR_DRY === '1') {
    log(`  REVISOR_DRY · prompt de ${prompt.length} caracteres — se simula «publica»`);
    return { veredicto: 'publica', fallos: [], tok: 0, coste: 0, dry: true };
  }
  const cuerpo = JSON.stringify({ model: MODELO_REVISOR, max_tokens: 4096, temperature: 0.2,
    messages: [{ role: 'user', content: prompt }] });
  for (let intento = 0; ; intento++) {
    let bruto;
    try { bruto = await kimiCrudo(cuerpo); }
    catch (e) {
      if (SIN_SALDO.test(String(e.message))) { log('  revisor: la cuenta de moonshot no tiene saldo — se salta'); return null; }
      if ((e.status === 429 || e.status === 503) && intento < 3) {
        const espera = [60, 180, 420][intento] * 1000;
        log(`  revisor ${e.status} — reintento en ${espera / 60000} min`);
        await new Promise(x => setTimeout(x, espera)); continue;
      }
      log(`  revisor no pudo: ${String(e.message).slice(0, 90)} — se publica con solo el determinista`);
      return null;
    }
    let d;
    try { d = JSON.parse(bruto); } catch { log('  revisor: respuesta ilegible — se salta'); return null; }
    const u = d.usage ?? {};
    let dictamen;
    try { dictamen = jsonDeModelo(d.choices?.[0]?.message?.content ?? ''); }
    catch { log('  revisor: dictamen ilegible — se salta'); return null; }
    return { veredicto: dictamen.veredicto === 'corrige' ? 'corrige' : 'publica',
             fallos: Array.isArray(dictamen.fallos) ? dictamen.fallos.slice(0, 12) : [],
             tok: u.total_tokens ?? 0, coste: ((u.total_tokens ?? 0) / 1e6) * 2.2 };
  }
}

const dichoDeterminista = (fallos) =>
  '\n\nTU INTENTO ANTERIOR INCUMPLIÓ EL CONTRATO DEL ESPAÑOL — corrige EXACTAMENTE esto y devuelve el JSON completo:\n' +
  fallos.map(f => `- ${f.regla}: ${f.detalle}`).join('\n');

const dichoRevisor = (fallos) =>
  '\n\nEL CORRECTOR DE ESTILO SEÑALÓ ESTOS FALLOS en tu intento anterior — corrígelos y devuelve el JSON completo:\n' +
  fallos.map(f => `- ${f.donde}: ${f.que} → ${f.como_deberia}`).join('\n');

/**
 * La cascada completa: traduce, comprueba, reintenta con el fallo dicho, y
 * cuando el determinista pasa deja dictaminar al revisor.
 *
 * @param prompt     el prompt base de la edición española
 * @param comprobar  (es) => {ok, fallos} — el determinista del llamador
 *                   (revisarEspanol + lo suyo). Solo los `grave` bloquean.
 * @param opts       { en:            el original, para el revisor
 *                     apuntar:       async (casa, llamadas, tok, coste) — contabilidad
 *                     conRevisor:    () => bool — hay saldo y ganas (default true)
 *                     log }
 * @returns { es, veredicto: {deterministico, revisor, intentos}, gastado }
 *          o null si toda la cascada agotó sus intentos.
 */
export async function edicionValidada(prompt, comprobar, opts = {}) {
  const { en = null, apuntar = async () => {}, conRevisor = () => true, log = console.log } = opts;
  const intentos = [];
  let gastado = 0;

  for (const m of TRADUCTORES) {
    if (m.env && !process.env[m.env]) continue;

    let promptVigente = prompt;
    let r = null, v = null;
    // Dos vueltas deterministas por modelo: el intento y su corrección dicha.
    for (let vuelta = 0; vuelta < 2; vuelta++) {
      const t0 = Date.now();
      try { r = await traducirCon(m, promptVigente); }
      catch (e) {
        log(`  ${m.n}: ${String(e.message).slice(0, 90)}`);
        intentos.push({ modelo: m.n, error: String(e.message).slice(0, 120) });
        r = null; break;
      }
      gastado += r.coste;
      await apuntar(r.casa, 1, r.tok, r.coste);
      v = comprobar(r.es);
      const graves = v.fallos.filter(f => f.grave);
      log(`  ${m.n.padEnd(30)} ${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s · ` +
        `${String(r.tok).padStart(6)} tok · $${r.coste.toFixed(4)} · ` +
        (graves.length ? `✗ ${graves.map(f => f.regla).join(', ').slice(0, 70)}` : '✓ contrato limpio'));
      intentos.push({ modelo: m.n, fallos_graves: graves.map(f => f.regla) });
      if (!graves.length) break;
      for (const f of graves.slice(0, 3)) log(`      ${String(f.detalle).slice(0, 88)}`);
      if (vuelta === 0) { log('      — reintento al mismo modelo con el fallo dicho'); promptVigente = prompt + dichoDeterminista(graves); }
      else r = null;   // dos vueltas y sigue grave: siguiente modelo
    }
    if (!r) continue;

    // ── El dictamen, una sola vuelta por modelo ──────────────────────────
    let revisor = null;
    if (conRevisor()) {
      revisor = await revisorKimi(r.es, en ?? {}, { log });
      if (revisor) gastado += revisor.coste;
      if (revisor?.coste) await apuntar('moonshot', 1, revisor.tok, revisor.coste);
      if (revisor?.veredicto === 'corrige' && revisor.fallos.length) {
        log(`  revisor: corrige (${revisor.fallos.length} fallos) — última vuelta al traductor`);
        for (const f of revisor.fallos.slice(0, 3)) log(`      ${String(f.donde).slice(0, 30)}: ${String(f.que).slice(0, 60)}`);
        try {
          const r2 = await traducirCon(m, prompt + dichoRevisor(revisor.fallos));
          gastado += r2.coste;
          await apuntar(r2.casa, 1, r2.tok, r2.coste);
          const v2 = comprobar(r2.es);
          if (!v2.fallos.some(f => f.grave)) { r = r2; v = v2; }
          else log('  la corrección del revisor rompió el determinista — se queda la vuelta anterior');
        } catch (e) { log(`  la vuelta del revisor no pudo: ${String(e.message).slice(0, 80)} — se queda la anterior`); }
      }
    }

    return { es: r.es, gastado,
      veredicto: { deterministico: v, revisor: revisor && { veredicto: revisor.veredicto, fallos: revisor.fallos, dry: revisor.dry }, intentos } };
  }

  log(`  cascada agotada ($${gastado.toFixed(4)}) — nadie cumplió el contrato`);
  return null;
}
