/** Acceso a Supabase con la service key. Solo el radar escribe estas tablas. */

function sb_(path, opts) {
  opts = opts || {};
  const key = prop_('SUPABASE_SERVICE_KEY');
  const res = UrlFetchApp.fetch(`${prop_('SUPABASE_URL')}/rest/v1/${path}`, {
    method: opts.method || 'get',
    contentType: 'application/json',
    headers: Object.assign({
      apikey: key,
      Authorization: `Bearer ${key}`,
      // `return=representation` para recuperar la fila insertada; sin esto
      // PostgREST devuelve 201 vacío y hay que releer.
      Prefer: opts.prefer || 'return=representation',
    }, opts.headers || {}),
    payload: opts.body ? JSON.stringify(opts.body) : undefined,
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code >= 300) throw new Error(`Supabase ${code} en ${path}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const sbSelect = (t, q) => sb_(`${t}?${q}`);
const sbInsert = (t, rows) => sb_(t, { method: 'post', body: rows });
const sbUpdate = (t, q, patch) => sb_(`${t}?${q}`, { method: 'patch', body: patch });

/** Inserta ignorando duplicados — para episodios ya vistos. */
function sbUpsertIgnore(t, rows) {
  return sb_(t, {
    method: 'post',
    body: rows,
    prefer: 'return=representation,resolution=ignore-duplicates',
  });
}
