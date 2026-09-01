// La fuente única de las reglas del español — y su contrato.
//
// La lección que motiva este archivo está en LESSONS.md: «una regla escrita en
// un solo sitio es una regla que no rige». Las listas de calcos vivían copiadas
// a mano en prompts_pieza.mjs y prompts_weekly.mjs, y ya habían divergido; la
// tercera copia (la skill) nunca se escribió. Aquí viven UNA vez, como datos, y
// de aquí salen las tres cosas que las necesitan:
//
//   - `bloqueReglas()`   → el texto que los dos prompts interpolan
//   - `revisarEspanol()` → el validador determinista que corre tras cada intento
//   - el bloque REGLAS_ES de skills/references/spanish-translation.md, que
//     `scripts/check_reglas_es.mjs` compara contra esta lista en CI
//
// El validador no sustituye al revisor de modelo: comprueba lo que una máquina
// PUEDE comprobar (calcos concretos, campos en inglés, formato de cifras,
// paridad estructural) y deja la naturalidad al revisor. «El código veta al
// modelo, nunca al revés»: un veredicto de modelo obliga a reintentar, pero
// solo esto aprueba.
//
// Es puro —sin red, sin base— por la misma razón que el fusible: corre en el
// semanal, en la pieza y en cualquier guion de reedición, y los tres tienen que
// dar el mismo veredicto.

// ── Convención de cifras: MEXICANA (decidido por Arturo, 2026-08-31) ──────
// «1,234.56» y «51.7%»: coma de millares, punto decimal, como la prensa
// mexicana y coherente con el registro es-MX de D-020. La skill decía lo
// contrario (peninsular) y las piezas viejas lo siguen — no se reescriben;
// la regla rige para todo lo NUEVO.

