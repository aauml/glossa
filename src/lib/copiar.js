// El botón de copiar el enlace, en HTML plano.
//
// El glifo son dos hojas superpuestas —el de copiar de toda la vida—, no una
// cadena: la cadena a 20 px sobre un titular de 53 se leía como una coma.
//
// Va al final del TITULAR, y un titular se pinta con `set:html` en las dos
// superficies —la revista lo arma en `renderIssue`, el artículo lo trae en su
// frontmatter—, así que un componente de Astro no puede meterse ahí dentro. La
// marca vive aquí, el comportamiento en `CopiarScript.astro`, y las dos la
// usan igual.
const T = {
  en: { titulo: 'Copy link', ok: 'link copied' },
  es: { titulo: 'Copiar el enlace', ok: 'enlace copiado' },
};

export function botonCopiar(lang = 'en') {
  const t = T[lang] ?? T.en;
  // Sin saltos de línea dentro de las etiquetas: `/` y `>` separados por un
  // salto NO cierran el elemento —HTML5 ignora esa barra—, y el <rect> se
  // tragaba el <path>, así que el icono salía como un cuadrado suelto.
  return `<span class="copiar" data-copiar><button type="button" aria-label="${t.titulo}" title="${t.titulo}"><svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><rect x="5.6" y="5.6" width="8.4" height="8.4" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M10.6 3.4H3.6A1.6 1.6 0 0 0 2 5v7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg></button><span class="copiar-ok" data-ok hidden>${t.ok}</span></span>`;
}
