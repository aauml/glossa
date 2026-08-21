// glossa-enqueue — encola una publicación desde superficies sin git (chat/móvil).
// El chat hace POST con el artículo en JSON; insertamos la fila con la service key
// (lado servidor), lo que dispara el trigger glossa_publish_dispatch -> GitHub Action.
// Desplegada en Supabase phd-kb (wtwuvrtmadnlezkbesqp) con verify_jwt=false.
//
// NO es pública: `verify_jwt=false` solo significa que no exigimos un JWT de
// Supabase (el chat no lo tiene). La compuerta es la cabecera `x-glossa-token`
// (ver _shared/auth.ts). Sin ella, cualquiera en internet podía encolar un MDX
// que acababa commiteado en `main` y desplegado en glossa.ademas.ai.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS, ISSUE_NO_RE, requireToken, SLUG_RE } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: CORS });

  // El cuerpo se lee antes de autenticar porque el token puede venir dentro.
  // Un cuerpo ilegible se rechaza como 400 sin tocar la base.
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'cuerpo JSON inválido' }), { status: 400, headers: CORS });
  }

  const auth = requireToken(req, CORS, b?.token);
  if (!auth.ok) return auth.response;

  try {
    if (!b || !b.slug || !b.body_en) {
      return new Response(JSON.stringify({ error: 'slug and body_en are required' }), { status: 400, headers: CORS });
    }
    // El slug se convierte en una ruta de fichero en el worker: validarlo aquí
    // además de allí (el worker es la última línea, esta es la primera).
    const slug = String(b.slug);
    if (!SLUG_RE.test(slug)) {
      return new Response(JSON.stringify({ error: 'slug inválido: [a-z0-9-], 2-80 caracteres' }), { status: 400, headers: CORS });
    }
    const issueNo = b.issue_no == null ? null : String(b.issue_no);
    if (issueNo !== null && !ISSUE_NO_RE.test(issueNo)) {
      return new Response(JSON.stringify({ error: 'issue_no inválido: formato "N° 33"' }), { status: 400, headers: CORS });
    }

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await sb
      .from('glossa_publish_requests')
      .insert({
        slug,
        issue_no: issueNo,
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