export const REGLAS_ES = {
  // Calcos de imagen e idiom — los que de verdad se cuelan. `re` caza el calco
  // en la prosa española; `grave` bloquea y reintenta, lo demás solo avisa.
  // Las regex van acotadas a propósito: «movimiento» a secas es una palabra
  // legítima; el calco es «movimiento» para una decisión o un paso argumental.
  calcos: [
    { en: 'move', mal: 'movimiento (para una decisión o un paso)', bien: 'jugada, gesto, paso, punto de partida',
      re: /\bmovimiento (inicial|de apertura|anal[íi]tico|central|equivocado|m[áa]s tendencioso|de liderazgo)\b|\b(primer|segundo|tercer|[úu]ltimo) movimiento (del?|de la)\b/i,
      grave: true },
    { en: 'claim', mal: 'reclamo / reclamación (por afirmación)', bien: 'afirmación, señalamiento',
      re: /\breclamos? de [a-záéíóú]+(?:idad|ción)\b|\bdebe reclamar\b|\breclamaci[óo]n de indispensabilidad\b/i,
      grave: true },
    { en: 'account', mal: 'cuenta (por relato)', bien: 'relato, versión',
      re: /\bseg[úu]n la cuenta de\b|\bla cuenta del? (autor|columnista|art[íi]culo)\b/i,
      grave: true },
    { en: 'record', mal: 'récord (por expediente)', bien: 'expediente, antecedentes, lo documentado',
      re: /\br[ée]cord (judicial|criminal|p[úu]blico|documental)\b/i,
      grave: true },
    { en: 'to address', mal: 'direccionar', bien: 'atender, abordar',
      re: /\bdireccion(ar|ó|an|ando)\b/i,
      grave: true },
    { en: 'evidence', mal: 'evidencia (por prueba)', bien: 'pruebas, indicios',
      re: /\bla evidencia (sugiere|muestra|indica|apunta)\b/i,
      grave: false },
    { en: 'unaccountable', mal: 'no rendibles', bien: 'que no rinden cuentas',
      re: /\bno rendibles?\b/i,
      grave: true },
    { en: 'at the level of', mal: 'a nivel de', bien: 'en el plano de / en',
      re: /\ba nivel de\b/i,
      grave: true },
    { en: 'implement', mal: 'implementar', bien: 'aplicar, poner en marcha',
      re: /\bimplement(ar|ó|an|ando|ación)\b/i,
      grave: false },
    { en: 'decision-makers', mal: 'decisores', bien: 'quienes deciden, los responsables',
      re: /\bdecisores\b/i,
      grave: true },
    { en: 'parents', mal: 'progenitores', bien: 'padres',
      re: /\bprogenitores\b/i,
      grave: true },
    { en: 'position oneself', mal: 'posicionarse', bien: 'pronunciarse, tomar posición',
      re: /\bposicionarse\b/i,
      grave: false },
    { en: 'based on', mal: 'en base a', bien: 'sobre la base de / a partir de',
      re: /\ben base a\b/i,
      grave: true },
    { en: 'is being + participle', mal: 'está siendo + participio', bien: 'voz activa o «se» impersonal',
      re: /\best(á|án|aba|aban) siendo [a-záéíóúñ]+d[oa]s?\b/i,
      grave: false },
    { en: 'made famous by', mal: 'hecho famoso por', bien: 'al que hizo famoso',
      re: /\bhech[oa] famos[oa] por\b/i,
      grave: false },
    { en: 'book-length', mal: 'de extensión libro', bien: 'de la extensión de un libro',
      re: /\bde extensi[óo]n libro\b/i,
      grave: true },
  ],

  // Léxico que delata registro peninsular. D-020: español de México.
  lexicoMX: [
    { mal: 'vosotros/os/vuestro', re: /\bvosotr[oa]s\b|\bvuestr[oa]s?\b/i, grave: true },
    { mal: 'ordenador', bien: 'computadora', re: /\bordenador(es)?\b/i, grave: true },
    { mal: 'móvil (aparato)', bien: 'celular', re: /\btel[ée]fono m[óo]vil\b|\bsu m[óo]vil\b/i, grave: true },
    { mal: 'coger', re: /\bcog(er|ió|en|iendo)\b/i, grave: true },
    { mal: 'aparcar', bien: 'estacionar', re: /\baparc(ar|ó|an)\b/i, grave: false },
  ],

  formato: {
    // Convención mexicana. Lo que se caza es la PENINSULAR en contenido nuevo.
    decimalPeninsular: /\d,\d+\s*(?:%|por ciento)\b/,
    millaresPeninsulares: /\b\d{1,3}(?:\.\d{3}){1,}(?!\d)(?!,\d)/,
    mesesEN: /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/,
    numeroDeSerie: /N°\s/,          // la edición española escribe «N.º »
  },
};

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «31 de agosto de 2026», en la zona horaria editorial. */
export function formatearFechaES(fecha, tz = 'America/Los_Angeles') {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const partes = new Intl.DateTimeFormat('en-CA',
    { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' })
    .format(d).split('-').map(Number);           // en-CA da YYYY-MM-DD estable
  return `${partes[2]} de ${MESES_ES[partes[1] - 1]} de ${partes[0]}`;
}

/**
 * El texto de reglas que los prompts interpolan. UNA redacción para las dos
 * superficies: si alguna vez necesitan divergir, que sea aquí y con motivo.
 */
export function bloqueReglas() {
  const calcos = REGLAS_ES.calcos
    .filter(c => c.bien)
    .map(c => `      ${c.en} → ${c.bien} (nunca «${c.mal.split(' (')[0]}»)`)
    .join('\n');
  return [
    '- **NADA DE CALCOS DE IMAGEN NI DE IDIOM**, que es donde esto falla de',
    '  verdad. Una pieza publicada decía «Es el movimiento inicial de la columna,',
    '  y es el movimiento de un padre antes que el de un político»: cada palabra',
    '  correcta, la frase ilegible, porque «move» viajó como «movimiento». Debía',
    '  ser «Es el punto de partida de la columna, pero antes que un cálculo',
    '  político, es un gesto de padre». Los que más se escapan:',
    calcos,
    '',
    '- Tampoco calcos burocráticos: «aplicar», nunca «implementar»; «quienes',
    '  deciden», nunca «decisores»; «padres», nunca «progenitores»; «en el plano',
    '  de» o «en», nunca «a nivel de». Y nada de «estar siendo + participio»:',
    '  voz activa o «se» impersonal.',
    '',
    '- **Español de México** (D-020): nada de «vosotros», «coger», «vale»,',
    '  «ordenador» ni «móvil»; «computadora», «celular»; el registro sobrio de un',
    '  diario mexicano — Letras Libres, Nexos —, ni coloquial ni acartonado.',
    '',
    '- **CIFRAS a la mexicana**: coma de millares y punto decimal — «1,234.56»,',
    '  «51.7%» —, como la prensa mexicana. Nunca «51,7 por ciento» ni «160.000».',
    '  Para las cifras grandes, mejor la palabra: «160 mil millones de dólares».',
    '',
    '- **LAS CIFRAS GRANDES LLEVAN SU EQUIVALENTE INGLÉS ENTRE PARÉNTESIS** la',
    '  primera vez que aparecen. «billion» y «billón» son falsos amigos:',
    '      $130 billion → 130 mil millones de dólares (130 billion)',
    '      $5 trillion  → 5 billones de dólares (5 trillion)',
    '      900 million  → 900 millones (sin paréntesis: la escala no cambia)',
    '  Solo la primera vez, y solo cuando la palabra de escala cambia.',
    '',
    '- Las fechas, a la española: «31 de agosto de 2026», meses en minúscula,',
    '  nunca «17 May 2026» ni «31 mayo 2026».',
    '',
    '- Sin adjetivos de valoración que no estén en el original: si el inglés dice',
    '  «said», el español dice «dijo», no «admitió». Subir la temperatura es',
    '  cambiar lo que se afirma.',
    '',
    '- Los cargos y las instituciones, en español cuando exista un uso asentado',
    '  («Secretario del Tesoro»); en su idioma cuando no lo haya. Topónimos con',
    '  forma española asentada, en español: Pekín, Teherán, Moscú, Nueva York.',
    '  Los nombres de operaciones militares se quedan en inglés y en cursiva.',
    '',
    '- El «tú» genérico del inglés no viaja: se recompone con el «se» impersonal',
    '  («se puede ver cómo…») o se reescribe. Ni «tú», ni «usted», ni «ustedes»',
    '  para dirigirse al lector.',
  ].join('\n');
}

// ── Extracción: las dos formas que produce la casa ────────────────────────
// El semanal: {headline, standfirst, closing, pieces:[{subject,title,dek,body}]}.
// La pieza:   {title, dek, coverDek, lede, sections:[{standfirst, blocks:[{md}]}]}.

function esSemanal(obj) { return Array.isArray(obj?.pieces); }

/** [nombre, texto] de cada campo del escaparate — lo que se ve fuera del cuerpo. */
function camposVisibles(obj) {
  const out = [];
  const mete = (nombre, v) => { if (v && String(v).trim()) out.push([nombre, String(v)]); };
  if (esSemanal(obj)) {
    mete('headline', obj.headline);
    mete('standfirst', obj.standfirst);
    for (const [i, p] of (obj.pieces ?? []).entries()) {
      mete(`pieza ${i + 1} · subject`, p.subject);
      mete(`pieza ${i + 1} · title`, p.title);
      mete(`pieza ${i + 1} · dek`, p.dek);
    }
  } else {
    for (const campo of ['title', 'dek', 'dekHTML', 'coverDek', 'source'])
      mete(campo, obj?.[campo]);
    for (const s of obj?.sections ?? []) {
      mete(`sección ${s.number} · título`, s.title);
      for (const b of s.blocks ?? [])
        if (b.type === 'context') mete(`caja «${String(b.label ?? '').slice(0, 30)}»`, b.label);
    }
  }
  return out;
}

/** Toda la prosa que el lector lee, como una lista de trozos. */
function prosaVisible(obj) {
  if (esSemanal(obj)) {
    return [obj.headline, obj.standfirst, obj.colophon, ...(obj.closing ?? []),
      ...(obj.pieces ?? []).flatMap(p => [p.title, p.dek, p.body, p.sources_note])]
      .filter(Boolean).map(String);
  }
  const trozos = [obj?.title, obj?.dek, obj?.coverDek, obj?.lede];
  for (const s of obj?.sections ?? []) {
    trozos.push(s.title, s.standfirst);
    for (const b of s.blocks ?? []) trozos.push(b.label, b.md ?? b.text);
  }
  return trozos.filter(Boolean).map(String);
}

const palabras = (t) => String(t).split(/\s+/).filter(Boolean).length;
const sinMarcas = (t) => String(t).replace(/<[^>]+>/g, ' ');

// Un campo del escaparate en inglés se reconoce por sus palabras función: dos o
// más y por encima de las españolas es inglés, no un préstamo suelto. Los
// arranques cortos del campo `source` («Based on Financial Times reporting»)
// no llegan a dos palabras función, así que se reconocen por la fórmula.
const ARRANQUES_EN = /^(based on|an? (conversation|interview|lecture) with|reporting by|filings in)\b/i;
const STOP_EN = /\b(the|of|and|with|that|from|this|what|who|how|why|when|where|which|is|are|was|were|has|have|for|not|but|its|their)\b/gi;
const STOP_ES = /\b(el|la|los|las|de|del|que|en|con|por|una|un|para|es|no|se|su|sus|al|lo|como|más|pero|ya|le)\b/gi;
export function pareceIngles(texto) {
  const t = sinMarcas(texto);
  const en = (t.match(STOP_EN) ?? []).length;
  const es = (t.match(STOP_ES) ?? []).length;
  return en >= 2 && en > es;
}

/** Los tipos de bloque de una pieza, aplanados en orden, para comparar EN↔ES. */
function esqueleto(obj) {
  if (esSemanal(obj)) return (obj.pieces ?? []).map(() => 'pieza');
  return (obj?.sections ?? []).flatMap(s => (s.blocks ?? []).map(b => b.type ?? '?'));
}

const cuentaSpans = (textos) => textos.reduce((n, t) =>
  n + (String(t).match(/<span class="(?:doc|attr|said)">/g) ?? []).length, 0);

/**
 * El contrato del español. `es` y `en` con la misma forma (semanal o pieza);
 * `en` puede faltar y entonces solo corren las reglas que no comparan.
 *
 * @returns {{ok:boolean, fallos:Array<{regla,detalle,grave}>}}
 */
export function revisarEspanol(es, en = null) {
  const fallos = [];
  const falla = (regla, detalle, grave = true) => fallos.push({ regla, detalle, grave });

  const campos = camposVisibles(es);
  const prosa = prosaVisible(es);
  const todo = prosa.join('\n');

  // ── 1. Nada visible se queda en inglés ─────────────────────────────────
  for (const [nombre, texto] of campos) {
    if (/^(what|who|how|why|when|where|which)\b/i.test(texto.trim()) || ARRANQUES_EN.test(texto.trim())) {
      falla('campo en inglés', `${nombre} conserva su forma inglesa: «${texto.slice(0, 60)}»`);
    } else if (pareceIngles(texto)) {
      falla('campo en inglés', `${nombre} parece estar en inglés: «${texto.slice(0, 60)}»`);
    }
  }
  if (REGLAS_ES.formato.mesesEN.test(sinMarcas(todo))) {
    const m = sinMarcas(todo).match(REGLAS_ES.formato.mesesEN);
    falla('mes en inglés', `aparece «${m[0]}» donde debía ir el mes en español`);
  }

  // ── 2. Calcos y léxico ─────────────────────────────────────────────────
  for (const c of [...REGLAS_ES.calcos, ...REGLAS_ES.lexicoMX]) {
    const m = sinMarcas(todo).match(c.re);
    if (m) {
      const i = sinMarcas(todo).indexOf(m[0]);
      const contexto = sinMarcas(todo).slice(Math.max(0, i - 30), i + m[0].length + 30).replace(/\s+/g, ' ');
      falla(c.en ? 'calco' : 'registro',
        `«${m[0]}» (${c.bien ? `mejor: ${c.bien}` : c.mal}) — …${contexto}…`, c.grave);
    }
  }

  // ── 3. Cifras a la mexicana ────────────────────────────────────────────
  const sinCitas = sinMarcas(todo).replace(/«[^»]*»/g, ' ');  // una cita cita lo que dijo
  if (REGLAS_ES.formato.decimalPeninsular.test(sinCitas)) {
    const m = sinCitas.match(REGLAS_ES.formato.decimalPeninsular);
    falla('formato de cifra', `«${m[0]}» usa la coma decimal peninsular; la convención es la mexicana («51.7%»)`);
  }
  if (REGLAS_ES.formato.millaresPeninsulares.test(sinCitas)) {
    const m = sinCitas.match(REGLAS_ES.formato.millaresPeninsulares);
    falla('formato de cifra', `«${m[0]}» separa millares con punto; la convención es la mexicana («1,234») o la palabra («mil millones»)`, false);
  }
  if (REGLAS_ES.formato.numeroDeSerie.test(todo)) {
    falla('formato', 'aparece «N° » — la edición española escribe «N.º »', false);
  }

  // ── 4. El paréntesis del billion, contra el original ───────────────────
  if (en) {
    const prosaEN = prosaVisible(en).join('\n');
    for (const escala of ['billion', 'trillion']) {
      const reEN = new RegExp(`\\b${escala}s?\\b`, 'i');
      if (reEN.test(prosaEN)) {
        const conParentesis = new RegExp(`\\([^)]*\\b${escala}\\b[^)]*\\)`, 'i');
        if (!conParentesis.test(todo)) {
          falla('cifra sin equivalente',
            `el original dice «${escala}» y el español no lleva el paréntesis «(… ${escala})» en su primera aparición`);
        }
      }
    }
  }

  // ── 5. Paridad estructural con el original ─────────────────────────────
  if (en) {
    const eEs = esqueleto(es), eEn = esqueleto(en);
    if (eEs.length !== eEn.length || eEs.some((t, i) => t !== eEn[i])) {
      falla('estructura divergente',
        `el español trae ${eEs.length} bloques [${eEs.join(',').slice(0, 80)}] y el original ${eEn.length} [${eEn.join(',').slice(0, 80)}]`);
    }
    const sEs = cuentaSpans(prosa), sEn = cuentaSpans(prosaVisible(en));
    if (sEs !== sEn) {
      falla('marcas perdidas', `el original lleva ${sEn} marcas doc/attr/said y el español ${sEs}: cada afirmación conserva su marca`);
    }
    // La edición corre un 15-20% más larga; igual o más corta significa recorte.
    const pEs = prosa.reduce((n, t) => n + palabras(sinMarcas(t)), 0);
    const pEn = prosaVisible(en).reduce((n, t) => n + palabras(sinMarcas(t)), 0);
    if (pEn > 200) {
      const ratio = pEs / pEn;
      if (ratio < 0.95) {
        falla('edición recortada',
          `el español trae ${pEs} palabras contra ${pEn} del original (ratio ${ratio.toFixed(2)}); debería correr un 15-20% más largo — algo se perdió`);
      } else if (ratio < 1.02 || ratio > 1.5) {
        falla('extensión sospechosa', `ratio ES/EN ${ratio.toFixed(2)} (lo sano es 1.05–1.30)`, false);
      }
    }
  }

  // ── 6. Spans bien formados (el renderizador los descarta en silencio) ──
  for (const t of prosa) {
    const abre = (String(t).match(/<span class="(?:doc|attr|said)">/g) ?? []).length;
    const cierra = (String(t).match(/<\/span>/g) ?? []).length;
    if (abre !== cierra) falla('aparato mal formado', `${abre} marcas abiertas y ${cierra} cerradas`);
  }

  // ── 7. Respiración ─────────────────────────────────────────────────────
  const frases = sinMarcas(todo).split(/(?<=[.!?…])\s+/).filter(f => f.trim().length > 25);
  const largas = frases.filter(f => palabras(f) > 40);
  if (largas.length) {
    falla('frase larga', `${largas.length} frase(s) por encima de 40 palabras; la primera: «${largas[0].slice(0, 90)}…»`, false);
  }

  return { ok: !fallos.some(f => f.grave), fallos };
}
