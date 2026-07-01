// Glossa Fase 2 — corre la investigación de una solicitud encolada y escribe el dossier.
// La usa .github/workflows/glossa-research.yml (repository_dispatch glossa_research).
// Fuentes: KB (edge function pública semantic-search) + OpenAlex (sin clave) + Tavily (si hay clave).
// Tolerante a fallos: cada fuente va en su try/catch; el dossier incluye lo que respondió.
//
// Uso: node scripts/research_from_supabase.mjs <request_id>
// Env: SUPABASE_URL, SUPABASE_KEY (anon pública), OPENALEX_MAILTO?, TAVILY_API_KEY? (opcional)

const [, , id] = process.argv;
const URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const MAILTO = process.env.OPENALEX_MAILTO || 'glossa@ademas.ai';
const TAVILY = process.env.TAVILY_API_KEY || '';

if (!URL || !KEY) { console.error('Missing SUPABASE_URL / SUPABASE_KEY'); process.exit(1); }
if (!id) { console.error('usage: research_from_supabase.mjs <request_id>'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const T = `${URL}/rest/v1/glossa_research_requests`;

async function getRow() {
  const r = await fetch(`${T}?id=eq.${id}&select=*`, { headers: H });
  if (!r.ok) throw new Error(`get ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  if (!rows.length) throw new Error(`request not found: ${id}`);
  return rows[0];
}
async function patch(body) {
  const r = await fetch(`${T}?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`patch ${r.status}: ${await r.text()}`);
}

// --- KB via public semantic-search edge function ---
async function searchKB(query) {
  const r = await fetch(`${URL}/functions/v1/semantic-search`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ query, match_count: 10, match_threshold: 0.35 }),
  });
  if (!r.ok) throw new Error(`semantic-search ${r.status}`);
  const j = await r.json();
  const arr = Array.isArray(j) ? j : (j.results || j.data || j.matches || []);
  return arr.map((x) => ({
    pk: x.pk, title: x.title, url: x.url, source: x.source,
    importance: x.importance, thesis_relevance: x.thesis_relevance,
    similarity: x.similarity ?? x.score ?? null,
  }));
}

// --- OpenAlex (keyless, polite pool) ---
async function searchOpenAlex(query) {
  const u = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=8&sort=relevance_score:desc&mailto=${encodeURIComponent(MAILTO)}`;
  const r = await fetch(u, { headers: { 'User-Agent': `glossa (${MAILTO})` } });
  const j = await r.json();
  if (!r.ok || !Array.isArray(j.results)) throw new Error(`openalex: ${j.error || r.status}`);
  return j.results.map((w) => ({
    title: w.title,
    url: w.doi || w.id,
    year: w.publication_year,
    venue: (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || null,
    cited_by: w.cited_by_count,
    authors: (w.authorships || []).slice(0, 4).map((a) => a.author && a.author.display_name).filter(Boolean),
  }));
}

// --- Tavily (optional; needs key) ---
async function searchTavily(query) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST', headers: { Authorization: `Bearer ${TAVILY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, search_depth: 'basic', max_results: 6, include_answer: true }),
  });
  if (!r.ok) throw new Error(`tavily ${r.status}`);
  const j = await r.json();
  return {
    answer: j.answer || null,
    results: (j.results || []).map((x) => ({ title: x.title, url: x.url, snippet: x.content, score: x.score })),
  };
}

(async () => {
  try {
    const row = await getRow();
    await patch({ state: 'running' });
    const query = row.query;
    const dossier = { query, track: row.track, generated_at: new Date().toISOString(), kb: [], academic: [], web: [], web_answer: null, notes: [] };

    try { dossier.kb = await searchKB(query); } catch (e) { dossier.notes.push(`kb: ${String(e)}`); }
    try { dossier.academic = await searchOpenAlex(query); } catch (e) { dossier.notes.push(`openalex: ${String(e)}`); }
    if (TAVILY) {
      try { const t = await searchTavily(query); dossier.web = t.results; dossier.web_answer = t.answer; }
      catch (e) { dossier.notes.push(`tavily: ${String(e)}`); }
    } else {
      dossier.notes.push('web: sin TAVILY_API_KEY (frontera web desactivada; KB + OpenAlex activos)');
    }
    dossier.counts = { kb: dossier.kb.length, academic: dossier.academic.length, web: dossier.web.length };

    await patch({ state: 'done', dossier, done_at: new Date().toISOString() });
    console.log(`done: KB ${dossier.counts.kb}, academic ${dossier.counts.academic}, web ${dossier.counts.web}`);
  } catch (e) {
    console.error(String(e));
    try { await patch({ state: 'error', error: String(e).slice(0, 2000), done_at: new Date().toISOString() }); } catch {}
    process.exit(1);
  }
})();
