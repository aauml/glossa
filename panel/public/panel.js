/* Utilidades compartidas por las tres pantallas.
   No hay login aquí: Cloudflare Access resuelve la identidad antes de que el
   navegador llegue a cargar esta página. */

export const api = (op, extra = {}) =>
  fetch('/api/op', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, ...extra }),
  }).then(r => r.json());

export const esc = s =>
  String(s ?? '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export function barra(activa) {
  const tabs = [['', 'Estado'], ['fuentes.html', 'Fuentes'], ['bandeja.html', 'Bandeja']];
  document.body.insertAdjacentHTML('afterbegin', `
    <header class="admin-bar">
      <a class="admin-brand" href="https://glossa.ademas.ai">Glossa<span class="wm-dot" style="color:var(--accent)">.</span></a>
      <nav class="admin-tabs">${tabs.map(([h, l]) =>
        `<a href="/${h}" class="${h === activa ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <a class="admin-salir" href="/cdn-cgi/access/logout">Salir</a>
    </header>`);
}

export const msg = (id, t, ok) => {
  document.getElementById(id).innerHTML = `<div class="admin-msg ${ok ? 'ok' : ''}">${esc(t)}</div>`;
};
