// Render de un número semanal. Lo usan las DOS superficies —el panel, para
// revisar el borrador, y la página pública— a propósito: si el borrador se
// pintara distinto de lo que sale publicado, la revisión no revisaría nada.
//
// Las secciones son dinámicas. No hay lista fija de temas ni debe haberla: si
// una semana no hubo nada de Irán, esa semana no hay sección de Irán. Una
// plantilla con huecos obligaría a rellenarlos, y rellenar es exactamente lo
// que este proyecto dice no hacer.

const ESCAPES = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
export const esc = s => String(s ?? '').replace(/[<>&"']/g, c => ESCAPES[c]);

/** Ancla estable para el índice. Sin acentos, sin signos, corta. */
export function slug(t) {
  return String(t ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 48) || 'seccion';
}

// Sólo tres etiquetas sobreviven al escapado, y son las del aparato: lo
// documentado, lo atribuido y lo afirmado. Todo lo demás que venga del modelo
// se trata como texto, no como HTML.
const APARATO = /&lt;span class=(?:&quot;|&#39;)?(doc|attr|said)(?:&quot;|&#39;)?&gt;/g;

/** Markdown mínimo: párrafos, negrita, cursiva, y los tres spans. */
export function prosa(t) {
  return String(t ?? '')
    .split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
    .map(p => {
      let h = esc(p.replace(/^#+\s*/, ''))
        .replace(APARATO, '<span class="$1">')
        .replace(/&lt;\/span&gt;/g, '</span>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
      return `<p>${h}</p>`;
    }).join('\n');
}

const FECHA = { day: 'numeric', month: 'long', year: 'numeric' };

// La fecha también tiene país. Esto ponía `en-GB` para todo el mundo, así que
// las páginas en español fechaban «16 August 2026» — en una publicación que
// decidió a propósito que su edición hispana es mexicana (D-020). Un número que
// se traduce con esmero y se fecha en otro idioma no está traducido.
export const fecha = (s, lang = 'en') => {
  const d = new Date(`${s}T12:00:00Z`);
  if (isNaN(d)) return String(s);
  return d.toLocaleDateString(lang === 'es' ? 'es-MX' : 'en-GB',
                              { ...FECHA, timeZone: 'UTC' });
};

/**
 * El rango que cubre un número: «16–22 August 2026», no una fecha suelta.
 *
 * Un número semanal cubre SIETE días y enseñar solo el domingo hacía pensar que
 * eso era todo lo que traía. Cuando los dos extremos caen en el mismo mes, el
 * mes y el año no se repiten: es la convención de cualquier revista y ahorra la
 * mitad de la línea.
 */
export const rango = (inicio, fin, lang = 'en') => {
  const a = new Date(`${inicio}T12:00:00Z`), b = new Date(`${fin}T12:00:00Z`);
  if (isNaN(a) || isNaN(b)) return fecha(inicio, lang);
  const loc = lang === 'es' ? 'es-MX' : 'en-GB';
  const mismoMes = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  if (!mismoMes) return `${fecha(inicio, lang)} – ${fecha(fin, lang)}`;
  const dia = a.toLocaleDateString(loc, { day: 'numeric', timeZone: 'UTC' });
  return `${dia}–${fecha(fin, lang)}`;
};

// La leyenda explica una inversión: aquí una marca es una ADVERTENCIA, y la
// prosa sin marcar es lo asentado. Antes se marcaba todo —cada frase llevaba su
// etiqueta— y eso obligaba a escribir «X sostiene que…» en cada párrafo, con lo
// que el número contaba quién había hablado en vez de contar qué pasó.
//
// El silencio significa algo, y por eso hay que ganárselo: solo se deja sin
// marcar lo que el reporteo de fuera o un documento sostienen. Que cinco canales
// de la misma órbita repitan una cosa NO la asienta.
export const LEYENDA = `
<div class="legend">
  <b>Unmarked text is established. A mark is a caution.</b>
  <span><span class="doc">gold</span> traceable to a named document</span>
  <span><span class="attr">dotted</span> only one source says it</span>
  <span><span class="said">plain</span> asserted, nothing supports it</span>
</div>`;

export const LEYENDA_ES = `
<div class="legend">
  <b>Lo que va sin marcar está asentado. Una marca es una advertencia.</b>
  <span><span class="doc">dorado</span> rastreable hasta un documento</span>
  <span><span class="attr">punteado</span> lo dice una sola fuente</span>
  <span><span class="said">liso</span> se afirma y nada lo sostiene</span>
</div>`;

/**
 * El cuerpo del número. Devuelve HTML.
 *
 * Acepta la forma vieja (`sections`, con sus siete casillas) para no romper los
 * números ya guardados, pero no la maqueta: la señala como lo que es. Fingir
 * que un número viejo es del formato nuevo escondería justo lo que cambió.
 */
// Las pocas palabras que pone el renderizador, no el modelo. Van aquí y no en
// el prompt porque son del armazón: si las escribiera el modelo, cambiarían de
// una semana a otra.
const PALABRAS = {
  en: { de: 'of', indice: 'In this issue', cierre: 'What nobody said',
        volver: '↑ Contents',
        fuentes: (n) => `${n} source${n === 1 ? '' : 's'}` },
  es: { de: 'de', indice: 'En este número', cierre: 'Lo que no dijo nadie',
        volver: '↑ Índice',
        fuentes: (n) => `${n} fuente${n === 1 ? '' : 's'}` },
};

export function renderIssue(body = {}, lang = 'en') {
  const T = PALABRAS[lang] ?? PALABRAS.en;
  const piezas = body.pieces;
  // Cada pieza dice de qué episodios salió. Se pintan como flechas discretas
  // detrás de la nota de procedencia, y se cortan a seis: una pieza citó
  // veintiuno, y veintiuna flechas dejan de ser discretas para convertirse en un
  // muro. Lo que importa es poder ir, no ver el inventario.
  // En una publicación cuya premisa es poder rastrear lo que se dice, no poder
  // llegar a la fuente era una omisión seria.
  const enlaces = body.sources_index ?? {};
  if (!Array.isArray(piezas) || !piezas.length) {
    return `<p class="weekly-viejo">This issue was written in the old format
      (${(body.sections || []).length} boxed sections). Rebuild it to get the
      current one.</p>`;
  }

  const indice = piezas.map((p, i) => `
    <li><a href="#${slug(p.title)}">
      <span class="n">${String(i + 1).padStart(2, '0')}</span>
      <span>${p.subject ? `<span class="subj">${esc(p.subject)}</span>` : ''}
      <span class="t">${esc(p.title)}</span>
      <span class="d">${esc(p.dek || '')}</span></span></a></li>`).join('');

  const cuerpo = piezas.map((p, i) => `
    <article class="piece" id="${slug(p.title)}">
      <p class="kicker">${String(i + 1).padStart(2, '0')} · ${T.de} ${piezas.length}${
        p.subject ? ` · <span class="subj">${esc(p.subject)}</span>` : ''}</p>
      <!-- El título no lleva enlace. Un titular que se puede pinchar invita a
           pinchar antes de leer, y aquí lo que se ofrece es la lectura; las
           fuentes están al pie, que es donde se buscan cuando ya has leído. -->
      <h2>${esc(p.title)}</h2>
      ${p.dek ? `<p class="dek">${esc(p.dek)}</p>` : ''}
      ${prosa(p.body)}
      ${p.sources_note ? `<p class="src">${esc(p.sources_note)}</p>` : ''}
      ${(p.sources || []).length ? `${(() => {
          // Plegado, con la cuenta a la vista. Ocho enlaces desplegados al pie de
          // cada pieza son ocho interrupciones en la única línea que no tiene que
          // interrumpir; lo que informa de un vistazo es CUÁNTAS fuentes hubo y
          // cuántas venían de fuera. Quien quiera ir, hace clic.
          const porCanal = new Map();
          for (const id of p.sources || []) {
            const e = enlaces[id];
            if (!e?.url) continue;                     // un id inventado se calla
            // La llave lleva el tipo: un canal seguido y un medio de reportaje
            // que compartan nombre no deben fundirse en un enlace.
            const k = `${e.kind === 'report' ? 'r|' : 'c|'}${e.channel || 'source'}`;
            if (!porCanal.has(k)) porCanal.set(k, { ...e, n: 0 });
            porCanal.get(k).n++;
          }
          const todos = [...porCanal.entries()];
          if (!todos.length) return '';
          const pinta = ([k, e]) =>
            `<a class="fuente${e.kind === 'report' ? ' reportaje' : ''}" href="${esc(e.url)}"
               target="_blank" rel="noopener"
               title="${esc(e.title || '')}">${esc(k.slice(2))}${e.n > 1 ? `<span class="n">${e.n}</span>` : ''}</a>`;
          // Los de fuera van después, sin contarse aparte: el subrayado ya los
          // distingue y esa cuenta es cocina, no información para quien lee.
          const reportes = todos.filter(([, e]) => e.kind === 'report');
          const canales = todos.filter(([, e]) => e.kind !== 'report');
          // FUERA del <p class="src">, no dentro.
          //
          // Un <details> no puede vivir dentro de un <p>: el analizador de HTML
          // cierra el párrafo al encontrarlo y lo escupe como hermano. Estuvo
          // así en producción, y la consecuencia era justo la contraria de la
          // que se buscaba — como el bloque acababa colgando de `.piece` y no de
          // `.src`, NINGUNA de las reglas `.src details.fuentes` llegaba a
          // aplicarse: las fuentes se pintaban a 17 px en negro y con el
          // triángulo por defecto, al pie de una prosa de 12,6 px atenuada.
          // Eran lo más llamativo de cada pieza.
          return `<details class="fuentes"><summary>${esc(T.fuentes(todos.length))}</summary>` +
                 `<span class="fuentes-lista">${[...canales, ...reportes].map(pinta).join('')}</span></details>`;
        })()}` : ''}
      <a class="up" href="#contents">${T.volver}</a>
    </article>`).join('');

  const cierre = (body.closing || []).map(c =>
    `<li>${prosa(c).replace(/^<p>|<\/p>$/g, '')}</li>`).join('');

  return `
  ${body.headline ? `<h1 class="hed">${esc(body.headline)}</h1>` : ''}
  ${body.standfirst ? `<div class="stand">${prosa(body.standfirst)}</div>` : ''}
  ${lang === 'es' ? LEYENDA_ES : LEYENDA}
  <nav class="toc" id="contents">
    <h2>${T.indice}</h2>
    <ol>${indice}</ol>
  </nav>
  ${cuerpo}
  ${cierre ? `<section class="closing">
    <h2>${T.cierre}</h2>
    <ul>${cierre}</ul>
  </section>` : ''}`;
}

/** La flecha. Sólo aparece cuando el índice ya quedó atrás. */
export const VOLVER_ARRIBA = `
<a href="#contents" id="weekly-top" aria-label="Back to contents">↑</a>
<script>
(function () {
  var b = document.getElementById('weekly-top'), i = document.getElementById('contents');
  if (!b || !i) return;
  if (!('IntersectionObserver' in window)) { b.classList.add('on'); return; }
  new IntersectionObserver(function (e) {
    b.classList.toggle('on', !e[0].isIntersecting && e[0].boundingClientRect.top < 0);
  }, { threshold: 0 }).observe(i);
})();
</script>`;
