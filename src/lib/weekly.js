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
export const fecha = s => {
  const d = new Date(`${s}T12:00:00Z`);
  return isNaN(d) ? String(s) : d.toLocaleDateString('en-GB', { ...FECHA, timeZone: 'UTC' });
};

export const LEYENDA = `
<div class="legend">
  <b>How claims are marked</b>
  <span><span class="doc">gold</span> traceable to a document</span>
  <span><span class="attr">dotted</span> attributed, unverified</span>
  <span><span class="said">plain</span> asserted, no support offered</span>
</div>`;

/**
 * El cuerpo del número. Devuelve HTML.
 *
 * Acepta la forma vieja (`sections`, con sus siete casillas) para no romper los
 * números ya guardados, pero no la maqueta: la señala como lo que es. Fingir
 * que un número viejo es del formato nuevo escondería justo lo que cambió.
 */
export function renderIssue(body = {}) {
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
      <p class="kicker">${String(i + 1).padStart(2, '0')} · of ${piezas.length}${
        p.subject ? ` · <span class="subj">${esc(p.subject)}</span>` : ''}</p>
      <h2>${esc(p.title)}${(() => {
        // Al final del título, apuntando al episodio principal de los que usó.
        // Ahí es donde se busca cuando algo te llama la atención y quieres oírlo,
        // no al pie después de leer los seiscientos palabras.
        const e = enlaces[(p.sources || [])[0]];
        return e?.url
          ? ` <a class="ir" href="${esc(e.url)}" target="_blank" rel="noopener"
               title="${esc(e.title || 'source')}" aria-label="Open the source"> ↗</a>` : '';
      })()}</h2>
      ${p.dek ? `<p class="dek">${esc(p.dek)}</p>` : ''}
      ${prosa(p.body)}
      ${p.sources_note || (p.sources || []).length ? `<p class="src">${esc(p.sources_note || '')}
        ${(() => {
          // Un canal, un enlace. Antes salía «Chris Cillizza ↗Chris Cillizza ↗Chris
          // Cillizza ↗» pegados, porque la pieza usó tres episodios suyos: eso no
          // informa de nada y estorba. Se agrupa por canal, con su cuenta si hubo
          // varios, y el enlace lleva al primero.
          const porCanal = new Map();
          for (const id of p.sources || []) {
            const e = enlaces[id];
            if (!e?.url) continue;                     // un id inventado se calla
            const k = e.channel || 'source';
            if (!porCanal.has(k)) porCanal.set(k, { ...e, n: 0 });
            porCanal.get(k).n++;
          }
          const todos = [...porCanal.entries()];
          if (!todos.length) return '';
          // Los reportajes se pintan aparte y VAN DESPUÉS. En una publicación
          // cuya premisa entera es que el lector pueda ver la procedencia, tiene
          // que poder distinguir de un vistazo cuáles de estos enlaces eran el
          // coro y cuáles el reporteo que se salió a buscar.
          const pinta = ([k, e]) =>
            `<a class="fuente${e.kind === 'report' ? ' reportaje' : ''}" href="${esc(e.url)}"
               target="_blank" rel="noopener"
               title="${esc(e.title || '')}">${esc(k)}${e.n > 1 ? ` <span class="n">${e.n}</span>` : ''}<span aria-hidden="true"> ↗</span></a>`;
          todos.sort((a, b) => (a[1].kind === 'report' ? 1 : 0) - (b[1].kind === 'report' ? 1 : 0));
          const primeros = todos.slice(0, 6).map(pinta).join('');
          const resto = todos.slice(6);
          // Los que sobran se despliegan de verdad. «and 12 more» sin poder abrirlo
          // solo dice que hay algo que no puedes ver.
          return resto.length
            ? `${primeros}<details class="mas"><summary>and ${resto.length} more</summary>${resto.map(pinta).join('')}</details>`
            : primeros;
        })()}</p>` : ''}
      <a class="up" href="#contents">↑ Contents</a>
    </article>`).join('');

  const cierre = (body.closing || []).map(c =>
    `<li>${prosa(c).replace(/^<p>|<\/p>$/g, '')}</li>`).join('');

  return `
  ${body.headline ? `<h1 class="hed">${esc(body.headline)}</h1>` : ''}
  ${body.standfirst ? `<div class="stand">${prosa(body.standfirst)}</div>` : ''}
  ${LEYENDA}
  <nav class="toc" id="contents">
    <h2>In this issue</h2>
    <ol>${indice}</ol>
  </nav>
  ${cuerpo}
  ${cierre ? `<section class="closing">
    <h2>What nobody said</h2>
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
