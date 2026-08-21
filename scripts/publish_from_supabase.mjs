// Glossa — materializa una publicación encolada en Supabase hacia el repo.
// La usa .github/workflows/glossa-publish.yml (disparado por repository_dispatch
// desde el trigger glossa_publish_dispatch). Permite publicar desde superficies
// sin git (chat/móvil): el chat encola vía la edge function glossa-enqueue;
// este script lee la fila, escribe los MDX, y devuelve URLs/estado.
//
// Uso:
//   node scripts/publish_from_supabase.mjs prepare  <request_id>
//   node scripts/publish_from_supabase.mjs finalize <request_id> <commit_sha>
//   node scripts/publish_from_supabase.mjs fail     <request_id> "<mensaje>"
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (secreto del repo).
//
// Sobre la clave: el worker necesita UPDATE sobre glossa_publish_requests para
// devolver estado y URLs. Se intentó con la anon key pública ("worker secretless")
// y dejó de funcionar el 2026-07-01, cuando anon perdió el UPDATE; peor aún, esa
// misma apertura era la que permitía encolar desde fuera. Ahora anon queda en
// INSERT/SELECT y el escritor es la service key, que solo vive en GitHub Secrets.

import { writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const [, , cmd, id, arg] = process.argv;
const URL_BASE = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || '';
const SITE = 'https://glossa.ademas.ai';

// El slug se concatena a una ruta de fichero y el issue_no acaba en un mensaje de
// commit. Ambos vienen de una tabla, no del repo: se validan antes de usarse.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;
const ISSUE_NO_RE = /^N° \d{1,3}[a-z]?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!URL_BASE || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_KEY'); process.exit(1); }
if (!cmd || !id) { console.error('usage: prepare|finalize|fail <id> [sha|msg]'); process.exit(1); }
if (!UUID_RE.test(id)) { console.error(`request id inválido: ${id}`); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const T = `${URL_BASE}/rest/v1/glossa_publish_requests`;

async function getRow(rid) {
  const r = await fetch(`${T}?id=eq.${encodeURIComponent(rid)}&select=*`, { headers: H });
  if (!r.ok) throw new Error(`get ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  if (!rows.length) throw new Error(`request not found: ${rid}`);
  return rows[0];
}
async function patch(rid, body) {
  const r = await fetch(`${T}?id=eq.${encodeURIComponent(rid)}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`patch ${r.status}: ${await r.text()}`);
}
async function patchIssue(issueId, body) {
  if (!issueId) return;
  await fetch(`${URL_BASE}/rest/v1/glossa_issues?id=eq.${encodeURIComponent(issueId)}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
}
async function write(path, content) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); }

// GITHUB_OUTPUT es un fichero de pares clave=valor: un salto de línea en el valor
// deja al que escribe definir claves arbitrarias. Usamos siempre el delimitador
// multilínea, cuyo terminador es un GUID que el valor no puede adivinar.
let outSeq = 0;
async function out(key, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  const delim = `__glossa_${process.pid}_${outSeq++}__`;
  await appendFile(process.env.GITHUB_OUTPUT, `${key}<<${delim}\n${value ?? ''}\n${delim}\n`);
}

try {
  if (cmd === 'prepare') {
    const row = await getRow(id);
    if (!row.slug || !row.body_en) throw new Error('row missing slug or body_en');
    if (!SLUG_RE.test(row.slug)) throw new Error(`slug inválido (esperado [a-z0-9-], 2-80): ${JSON.stringify(row.slug).slice(0, 120)}`);
    if (row.issue_no && !ISSUE_NO_RE.test(row.issue_no)) throw new Error(`issue_no inválido (esperado "N° 33"): ${JSON.stringify(row.issue_no).slice(0, 120)}`);

    await patch(id, { state: 'building' });
    const dir = `src/content/articles/${row.slug}`;
    await write(`${dir}/en.mdx`, row.body_en);
    if (row.body_es) await write(`${dir}/es.mdx`, row.body_es);
    if (row.sources_json) await write(`${dir}/sources.json`, JSON.stringify(row.sources_json, null, 2) + '\n');
    await out('slug', row.slug);
    await out('issue_no', row.issue_no || '');
    await out('has_es', row.body_es ? '1' : '0');
    console.log(`prepared ${row.slug} (es=${row.body_es ? 'yes' : 'no'})`);
  } else if (cmd === 'finalize') {
    const row = await getRow(id);
    const base = `${SITE}/articles/${row.slug}`;
    const url_en = `${base}/en/`;
    const url_es = row.body_es ? `${base}/es/` : null;
    await patch(id, { state: 'done', commit_sha: arg || null, url_en, url_es, done_at: new Date().toISOString() });
    // `model` solo se toca si el workflow lo declara: mandar null borraría el
    // valor que hubiera escrito la superficie que redactó la pieza.
    const issuePatch = { status: 'published', url_en, url_es, published_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (process.env.GLOSSA_MODEL) issuePatch.model = process.env.GLOSSA_MODEL;
    await patchIssue(row.issue_id, issuePatch);
    console.log(`done ${url_en}`);
  } else if (cmd === 'fail') {
    await patch(id, { state: 'error', error: (arg || 'workflow failed').slice(0, 2000), done_at: new Date().toISOString() });
    console.log('marked error');
  } else {
    console.error('unknown cmd'); process.exit(1);
  }
} catch (e) {
  console.error(String(e));
  if (cmd === 'prepare') { try { await patch(id, { state: 'error', error: String(e).slice(0, 2000), done_at: new Date().toISOString() }); } catch {} }
  process.exit(1);
}
