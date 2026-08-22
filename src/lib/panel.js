// Lo que repetían las cuatro páginas del panel, en un sitio.
//
// `msg` recibe un ELEMENTO, no un identificador. Ese cambio es el que permite
// fundir las páginas: con ids, tres secciones que quieren avisar de algo
// acababan compartiendo un `#msg` y escribiendo cada una encima de la otra.

/** Única puerta al servidor. El token vive allí; el navegador nunca lo ve. */
export const api = (op, extra = {}) =>
  fetch('/api/admin/op/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...extra }),
  }).then(r => r.json()).catch(() => ({ error: 'no se pudo hablar con el servidor' }));

const ESCAPES = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[<>&"']/g, c => ESCAPES[c]);

/** `ok` en falso pinta la regla en acento: algo salió mal y hay que mirarlo. */
export function msg(el, texto, ok = true) {
  if (!el) return;
  el.innerHTML = texto ? `<div class="admin-msg ${ok ? 'ok' : ''}">${esc(texto)}</div>` : '';
}

/**
 * Un solo escuchador por contenedor en vez de revincular los botones cada vez
 * que se repinta. Con tres tablas que se repintan por su cuenta, revincular
 * duplica manejadores en cuanto dos repintados se solapan.
 */
export function delegar(contenedor, selector, fn) {
  if (!contenedor) return;
  contenedor.addEventListener('click', (e) => {
    const b = e.target.closest(selector);
    if (b && contenedor.contains(b)) fn(b, e);
  });
}
