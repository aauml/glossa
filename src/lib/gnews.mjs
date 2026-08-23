// ── Google News RSS: la anchura, gratis ──────────────────────────────────
//
// Devuelve titular, medio, país y fecha. NO devuelve el texto: el enlace va
// cifrado (`/rss/articles/CBMi…`) y decodificarlo por batchexecute contesta 400
// — probado el 2026-08-23, junto con Gemini-con-búsqueda (fuera del tramo
// gratuito) y DuckDuckGo (cero resultados a un robot). Tavily sigue siendo la
// única vía al texto.
//
// Eso fija para qué sirve esto y para qué no. **No es una fuente citable**: es
// el censo de quién cubrió un asunto y desde dónde. Y por eso mismo es lo que
// decide dónde vale la pena gastar una búsqueda de pago: si cuarenta medios de
// cinco países titulan lo mismo, el asunto está establecido y comprarlo otra vez
// no compra nada. Donde los titulares se separan, ahí sí.
//
// Sin clave, sin cupo y sin cuenta. El coste de una consulta es medio segundo.

export const LOCALES = {
  US: { hl: 'en-US',  gl: 'US', ceid: 'US:en',     lang: 'en' },
  GB: { hl: 'en-GB',  gl: 'GB', ceid: 'GB:en',     lang: 'en' },
  CA: { hl: 'en-CA',  gl: 'CA', ceid: 'CA:en',     lang: 'en' },
  AU: { hl: 'en-AU',  gl: 'AU', ceid: 'AU:en',     lang: 'en' },
  IN: { hl: 'en-IN',  gl: 'IN', ceid: 'IN:en',     lang: 'en' },
  IE: { hl: 'en-IE',  gl: 'IE', ceid: 'IE:en',     lang: 'en' },
  ZA: { hl: 'en-ZA',  gl: 'ZA', ceid: 'ZA:en',     lang: 'en' },
  NG: { hl: 'en-NG',  gl: 'NG', ceid: 'NG:en',     lang: 'en' },
  PK: { hl: 'en-PK',  gl: 'PK', ceid: 'PK:en',     lang: 'en' },
  IL: { hl: 'en-IL',  gl: 'IL', ceid: 'IL:en',     lang: 'en' },
  MX: { hl: 'es-419', gl: 'MX', ceid: 'MX:es-419', lang: 'es' },
  ES: { hl: 'es',     gl: 'ES', ceid: 'ES:es',     lang: 'es' },
  AR: { hl: 'es-419', gl: 'AR', ceid: 'AR:es-419', lang: 'es' },
  CO: { hl: 'es-419', gl: 'CO', ceid: 'CO:es-419', lang: 'es' },
  CL: { hl: 'es-419', gl: 'CL', ceid: 'CL:es-419', lang: 'es' },
  BR: { hl: 'pt-BR',  gl: 'BR', ceid: 'BR:pt-419', lang: 'pt' },
  PT: { hl: 'pt-PT',  gl: 'PT', ceid: 'PT:pt-150', lang: 'pt' },
  FR: { hl: 'fr',     gl: 'FR', ceid: 'FR:fr',     lang: 'fr' },
  BE: { hl: 'fr',     gl: 'BE', ceid: 'BE:fr',     lang: 'fr' },
  DE: { hl: 'de',     gl: 'DE', ceid: 'DE:de',     lang: 'de' },
  AT: { hl: 'de',     gl: 'AT', ceid: 'AT:de',     lang: 'de' },
  CH: { hl: 'de',     gl: 'CH', ceid: 'CH:de',     lang: 'de' },
  IT: { hl: 'it',     gl: 'IT', ceid: 'IT:it',     lang: 'it' },
  NL: { hl: 'nl',     gl: 'NL', ceid: 'NL:nl',     lang: 'nl' },
  PL: { hl: 'pl',     gl: 'PL', ceid: 'PL:pl',     lang: 'pl' },
  SE: { hl: 'sv',     gl: 'SE', ceid: 'SE:sv',     lang: 'sv' },
  NO: { hl: 'no',     gl: 'NO', ceid: 'NO:no',     lang: 'no' },
  GR: { hl: 'el',     gl: 'GR', ceid: 'GR:el',     lang: 'el' },
  TR: { hl: 'tr',     gl: 'TR', ceid: 'TR:tr',     lang: 'tr' },
  RU: { hl: 'ru',     gl: 'RU', ceid: 'RU:ru',     lang: 'ru' },
  UA: { hl: 'uk',     gl: 'UA', ceid: 'UA:uk',     lang: 'uk' },
  JP: { hl: 'ja',     gl: 'JP', ceid: 'JP:ja',     lang: 'ja' },
  KR: { hl: 'ko',     gl: 'KR', ceid: 'KR:ko',     lang: 'ko' },
  TW: { hl: 'zh-TW',  gl: 'TW', ceid: 'TW:zh-Hant',lang: 'zh' },
  ID: { hl: 'id',     gl: 'ID', ceid: 'ID:id',     lang: 'id' },
  TH: { hl: 'th',     gl: 'TH', ceid: 'TH:th',     lang: 'th' },
  VN: { hl: 'vi',     gl: 'VN', ceid: 'VN:vi',     lang: 'vi' },
  PH: { hl: 'en-PH',  gl: 'PH', ceid: 'PH:en',     lang: 'en' },
  EG: { hl: 'ar',     gl: 'EG', ceid: 'EG:ar',     lang: 'ar' },
  SA: { hl: 'ar',     gl: 'SA', ceid: 'SA:ar',     lang: 'ar' },
  AE: { hl: 'ar',     gl: 'AE', ceid: 'AE:ar',     lang: 'ar' },
  LB: { hl: 'ar',     gl: 'LB', ceid: 'LB:ar',     lang: 'ar' },
  KE: { hl: 'en-KE',  gl: 'KE', ceid: 'KE:en',     lang: 'en' },
  IR: { hl: 'fa',     gl: 'IR', ceid: 'IR:fa',     lang: 'fa' },
  IQ: { hl: 'ar',     gl: 'IQ', ceid: 'IQ:ar',     lang: 'ar' },
  OM: { hl: 'ar',     gl: 'OM', ceid: 'OM:ar',     lang: 'ar' },
  QA: { hl: 'ar',     gl: 'QA', ceid: 'QA:ar',     lang: 'ar' },
  KW: { hl: 'ar',     gl: 'KW', ceid: 'KW:ar',     lang: 'ar' },
  MA: { hl: 'ar',     gl: 'MA', ceid: 'MA:ar',     lang: 'ar' },
  BD: { hl: 'bn',     gl: 'BD', ceid: 'BD:bn',     lang: 'bn' },
  MY: { hl: 'en-MY',  gl: 'MY', ceid: 'MY:en',     lang: 'en' },
  SG: { hl: 'en-SG',  gl: 'SG', ceid: 'SG:en',     lang: 'en' },
  HK: { hl: 'zh-HK',  gl: 'HK', ceid: 'HK:zh-Hant',lang: 'zh' },
  CZ: { hl: 'cs',     gl: 'CZ', ceid: 'CZ:cs',     lang: 'cs' },
  RO: { hl: 'ro',     gl: 'RO', ceid: 'RO:ro',     lang: 'ro' },
  HU: { hl: 'hu',     gl: 'HU', ceid: 'HU:hu',     lang: 'hu' },
  FI: { hl: 'fi',     gl: 'FI', ceid: 'FI:fi',     lang: 'fi' },
  DK: { hl: 'da',     gl: 'DK', ceid: 'DK:da',     lang: 'da' },
};

