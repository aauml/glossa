// El fusible. Lo que tiene que pasar antes de que un número pueda salir sin que
// nadie lo lea.
//
// No sustituye a una revisión humana por una más rápida: comprueba lo que una
// máquina PUEDE comprobar y deja lo demás fuera de su alcance a propósito. Caza
// citas que nadie dijo, sellos de «documentado» sin cotejo detrás y deriva
// estructural. No puede cazar un número bien formado, bien citado y bien marcado
// que se equivoque sobre qué significó la semana. Eso queda dicho y asumido.
//
// Es puro —sin red, sin base— porque corre en tres sitios: al escribir el
// número, junto al botón de publicar, y en la vía automática. Si los tres no dan
// el mismo veredicto, el fusible no sirve para nada.

const norm = (s) => String(s ?? '').toLowerCase()
  .replace(/[‘’“”]/g, "'")
  .replace(/\s+/g, ' ')
  .replace(/[.,;:!?]+$/, '')
  .trim();

const sinSpans = (s) => String(s ?? '').replace(/<\/?span[^>]*>/g, '');

/** Todo el texto que un lector va a ver. */
function textoDelNumero(issue) {
  return [
    issue.headline, issue.standfirst, issue.colophon,
    ...(issue.closing ?? []),
    ...(issue.pieces ?? []).flatMap(p => [p.title, p.dek, p.body, p.sources_note]),
  ].filter(Boolean).map(String);
}

/** Frases entrecomilladas de cuatro palabras o más. Menos que eso es una
 *  expresión, no una cita, y perseguirlas produce ruido.
 *
 *  Las comillas tipográficas se emparejan con su cierre, no con «cualquier
 *  comilla». Tratándolas como intercambiables, el fusible saltaba del cierre de
 *  una cita a la apertura de la siguiente y denunciaba como cita inventada el
 *  texto que había en medio — que no era una cita de nadie. */
