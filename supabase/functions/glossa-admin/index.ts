// glossa-admin — puente entre el panel de Glossa y la base.
//
// Por qué existe: el panel corre en Vercel. Darle la service key de Supabase
// pondría acceso TOTAL a la base detrás de una ruta web nueva, en un sitio que
// hasta ahora era 100 % estático y por tanto inmune a casi todo. En su lugar,
// Vercel guarda solo el token estrecho `x-glossa-token` y esta función expone
// exactamente las operaciones que el panel necesita, ni una más.
//
// Desplegada con verify_jwt=false, igual que glossa-enqueue: la compuerta es el
// token, no un JWT de Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS, requireToken } from '../_shared/auth.ts';

const sb = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ok  = (data: unknown) => new Response(JSON.stringify(data), { headers: CORS });
const bad = (msg: string, status = 400) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: CORS });

async function huella(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
}

/** Un feed debe responder y parecer XML antes de darlo de alta. */
async function feedResponde(url: string) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return { ok: false, error: `el feed respondió ${r.status}` };
    const txt = (await r.text()).slice(0, 2000);
    if (!/<(rss|feed)\b/i.test(txt)) return { ok: false, error: 'la URL responde pero no es un RSS/Atom' };
    const nombre = (txt.match(/<title[^>]*>([^<]{1,120})</i) || [])[1];
    return { ok: true, nombre: nombre ? nombre.trim() : undefined };
  } catch (e) {
    return { ok: false, error: `no se pudo leer el feed: ${String(e).slice(0, 120)}` };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return bad('POST only', 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad('cuerpo JSON inválido'); }

  const auth = requireToken(req, CORS, b?.token);
  if (!auth.ok) return auth.response;

  const db = sb();
  try {
    switch (b.op) {
      // ── Fuentes ──────────────────────────────────────────────────────────
      case 'sources.list': {
        const { data, error } = await db.from('glossa_radar_sources')
          .select('*').order('active', { ascending: false }).order('name');
        if (error) throw error;
        return ok({ sources: data });
      }
      case 'sources.check':
        return ok(await feedResponde(String(b.feed_url || '')));

      case 'sources.create': {
        const feed_url = String(b.feed_url || '').trim();
        if (!/^https?:\/\//i.test(feed_url)) return bad('la URL debe empezar por http(s)://');
        const kind = String(b.kind || 'rss');
        if (!['youtube', 'podcast', 'rss'].includes(kind)) return bad('tipo inválido');
        // Se comprueba antes de guardar: una fuente rota que falla cada noche en
        // silencio es peor que un error ahora.
        const chequeo = await feedResponde(feed_url);
        if (!chequeo.ok) return bad(chequeo.error!);
        const { data, error } = await db.from('glossa_radar_sources')
          .insert({ kind, feed_url, name: String(b.name || chequeo.nombre || feed_url).slice(0, 120),
                    homepage: b.homepage ?? null, notes: b.notes ?? null })
          .select().single();
        if (error) return bad(error.code === '23505' ? 'esa fuente ya está dada de alta' : error.message);
        return ok({ source: data });
      }
      case 'sources.toggle': {
        const { data, error } = await db.from('glossa_radar_sources')
          .update({ active: !!b.active }).eq('id', b.id).select().single();
        if (error) throw error;
        return ok({ source: data });
      }
      case 'sources.delete': {
        const { error } = await db.from('glossa_radar_sources').delete().eq('id', b.id);
        if (error) throw error;
        return ok({ deleted: true });
      }

      // ── Bandeja ──────────────────────────────────────────────────────────
      case 'inbox.add': {
        const url = String(b.url || '').trim();
        const texto = String(b.body_text || '').trim();
        if (!url && !texto) return bad('hace falta un enlace o el texto');
        const { data, error } = await db.from('glossa_radar_items').insert({
          source_id: null,
          origin: 'pegado',
          // Sin fuente, el identificador único es la URL o una huella del texto.
          external_id: url || `pegado:${await huella(texto)}`,
          url: url || 'about:blank',
          title: String(b.title || '').slice(0, 300) || '(sin título)',
          author: b.author ?? null,
          published_at: b.published_at ?? new Date().toISOString(),
          body_text: texto || null,
          note: b.note ?? null,
          state: 'pending',
        }).select('id,title').single();
        if (error) return bad(error.code === '23505' ? 'eso ya está en la bandeja' : error.message);
        return ok({ item: data });
      }
      case 'inbox.list': {
        const { data, error } = await db.from('glossa_radar_items')
          .select('id,title,url,origin,state,note,published_at,digested_at,error')
          .eq('origin', 'pegado').order('published_at', { ascending: false }).limit(60);
        if (error) throw error;
        return ok({ items: data });
      }
      case 'inbox.delete': {
        const { error } = await db.from('glossa_radar_items').delete().eq('id', b.id).eq('origin', 'pegado');
        if (error) throw error;
        return ok({ deleted: true });
      }

      // ── Número semanal ───────────────────────────────────────────────────
      case 'weekly.latest': {
        const { data, error } = await db.from('glossa_radar_weekly')
          .select('*').order('week_start', { ascending: false }).limit(1).maybeSingle();
        if (error) throw error;
        return ok({ issue: data });
      }
      case 'weekly.rebuild': {
        // Se delega en glossa-weekly-run, que es quien sabe armarlo. Tarda ~60 s:
        // el panel avisa de la espera en vez de parecer colgado.
        const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/glossa-weekly-run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-glossa-token': Deno.env.get('GLOSSA_PUBLISH_TOKEN')! },
          body: JSON.stringify({ semana: b.semana ?? null }),
        });
        return new Response(await r.text(), { status: r.status, headers: CORS });
      }

      // ── Estado general ───────────────────────────────────────────────────
      case 'status': {
        const [srcs, items, topics] = await Promise.all([
          db.from('glossa_radar_sources').select('id,active'),
          db.from('glossa_radar_items').select('state'),
          db.from('glossa_radar_topics').select('id').is('merged_into', null),
        ]);
        const porEstado: Record<string, number> = {};
        (items.data || []).forEach((i: { state: string }) => { porEstado[i.state] = (porEstado[i.state] || 0) + 1; });
        return ok({
          sources: { total: srcs.data?.length || 0, active: (srcs.data || []).filter((s: { active: boolean }) => s.active).length },
          items: porEstado,
          topics: topics.data?.length || 0,
        });
      }

      // ── Ajustes ──────────────────────────────────────────────────────────
      case 'settings.get': {
        const { data, error } = await db.from('glossa_radar_settings').select('key,value');
        if (error) throw error;
        return ok({ settings: Object.fromEntries((data || []).map((r: { key: string; value: unknown }) => [r.key, r.value])) });
      }
      case 'settings.set': {
        const { error } = await db.from('glossa_radar_settings')
          .upsert({ key: String(b.key), value: b.value, updated_at: new Date().toISOString() });
        if (error) throw error;
        return ok({ saved: true });
      }

      default:
        return bad(`operación desconocida: ${b.op}`);
    }
  } catch (e) {
    return bad(String(e).slice(0, 300), 500);
  }
});