// Los cuatro de oficio: uno anglosajón de cada orilla, el hispano que esta
// publicación lee y uno continental. Van SIEMPRE, aunque el tema no los pida —
// son el suelo contra el que se mide si un asunto salió de su país o no.
export const BASE = ['US', 'GB', 'MX', 'FR'];

const desentidad = (s) => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&(amp|lt|gt|quot|apos|#39);/g,
    (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" }[e]))
  .replace(/\s+/g, ' ').trim();

const et = (b, t) => desentidad((b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`)) || [])[1] || '');

/**
 * Google News quiere DOS O TRES palabras, no frases ni listas de cinco.
 *
 * Es un índice de noticias y hace Y lógico con todos los términos: una consulta
 * de doce palabras —que es lo que Tavily quiere y lo que el modelo propone— casa
 * con cero notas. Y cinco tampoco valen: «Hormuz Strait traffic volume cargo»
 * exige las cinco palabras en un mismo titular, y ningún titular las tiene.
 * Medido el 2026-08-23: «sanciones Irán Trump» —tres— devolvió 100 notas de 55
 * medios; las de cinco del modelo, cero.
 *
 * Esto es solo la red: lo normal es que el modelo devuelva `terms` ya cortos.
 * Lo que se conserva son los nombres propios, las cifras y las siglas, que
 * además es lo único que cruza idiomas: «Trump Iran Hormuz» encuentra a Le
 * Parisien igual que a la CBS, y por eso una sola consulta corta sirve para
 * barrer los cuarenta y tres países sin traducirla.
 */
export function consultaCorta(q, max = 3) {
  const palabras = String(q || '').split(/[\s,;|]+/).filter(Boolean);
  const fuertes = palabras.filter((w, i) => {
    const limpia = w.replace(/[^\p{L}\p{N}.-]/gu, '');
    if (limpia.length < 2) return false;
    if (/^\d/.test(limpia)) return true;                    // cifras y años
    if (/^[\p{Lu}]{2,}$/u.test(limpia)) return true;         // siglas
    return /^[\p{Lu}]/u.test(limpia);                        // nombres propios
  });
  // Los nombres propios primero y el resto rellenando. Descartarlos cuando solo
  // hay uno tiraba justo la palabra que importa: «Iran sanctions petroleum
  // tanker» se quedaba en «sanctions petroleum tanker», sin Irán.
  const largas = palabras.filter(w => w.length >= 5 && !fuertes.includes(w));
  const elegidas = [...fuertes, ...largas]
    .slice(0, max)
    .map(w => w.replace(/[^\p{L}\p{N}.\-\u00C0-\u024F]/gu, ''))
    .filter(Boolean);
  return [...new Set(elegidas)].join(' ');
}

/**
 * Una consulta contra un país.
 *
 * Devuelve `{ ok, notas }` o `{ ok:false, motivo }`. La versión anterior
 * devolvía `[]` ante cualquier fallo, y eso convertía un bloqueo en una
 * respuesta: Google contestaba **503** a una IP que había consultado demasiado y
 * el sistema lo leía como «nadie escribió de esto en el mundo» — la urgencia
 * máxima, o sea, el presupuesto entero yendo justo a los temas cuyo censo se
 * había caído. Es el mismo fallo que ya se había corregido en GDELT; no
 * llevarlo aquí lo dejó vivo en la reserva, que es donde más duele porque la
 * reserva es lo que se usa cuando lo otro ya falló.
 */
async function unaConsulta(q, pais, { desde, hasta, fetchImpl = fetch }) {
  const L = LOCALES[pais];
  if (!L) return { ok: false, motivo: `país desconocido: ${pais}` };
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}` +
              `&hl=${L.hl}&gl=${L.gl}&ceid=${encodeURIComponent(L.ceid)}`;
  let xml;
  try {
    const r = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0' } });
    if (!r.ok) return { ok: false, motivo: r.status === 503 ? 'estrangulado (503)' : `http_${r.status}` };
    xml = await r.text();
  } catch (e) { return { ok: false, motivo: `red: ${String(e?.message || e).slice(0, 40)}` }; }

  const notas = [];
  for (const [, b] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const crudo = et(b, 'title');
    const medio = et(b, 'source') || (crudo.includes(' - ') ? crudo.split(' - ').pop() : '');
    // Google añade « - Medio» al final del titular; se quita, o el nombre del
    // medio contaría como palabra compartida y todos los titulares se parecerían.
    const titular = medio && crudo.endsWith(` - ${medio}`)
      ? crudo.slice(0, -(medio.length + 3)).trim() : crudo;
    const fecha = new Date(et(b, 'pubDate'));
    if (!titular || !medio || isNaN(fecha)) continue;
    if (desde && fecha < desde) continue;
    if (hasta && fecha > hasta) continue;
    notas.push({ titular, medio, pais, lang: L.lang, fecha: fecha.toISOString() });
  }
  return { ok: true, notas };
}

/** Barre varias consultas por varios países. Secuencial y con pausa a propósito:
 *  Google News no cobra pero sí estrangula, y el barrido entero cabe en dos
 *  minutos. */
export async function barrido(consultas, paises, opciones = {}) {
  const { pausaMs = 500, maxConsultas = 14 } = opciones;
  const vistos = new Set();
  const notas = [];
  const consultadas = [];

  // Se acortan aquí, una vez, y se quitan las que quedan iguales.
  let cortas = [...new Set(consultas.map(q => consultaCorta(q)).filter(q => q.length >= 4))];

  // Afinado: se prueba una consulta contra el primer país y, si no devuelve
  // nada, se acorta a dos palabras y se vuelve a probar. Cuesta una petición sin
  // coste y evita el fallo caro: un tema bien cubierto que sale como «nadie lo
  // contó» porque la consulta pedía cinco palabras juntas.
  const motivos = [];
  if (paises.length) {
    const afinadas = [];
    for (const q of cortas) {
      const r = await unaConsulta(q, paises[0], opciones);
      if (pausaMs) await new Promise(res => setTimeout(res, pausaMs));
      // Si el sondeo no pudo preguntar, la consulta se deja tal cual: acortarla
      // por un 503 sería reaccionar a un bloqueo como si fuera un resultado.
      if (!r.ok) { motivos.push(`${q}: ${r.motivo}`); afinadas.push(q); continue; }
      if (r.notas.length) { afinadas.push(q); continue; }
      const dos = q.split(' ').slice(0, 2).join(' ');
      afinadas.push(dos.length >= 4 && dos !== q ? dos : q);
    }
    cortas = [...new Set(afinadas)];
  }

  const pares = [];
  for (const q of cortas) for (const p of paises) pares.push([q, p]);

  for (const [q, p] of pares.slice(0, maxConsultas)) {
    const r = await unaConsulta(q, p, opciones);
    if (!r.ok) { motivos.push(`${q}/${p}: ${r.motivo}`); if (pausaMs) await new Promise(res => setTimeout(res, pausaMs)); continue; }
    consultadas.push({ q, pais: p });
    for (const n of r.notas) {
      // Mismo medio y mismo titular vuelve en varios países: es una nota, no dos.
      const huella = `${n.medio.toLowerCase()}|${n.titular.toLowerCase().slice(0, 90)}`;
      if (vistos.has(huella)) continue;
      vistos.add(huella);
      notas.push(n);
    }
    if (pausaMs) await new Promise(r => setTimeout(r, pausaMs));
  }
  // Se devuelve TAMBIÉN lo que se preguntó. Sin eso, «cero notas» es
  // indistinguible de «no se preguntó», y las dos cosas piden lo contrario:
  // una que se gaste, la otra que se arregle el código.
  return { notas, consultadas, motivos };
}

// ── Leer el barrido ──────────────────────────────────────────────────────
//
// La pregunta que contesta: ¿están todos contando lo mismo?
//
// Se compara DENTRO de cada idioma, nunca entre idiomas: un titular en japonés y
// otro en francés no comparten una palabra aunque digan exactamente lo mismo, y
// medirlos juntos daría «divergen» siempre — que es el error que haría gastar el
// presupuesto entero en asuntos donde no hay nada que discutir.

const trozos = (s, lang) => {
  const t = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (['ja', 'zh', 'ko', 'th'].includes(lang)) {
    // Sin espacios que separen palabras: se compara por trigramas de carácter.
    const c = t.replace(/[^\p{L}\p{N}]/gu, '');
    return new Set(Array.from({ length: Math.max(0, c.length - 2) }, (_, i) => c.slice(i, i + 3)));
  }
  return new Set(t.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4));
};

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let comunes = 0;
  for (const x of a) if (b.has(x)) comunes++;
  return comunes / (a.size + b.size - comunes);
};

export function lectura(notas, consultadas = []) {
  const medios = new Set(notas.map(n => n.medio));
  const paises = [...new Set(notas.map(n => n.pais))];
  const idiomas = [...new Set(notas.map(n => n.lang))];

  // Parecido medio entre titulares del mismo idioma, ponderado por tamaño de
  // grupo. Un grupo de menos de tres no dice nada y no entra.
  let suma = 0, peso = 0;
  for (const lang of idiomas) {
    const grupo = notas.filter(n => n.lang === lang);
    if (grupo.length < 3) continue;
    const sets = grupo.slice(0, 40).map(n => trozos(n.titular, lang));
    let s = 0, pares = 0;
    for (let i = 0; i < sets.length; i++)
      for (let j = i + 1; j < sets.length; j++) { s += jaccard(sets[i], sets[j]); pares++; }
    if (!pares) continue;
    suma += (s / pares) * grupo.length; peso += grupo.length;
  }
  const acuerdo = peso ? Number((suma / peso).toFixed(3)) : null;

  return {
    consultas: consultadas.length,
    consultas_texto: [...new Set(consultadas.map(c => c.q))],
    notas: notas.length,
    medios: medios.size,
    paises,
    idiomas,
    acuerdo,                                     // null = no había grupo medible
    cabeceras: notas.slice(0, 8).map(n => ({ medio: n.medio, pais: n.pais, titular: n.titular })),
  };
}

// ── Qué hacer con lo leído ───────────────────────────────────────────────
//
// Devuelve cuánto merece la pena GASTAR en un tema, de 0 a 3. La regla es la que
// se acordó: donde la mayoría dice lo mismo no hay que seguirle; donde hay
// variaciones, sí. Y se añade un caso que el barrido destapa y ninguna otra cosa
// veía: el asunto del que NADIE fuera de nuestras fuentes escribió.

export function urgencia(l) {
  // No haber preguntado no es una respuesta. Marcarlo como «nadie lo cubrió»
  // mandaría el presupuesto entero justo a los temas cuyo barrido falló — que es
  // el fallo de siempre: una comprobación que no corrió pareciendo una que pasó.
  if (!l || !l.consultas) return { nivel: 2, porque: 'no_se_consulto' };
  if (!l.notas) return { nivel: 3, porque: 'nadie_fuera' };
  if (l.medios < 4)   return { nivel: 3, porque: 'apenas_cubierto' };
  if (l.acuerdo === null) return { nivel: 2, porque: 'no_medible' };
  if (l.acuerdo < 0.10)   return { nivel: 3, porque: 'titulares_dispares' };
  if (l.acuerdo < 0.22)   return { nivel: 2, porque: 'algo_de_variacion' };
  if (l.paises.length >= 4) return { nivel: 0, porque: 'coinciden_en_varios_paises' };
  return { nivel: 1, porque: 'coinciden' };
}
