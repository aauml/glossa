// glossa-enqueue — endpoint público para publicar desde superficies sin git (chat/móvil).
// El chat hace POST con el artículo en JSON; insertamos la fila con la service key
// (lado servidor), lo que dispara el trigger glossa_publish_dispatch -> GitHub Action.
// Patrón igual a las edge functions existentes (semantic-search, generate-reading-guidance): pública.
// Desplegada en Supabase phd-kb (wtwuvrtmadnlezkbesqp) con verify_jwt=false.
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
    if (!b || !b.slug || !b.body_en) {
      return new Response(JSON.stringify({ error: 'slug and body_en are required' }), { status: 400, headers: CORS });
    }
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await sb
      .from('glossa_publish_requests')
      .insert({
        slug: String(b.slug),
        issue_no: b.issue_no ?? null,
        issue_id: b.issue_id ?? null,
        body_en: String(b.body_en),
        body_es: b.body_es ?? null,
        sources_json: b.sources_json ?? null,
        requested_by: b.requested_by ?? 'chat',
        state: 'queued',
      })
      .select('id')
      .single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
    return new Response(JSON.stringify({ ok: true, id: data.id, poll: `select state, url_en, url_es, error from glossa_publish_requests where id = '${data.id}'` }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
