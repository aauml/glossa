// glossa-research-enqueue — encola una solicitud de research desde el chat (Fase 2).
// El chat POSTea {query, track?, context?, seed_id?}; insertamos la fila con la service key
// -> dispara glossa_research_dispatch -> GitHub Action corre KB+OpenAlex+Tavily y escribe el dossier.
// verify_jwt=false (el chat no lleva JWT), pero exige `x-glossa-token`: sin la
// compuerta, cualquiera podía quemar minutos de Actions y la cuota de Tavily.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS, requireToken } from '../_shared/auth.ts';

const TRACKS = new Set(['general', 'thesis', 'ai-policy', 'finance', 'geopolitics']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: CORS });

  const auth = requireToken(req, CORS);
  if (!auth.ok) return auth.response;

  try {
    const b = await req.json();
    if (!b || !b.query) return new Response(JSON.stringify({ error: 'query is required' }), { status: 400, headers: CORS });
    const query = String(b.query).slice(0, 2000);
    const track = b.track ?? 'general';
    if (!TRACKS.has(track)) {
      return new Response(JSON.stringify({ error: `track inválido: ${[...TRACKS].join('|')}` }), { status: 400, headers: CORS });
    }

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await sb
      .from('glossa_research_requests')
      .insert({
        query,
        track,
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