function citas(texto) {
  const t = sinSpans(texto);
  const out = [];
  // Las tipográficas se emparejan con su cierre y son fiables.
  // El filtro de longitud va DESPUÉS de emparejar, nunca dentro del patrón. Con
  // un mínimo dentro, una cita corta —«last May», ocho caracteres— no cuadra como
  // par, su comilla de cierre pasa a hacer de apertura de la siguiente, y todo lo
  // que viene detrás se empareja mal. El fusible acusó así de cita inventada a un
  // párrafo entero que no era una cita de nadie.
  for (const m of t.matchAll(/\u201C([^\u201D]{0,400})\u201D/g)) out.push(m[1].trim());

  // Las rectas solo si están BALANCEADAS. Con una suelta, todo lo que viene
  // después se empareja mal y el fusible denuncia como cita inventada un texto
  // que no era una cita de nadie: pasó con un pasaje entero sobre Tulsi Gabbard.
  // Acusar mal es peor que no acusar, así que ante una comilla impar no se
  // extrae nada por esta vía — y el desbalance se señala aparte, que es el
  // problema de verdad.
  const rectas = (t.match(/"/g) ?? []).length;
  if (rectas % 2 === 0) {
    for (const m of t.matchAll(/"([^"]{0,400})"/g)) out.push(m[1].trim());
  }
  return out.filter(x => x.split(/\s+/).length >= 4);
}

/** Una comilla recta sin cerrar. No es una cita falsa, es un texto mal cerrado,
 *  y conviene decirlo con ese nombre. */
const comillasDescuadradas = (t) => ((sinSpans(t).match(/"/g) ?? []).length % 2) === 1;

const GENERICOS = new Set(['politics','economy','analysis','geopolitics','media','news',
  'world','business','opinion','commentary','international','current affairs']);

/**
 * @param {object} issue      el cuerpo del número
 * @param {object} contexto   { items, cotejos } de la semana
 * @returns {{ok:boolean, fallos:Array<{regla,detalle,grave}>}}
 */
export function revisar(issue = {}, contexto = {}) {
  const fallos = [];
  const falla = (regla, detalle, grave = true) => fallos.push({ regla, detalle, grave });

  const items = contexto.items ?? [];
  const cotejos = contexto.cotejos ?? [];

  // Contrato con el que llama, comprobado en vez de confiado. La regla del
  // dorado normaliza `claim_text`; si el select no lo trae, `norm(undefined)`
  // da un set vacío y la regla degrada a acusar TODOS los dorados — y así
  // estuvo, muerta desde su commit, sin que nadie lo viera porque nunca hubo
  // un dorado que la ejercitara. Una columna ausente tiene que romper aquí,
  // ruidosamente, no en el primer número que use la marca.
  if (cotejos.length && !('claim_text' in cotejos[0])) {
    throw new Error('revisar(): los cotejos llegan sin `claim_text` — el select del llamador no trae las columnas que la regla del dorado necesita');
  }
  const piezas = issue.pieces ?? [];
  const textos = textoDelNumero(issue);

  // ── 1. Procedencia de las citas ─────────────────────────────────────────
  // Toda frase entrecomillada tiene que existir literal en el material. Esto es
  // el incidente que lo motivó, cazado a máquina: un modelo tomó una cita
  // guardada en español, la tradujo al inglés y la presentó como palabras
  // textuales. La traducida no puede coincidir con la guardada, porque la
  // guardada está en su idioma.
  const guardadas = new Map();          // texto normalizado → idioma del material
  const parafrasis = new Set();         // reconocido pero NO citable (reportajes)
  for (const it of items) {
    for (const q of it.digest?.quotes ?? []) if (q?.text) guardadas.set(norm(q.text), it.lang ?? null);
    for (const c of it.digest?.claims ?? []) if (c?.claim) guardadas.set(norm(c.claim), it.lang ?? null);
    if (it.digest?.thesis) guardadas.set(norm(it.digest.thesis), it.lang ?? null);
    // El TÍTULO del episodio también es citable, y citarlo es parte del trabajo:
    // cuando un titular no dice lo que dice el episodio, el número tiene que
    // poder reproducirlo para enseñar la diferencia. Van marcados como inglés
    // porque un titular se cita tal cual está escrito, no traducido.
    if (it.title) guardadas.set(norm(it.title), 'en');

    // Un reportaje no tiene `claims` ni `thesis`: lo que trae es qué pasó, quién
    // habló y qué cifras se publicaron. Las cifras entran como citables — nunca
    // llegan a cuatro palabras, así que no abren puerta a nada.
    //
    // `what_happened` y `attributed[].what` van a un set APARTE, reconocido pero
    // NO citable. La primera versión los metió en `guardadas` como inglés, y eso
    // desarmaba la regla fundacional por la puerta de atrás: son PARÁFRASIS —y
    // traducida, cuando el artículo no es inglés—, así que entrecomillar ocho
    // palabras de ahí es el incidente que fundó el fusible, lavado por la vía
    // del reportaje. Reconocerlas evita acusar de «inventada» a una cita que
    // procede del material; no ser citables evita que pase por literal.
    for (const f of it.digest?.figures ?? []) if (f?.figure) guardadas.set(norm(f.figure), 'en');
    for (const a of it.digest?.attributed ?? []) if (a?.what) parafrasis.add(norm(a.what));
    if (it.digest?.what_happened) parafrasis.add(norm(it.digest.what_happened));
  }

  // ── El español se juzga con otra vara ───────────────────────────────────
  // Allí las citas van traducidas y en CURSIVA, sin comillas: una traducción no
  // puede afirmar ser literal, así que no lleva la marca que lo afirma. Comparar
  // letra por letra contra un material en inglés no diría nada.
  //
  // Lo que sí se puede comprobar, y es lo que importa: que no se haya INVENTADO
  // ninguna voz. En español no puede haber más pasajes citados que en el
  // original, ni comillas sueltas que reclamen literalidad.
  if (contexto.lang === 'es') {
    const original = contexto.original ?? null;
    const cursivas = textos.join(' ').match(/(?<!\*)\*[^*\n]{8,}\*(?!\*)/g) ?? [];
    const enComillas = textos.flatMap(t => citas(t));

    if (enComillas.length) {
      falla('comillas en la traducción',
        `${enComillas.length} pasaje(s) entrecomillados: «${String(enComillas[0]).slice(0, 60)}». ` +
        `En español la voz ajena va en cursiva — unas comillas afirmarían que son las palabras exactas, ` +
        `y una traducción nunca lo es.`);
    }
    if (original) {
      const enOriginal = textoDelNumero(original).flatMap(t => citas(t)).length;
      if (cursivas.length > enOriginal + 2) {
        falla('voces inventadas',
          `la traducción marca ${cursivas.length} pasajes como dicho por alguien y el original tenía ${enOriginal}`);
      }
    }
    return { ok: !fallos.some(f => f.grave), fallos, citas: cursivas.length };
  }

  for (const t of textos) {
    if (comillasDescuadradas(t)) {
      falla('comillas sin cerrar',
        'hay un número impar de comillas rectas; queda una abierta y no se puede saber dónde acaba la cita');
    }
    for (const cita of citas(t)) {
      const n = norm(cita);
      // Coincidencia exacta, o la guardada contiene a la citada: acortar una cita
      // es legítimo; inventarla no.
      //
      // Y los puntos suspensivos también: elidir el centro de una cita es un
      // recurso normal, y sin contemplarlo el fusible acusaba de inventada una
      // cita real —pasó con «…correctly... I know», que en el material dice
      // «…correctly. It's real. I'm not speculating, I know.»—. Con la elisión,
      // cada trozo tiene que aparecer en LA MISMA cita guardada y EN ORDEN: eso
      // permite acortar y sigue impidiendo unir dos frases que nadie dijo juntas.
      const trozos = n.split(/\s*\.{3,}\s*|\s*…\s*/).map(x => x.trim()).filter(x => x.length > 3);
      const encaja = (g) => {
        if (g.includes(n)) return true;
        if (trozos.length < 2) return false;
        let desde = 0;
        for (const t of trozos) {
          const i = g.indexOf(t, desde);
          if (i < 0) return false;
          desde = i + t.length;
        }
        return true;
      };

      let idioma, hallada = false;
      if (guardadas.has(n)) { hallada = true; idioma = guardadas.get(n); }
      else for (const [g, l] of guardadas) if (encaja(g)) { hallada = true; idioma = l; break; }

      if (!hallada) {
        // Antes de acusar de inventada: ¿procede de una paráfrasis de reportaje?
        // Entonces el fallo es otro y tiene su nombre — el texto existe, pero es
        // el resumen en inglés de lo que alguien dijo, no sus palabras.
        let deParafrasis = parafrasis.has(n);
        if (!deParafrasis) for (const g of parafrasis) if (encaja(g)) { deParafrasis = true; break; }
        if (deParafrasis) {
          falla('cita de paráfrasis',
            `«${cita.slice(0, 70)}» sale del resumen en inglés de un reportaje, no de palabras literales. Usarla sin comillas, con atribución.`);
        } else {
          falla('cita sin procedencia',
            `«${cita.slice(0, 90)}» no aparece literal en el material de la semana`);
        }
        continue;
      }
      // ── 2. Sin citas traducidas ──────────────────────────────────────────
      if (idioma && idioma !== 'en') {
        falla('cita traducida',
          `«${cita.slice(0, 70)}» viene de material en «${idioma}». Parafrasear con atribución, sin comillas.`);
      }
    }
  }

  // ── 3. Dorado ganado ────────────────────────────────────────────────────
  // Cada `<span class="doc">` tiene que corresponderse con un cotejo que dijo
  // `documenta`. Cero cotejos de ese tipo, cero dorados permitidos. Esto
  // convierte la afirmación editorial central en una invariante.
  const documentadas = cotejos.filter(c => c.verdict === 'documenta')
    .map(c => new Set(norm(c.claim_text).split(' ').filter(w => w.length > 3)));

  for (const t of textos) {
    for (const m of String(t).matchAll(/<span class="doc">([\s\S]*?)<\/span>/g)) {
      const marcado = sinSpans(m[1]);
      const fichas = new Set(norm(marcado).split(' ').filter(w => w.length > 3));
      const encaja = documentadas.some(d => {
        const comunes = [...fichas].filter(w => d.has(w)).length;
        return fichas.size && comunes / fichas.size >= 0.5;
      });
      if (!encaja) {
        falla('dorado sin cotejo',
          documentadas.length
            ? `«${marcado.slice(0, 80)}» va marcada como documentada y ningún cotejo la respalda`
            : `«${marcado.slice(0, 80)}» va marcada como documentada y esta semana no hubo ningún cotejo «documenta»`);
      }
    }
  }

  // ── 4. Aparato bien formado ─────────────────────────────────────────────
  // El renderizador descarta en silencio los spans mal cerrados, así que hoy un
  // fallo aquí degrada a invisible en vez de a ruidoso.
  for (const t of textos) {
    const abre = (String(t).match(/<span class="(?:doc|attr|said)">/g) ?? []).length;
    const cierra = (String(t).match(/<\/span>/g) ?? []).length;
    if (abre !== cierra) falla('aparato mal formado', `${abre} etiquetas abiertas y ${cierra} cerradas`);
    if (/<span class="(?:doc|attr|said)">[^<]*<span/.test(String(t)))
      falla('aparato mal formado', 'hay marcas anidadas, que el renderizador no sabe pintar');
  }

  // ── 5. Estructura ───────────────────────────────────────────────────────
  // Hoy son peticiones al prompt, o sea sugerencias. Esto las convierte en reglas.
  if (piezas.length < 3 || piezas.length > 7)
    falla('estructura', `${piezas.length} piezas; se esperan entre 3 y 7`);
  if (!issue.headline) falla('estructura', 'sin titular');
  if (!issue.standfirst) falla('estructura', 'sin entrada');
  if ((issue.closing ?? []).length < 3) falla('estructura', 'el cierre tiene menos de tres entradas');

  for (const [i, p] of piezas.entries()) {
    const n = String(p.body ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (n < 250 || n > 800) falla('estructura', `pieza ${i + 1} «${p.title ?? '?'}»: ${n} palabras`);
    for (const campo of ['subject', 'title', 'dek'])
      if (!String(p[campo] ?? '').trim()) falla('estructura', `pieza ${i + 1}: falta «${campo}»`);
    if (GENERICOS.has(String(p.subject ?? '').toLowerCase().trim()))
      falla('estructura', `pieza ${i + 1}: «${p.subject}» vale para cualquier pieza y no informa de nada`);
    if (/^\s*[-*•]\s+/m.test(String(p.body ?? '')))
      falla('estructura', `pieza ${i + 1}: hay viñetas dentro del texto`);
  }

  // ── 6. Sin recuentos de episodios ───────────────────────────────────────
  for (const t of textos) {
    const m = String(t).match(/\b\d+\s+(episodes?|voices?|sources?|guests?|clips?)\b/i);
    if (m) falla('recuento de episodios', `«${m[0]}» — el número no habla de su propia maquinaria`);
  }

  // ── 7. Personas nombradas ───────────────────────────────────────────────
  // Solo avisa, de momento. Es la regla con más probabilidad de saltar sobre un
  // tercero legítimo nombrado dentro de un documento, y bloquear por eso sería
  // peor que el fallo que previene. Se sube a bloqueante cuando se haya visto
  // unas semanas qué señala de verdad.
  const conocidos = new Set();
  for (const it of items) {
    for (const s of it.digest?.speakers ?? []) conocidos.add(norm(String(s).split(/[(,]/)[0]));
    if (it.author) conocidos.add(norm(it.author));
    // Un reportaje no tiene `speakers`: la gente que aparece en él son los que
    // hablaron para el acta. Sin esto, un ministro citado por Reforma saldría
    // señalado como «persona no vista» —un aviso falso justo sobre lo que el
    // reportaje viene a aportar—.
    for (const a of it.digest?.attributed ?? []) if (a?.who) conocidos.add(norm(String(a.who).split(/[(,]/)[0]));
    if (it.digest?.byline) conocidos.add(norm(it.digest.byline));
  }
  for (const c of cotejos) if (c.title) for (const w of String(c.title).split(/\s+/)) conocidos.add(norm(w));

  const ATRIBUYE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'’-]+){1,2})\s+(said|says|argued|argues|told|claimed|noted|wrote)\b/g;
  for (const t of textos) {
    for (const m of sinSpans(t).matchAll(ATRIBUYE)) {
      const nombre = norm(m[1]);
      const sale = [...conocidos].some(k => k.includes(nombre) || nombre.includes(k));
      if (!sale) falla('persona no vista',
        `«${m[1]}» aparece atribuyendo algo y no está entre quienes hablan esta semana`, false);
    }
  }

  // ── 8. Los ids que cita, y de dónde bebe cada pieza ─────────────────────
  //
  // Las dos avisan y no bloquean, por razones distintas. La primera porque un id
  // suelto rompe un enlace, no el número. La segunda porque una pieza puede
  // honestamente ser de algo sobre lo que no se encontró nada fuera — pero es la
  // única cifra que dice si salir a buscar está sirviendo para algo, y sin
  // medirla la etapa entera podría estar funcionando en vacío durante semanas.
  const ids = contexto.ids instanceof Set ? contexto.ids : new Set(contexto.ids ?? []);

  // Qué ids cortos tienen un cotejo detrás. `contexto.indice` mapea id → item,
  // y con eso se sabe si una pieza se apoyó en algo comprobado o solo en lo que
  // se dijo en los canales.
  const cotejoDe = new Set();
  {
    const porItem = new Set(cotejos.filter(c => c.verdict === 'documenta' || c.verdict === 'contradice')
                                   .map(c => c.item_id));
    for (const [corto, e] of Object.entries(contexto.indice ?? {})) {
      if (e?.item_id && porItem.has(e.item_id)) cotejoDe.add(corto);
    }
  }
  // Contra lo que VIO el modelo, no contra la tabla: la reserva de tokens puede
  // recortar todos los reportes, y entonces el prompt no llevó bloque REPORTING
  // — acusar a las piezas de ignorarlo sería medir contra un fantasma.
  const habiaReportaje = contexto.reportaje_count !== undefined
    ? contexto.reportaje_count > 0
    : items.some(it => it.origin === 'reportaje');
  let sinReportaje = 0;

  for (const [i, p] of piezas.entries()) {
    const fuentes = (p.sources ?? []).map(String);
    if (ids.size) {
      const rotos = fuentes.filter(f => !ids.has(f));
      if (rotos.length) {
        falla('id inexistente',
          `pieza ${i + 1} «${p.title ?? '?'}» cita ${rotos.join(', ')}, que no está en el material`, false);
      }
    }
    if (habiaReportaje && fuentes.length && fuentes.every(f => f.startsWith('e'))) sinReportaje++;

    // ── Lo que no se comprobó no puede ir en limpio ─────────────────────
    // La prosa sin marcar significa «esto está asentado». Una pieza que no cita
    // ni un reportaje de fuera ni un cotejo no tiene con qué asentar nada: todo
    // lo suyo procede de los canales, y presentarlo sin marca es exactamente la
    // afirmación que esta publicación existe para no hacer.
    //
    // Cinco canales de la misma órbita repitiendo una cosa no la asientan — es
    // un relato con cinco bocas. Si no hubo con qué comprobarlo, se escribe
    // igual, pero marcado.
    const conApoyo = fuentes.some(f => f.startsWith('r'))
      || fuentes.some(f => cotejoDe.has(f));
    const marcas = (String(p.body || '').match(/<span class="(?:doc|attr|said)">/g) || []).length;
    if (!conApoyo && fuentes.length && marcas === 0) {
      falla('afirma sin haber comprobado',
        `pieza ${i + 1} «${p.title ?? '?'}» no cita reportaje ni cotejo y no marca nada: ` +
        `da por asentado lo que solo dijeron los canales`);
    }
  }
  if (sinReportaje) {
    falla('pieza sin reportaje',
      `${sinReportaje} de ${piezas.length} piezas se escribieron solo con los canales, ` +
      `habiendo reportaje de fuera esta semana`, false);
  }

  return { ok: !fallos.some(f => f.grave), fallos, piezas_sin_reportaje: sinReportaje };
}
