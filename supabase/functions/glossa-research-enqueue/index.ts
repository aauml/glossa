// glossa-research-enqueue — encola una solicitud de research desde el chat (Fase 2).
// El chat POSTea {query, track?, context?, seed_id?}; insertamos la fila con la service key
// -> dispara glossa_research_dispatch -> GitHub Action corre KB+OpenAlex+Tavily y escribe el dossier.
// Pública (verify_jwt=false), igual que semantic-search / glossa-enqueue.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: CORS });
  try {
    const b = await req.json();
    if (!b || !b.query) return new Response(JSON.stringify({ error: 'query is required' }), { status: 400, headers: CORS });
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await sb
      .from('glossa_research_requests')
      .insert({
        query: String(b.query),
        track: b.track ?? 'general',
        context: b.context ?? null,
        seed_id: b.seed_id ?? null,
        requested_by: b.requested_by ?? 'chat',
        state: 'queued',
      })
      .select('id')
      .single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
    return new Response(JSON.stringify({ ok: true, id: data.id, poll: `select state, dossier, error from glossa_research_requests where id = '${data.id}'` }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
