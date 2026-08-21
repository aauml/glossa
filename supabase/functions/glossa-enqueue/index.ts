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

    // Procedencia opcional en el propio payload.
    //
    // Tras la migración 0007, `anon` no puede escribir `glossa_issues` ni
    // `glossa_issue_targets` — y con razón: abrirlo a anon es abrirlo a internet.
    // Pero eso dejaba al skill dependiendo de si su conector autentica como
    // `authenticated` o no. Escribirlo aquí lo resuelve: esta función ya corre
    // con service key detrás del token, así que la procedencia entra por la
    // misma puerta que el artículo, y funcione el conector como funcione.
    const prov = (b.provenance ?? null) as Record<string, unknown> | null;
    let issueId = (b.issue_id ?? null) as string | null;
    const escrito: Record<string, unknown> = {};

    if (prov) {
      try {
        if (prov.seed && !prov.seed_id) {
          const { data: seed, error: e } = await sb.from('glossa_seeds')
            .insert(prov.seed as Record<string, unknown>).select('id').single();
          if (e) throw new Error(`seed: ${e.message}`);
          (prov.issue as Record<string, unknown> | undefined) &&
            ((prov.issue as Record<string, unknown>).seed_id = seed.id);
          escrito.seed_id = seed.id;
        }
        if (prov.issue && !issueId) {
          const { data: issue, error: e } = await sb.from('glossa_issues')
            .insert({ ...(prov.issue as Record<string, unknown>), slug, issue_no: issueNo })
            .select('id').single();
          if (e) throw new Error(`issue: ${e.message}`);
          issueId = issue.id;
          escrito.issue_id = issue.id;
        }
        if (issueId && Array.isArray(prov.sources) && prov.sources.length) {
          const filas = (prov.sources as Record<string, unknown>[]).map(x => ({ ...x, issue_id: issueId }));
          const { error: e } = await sb.from('glossa_issue_sources').upsert(filas, { onConflict: 'issue_id,source_kb_id' });
          if (e) throw new Error(`sources: ${e.message}`);
          escrito.sources = filas.length;
        }
        if (issueId && Array.isArray(prov.targets) && prov.targets.length) {
          const filas = (prov.targets as Record<string, unknown>[]).map(x => ({ ...x, issue_id: issueId }));
          const { error: e } = await sb.from('glossa_issue_targets').upsert(filas, { onConflict: 'issue_id,work_slug,section_ref' });
          if (e) throw new Error(`targets: ${e.message}`);
          escrito.targets = filas.length;
        }
      } catch (e) {
        // La procedencia que falla no debe tumbar la publicación, pero tampoco
        // desaparecer en silencio: se devuelve para que el chat pueda reportarlo.
        escrito.error = String(e);
      }
    }

    const { data, error } = await sb
      .from('glossa_publish_requests')
      .insert({
        slug,
        issue_no: issueNo,
        issue_id: issueId,
        body_en: String(b.body_en),
        body_es: b.body_es ?? null,
        sources_json: b.sources_json ?? null,
        requested_by: b.requested_by ?? 'chat',
        state: 'queued',
      })
      .select('id')
      .single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });
    return new Response(JSON.stringify({
      ok: true,
      id: data.id,
      provenance: prov ? escrito : undefined,
      poll: `select state, url_en, url_es, error from glossa_publish_requests where id = '${data.id}'`,
    }), { headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
