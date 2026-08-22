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
import { idDeCanal } from '../_shared/feeds.ts';

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

/**
 * Un enlace de canal de YouTube no es su feed, y la forma en que la gente copia
 * un canal —`youtube.com/@handle`— ni siquiera contiene el id del canal. Hay que
 * resolverlo pidiendo la página, cosa que el navegador no puede hacer por CORS;
 * por eso vive aquí. Salió probándolo: pegar el @handle daba "no es un RSS".
 */
async function resolverYouTube(url: string) {
  if (/\/feeds\/videos\.xml/.test(url)) return url;
  if (/youtube\.com\/channel\/UC[\w-]+/.test(url)) return url;
  const canal = /youtube\.com\/channel\/(UC[\w-]+)/.exec(url);
  if (canal) return `https://www.youtube.com/feeds/videos.xml?channel_id=${canal[1]}`;
  if (!/youtube\.com\/(@|c\/|user\/)/.test(url)) return url;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow', signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return url;
    const html = await r.text();
    // OJO con el orden. `"channelId"` aparece decenas de veces en la página —una
    // por cada vídeo recomendado— y coger la primera devolvía el canal de OTRO.
    // Habría dado de alta un canal distinto al pedido sin que nadie lo notara.
    // `canonical`, `externalId` y `browseId` sí identifican LA página.
    const id =
      /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)"/.exec(html) ||
      /"externalId":"(UC[\w-]+)"/.exec(html) ||
      /"browseId":"(UC[\w-]+)"/.exec(html);
    // Se guarda la URL del canal, no la del RSS: ese endpoint murió y la URL
    // canónica del canal es la que sigue siendo válida.
    return id ? `https://www.youtube.com/channel/${id[1]}` : url;
  } catch { return url; }
}

/**
 * Un canal de YouTube se comprueba contra la API oficial, no contra el RSS: ese
 * endpoint devuelve 404 desde el 2026-08-21 para todos los canales.
 */
async function canalResponde(url: string) {
  const canal = idDeCanal(url);
  if (!canal) return { ok: false, error: 'could not work out the channel id from that URL' };
  const key = Deno.env.get('GLOSSA_YOUTUBE_KEY');
  if (!key) return { ok: false, error: 'YouTube API key not configured' };
  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${canal}&key=${key}`,
      { signal: AbortSignal.timeout(12_000) });
    const d = await r.json();
    if (!r.ok) return { ok: false, error: `YouTube API: ${String(d?.error?.message ?? r.status).slice(0, 120)}` };
    const it = (d.items ?? [])[0];
    if (!it) return { ok: false, error: 'no channel with that id' };
    return { ok: true, nombre: it.snippet?.title, videos: it.statistics?.videoCount };
  } catch (e) {
    return { ok: false, error: `could not reach the YouTube API: ${String(e).slice(0, 100)}` };
  }
}

/** Un feed debe responder y parecer XML antes de darlo de alta. */
async function feedResponde(url: string) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return { ok: false, error: `the feed responded ${r.status}` };
    const txt = (await r.text()).slice(0, 2000);
    if (!/<(rss|feed)\b/i.test(txt)) return { ok: false, error: 'that URL responds but is not an RSS/Atom feed' };
    const nombre = (txt.match(/<title[^>]*>([^<]{1,120})</i) || [])[1];
    return { ok: true, nombre: nombre ? nombre.trim() : undefined };
  } catch (e) {
    return { ok: false, error: `could not read the feed: ${String(e).slice(0, 120)}` };
  }
}

// ── La caja ───────────────────────────────────────────────────────────────
//
// Una sola entrada para todo: un enlace, un texto pegado, o dos palabras que
// son un tema. Decidir qué es tiene que pasar AQUÍ y no en el navegador, porque
// resolver un `@handle`, olfatear si una URL es un feed o leer el título de un
// sitio necesitan peticiones que CORS prohíbe desde una página. Hacerlo en el
// navegador significaría dos implementaciones de las mismas reglas, y la del
// navegador siempre sería la equivocada.
//
// La regla que gobierna esto: adivinar está permitido, adivinar en silencio no.
// Todo lo ambiguo vuelve con `alternativas` para que corregirlo sea un clic.

type Resuelto = {
  as: 'fuente' | 'elemento';
  kind?: string;
  label: string;
  name?: string;
  feed_url?: string;
  url?: string;
  body_text?: string;
  alternativas?: { as: string; kind?: string; label: string }[];
  aviso?: string;
};

const ES_URL = /^https?:\/\/\S+$/i;
const primeraUrl = (t: string) => (t.match(/https?:\/\/\S+/) || [])[0];

/** Título legible de una página que no es un feed: `og:site_name` y si no, `<title>`. */
async function nombreDeSitio(url: string) {
  try {
    const r = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!r.ok) return undefined;
    const html = (await r.text()).slice(0, 40_000);
    const og = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']{1,120})["']/i.exec(html);
    if (og) return og[1].trim();
    const t = /<title[^>]*>([^<]{1,160})</i.exec(html);
    // «Portada | El País» → «El País» no; el nombre suele ir DETRÁS del separador
    // en unos sitios y delante en otros. Se queda el trozo más largo, que acierta
    // más veces que cualquier regla de posición.
    if (!t) return undefined;
    const partes = t[1].split(/\s+[|—–·-]\s+/).map(x => x.trim()).filter(Boolean);
    return (partes.sort((a, b) => b.length - a.length)[0] || t[1]).trim();
  } catch { return undefined; }
}

/** ¿Este dominio publica un feed? Devuelve la URL del feed si lo encuentra. */
async function buscarFeed(origen: string) {
  for (const ruta of ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml']) {
    const u = origen.replace(/\/+$/, '') + ruta;
    const r = await feedResponde(u);
    if (r.ok) return { feed_url: u, nombre: r.nombre };
  }
  // Y si no está en las rutas de siempre, preguntarle a la propia página.
  try {
    const r = await fetch(origen, {
      redirect: 'follow', signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 60_000);
    const m = /<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi;
    for (const tag of html.match(m) ?? []) {
      const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
      if (!href) continue;
      const abs = new URL(href, origen).toString();
      const c = await feedResponde(abs);
      if (c.ok) return { feed_url: abs, nombre: c.nombre };
    }
  } catch { /* la página no responde: no hay feed que encontrar */ }
  return null;
}

async function clasificar(texto: string): Promise<Resuelto> {
  const t = String(texto ?? '').trim();
  if (!t) return { as: 'elemento', label: 'nothing to add' };

  const lineas = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const url = primeraUrl(t);

  // Un enlace en la primera línea y texto debajo: el caso de pegar un artículo
  // entero con su procedencia. Es lo más rico que puede entrar.
  if (url && lineas.length > 1 && ES_URL.test(lineas[0])) {
    return {
      as: 'elemento', url, body_text: lineas.slice(1).join('\n'),
      label: 'an article, with its text',
      name: lineas[1].slice(0, 120),
    };
  }

  // Texto largo o con saltos, sin ser una URL suelta: material pegado.
  if (!ES_URL.test(t) && (lineas.length > 1 || t.length > 400)) {
    return {
      as: 'elemento', body_text: t,
      label: 'pasted text',
      name: lineas[0].slice(0, 120),
    };
  }

  if (ES_URL.test(t)) {
    let u: URL;
    try { u = new URL(t); } catch { return { as: 'elemento', body_text: t, label: 'pasted text' }; }
    const host = u.hostname.replace(/^www\./, '');
    const ruta = u.pathname;

    // Un vídeo suelto de YouTube — no el canal.
    if (/(^|\.)youtu\.be$/.test(host) ||
        (/(^|\.)youtube\.com$/.test(host) && (/^\/watch/.test(ruta) || /^\/shorts\//.test(ruta)))) {
      return { as: 'elemento', url: t, label: 'one YouTube episode' };
    }

    // Un canal.
    if (/(^|\.)youtube\.com$/.test(host) && /^\/(@|channel\/|c\/|user\/)/.test(ruta)) {
      const resuelto = await resolverYouTube(t);
      const chk = await canalResponde(resuelto);
      return {
        as: 'fuente', kind: 'youtube', feed_url: resuelto,
        name: chk.ok ? chk.nombre : undefined,
        label: chk.ok
          ? `a YouTube channel · ${chk.nombre}${chk.videos ? ` · ${Number(chk.videos).toLocaleString()} videos` : ''}`
          : `a YouTube channel — but it did not answer: ${chk.error}`,
        aviso: chk.ok ? undefined : chk.error,
        alternativas: [{ as: 'elemento', label: 'one episode' }],
      };
    }

    // ¿Es un feed? No se deduce de la forma de la URL: `feeds.megaphone.fm/
    // breakingpoints` es un podcast y no termina en `.xml` ni en `/feed`, y una
    // lista de dominios conocidos siempre estaría incompleta. Se le pregunta a
    // la propia URL, que es una petición y una respuesta definitiva.
    const pareceFeed = /\.(xml|rss)$/i.test(ruta) || /\/(feed|rss)\/?$/i.test(ruta) ||
                       /^feeds?\./i.test(host) || /\/(feed|rss|podcast)s?\//i.test(ruta);
    const chkFeed = ruta !== '/' && ruta !== '' ? await feedResponde(t) : { ok: false };

    if (chkFeed.ok || pareceFeed) {
      const chk = chkFeed.ok ? chkFeed : await feedResponde(t);
      // `<itunes:` es lo que separa un podcast de un medio escrito, y sale en la
      // cabecera del feed, así que basta con lo que ya se descargó para validarlo.
      let kind = 'rss';
      try {
        const r = await fetch(t, { redirect: 'follow', signal: AbortSignal.timeout(10_000) });
        if (/<itunes:|<enclosure[^>]+type=["']audio/i.test((await r.text()).slice(0, 4000))) kind = 'podcast';
      } catch { /* se queda en rss */ }
      return {
        as: 'fuente', kind, feed_url: t, name: chk.ok ? chk.nombre : undefined,
        label: chk.ok ? `a ${kind === 'podcast' ? 'podcast' : 'feed'} · ${chk.nombre ?? 'untitled'}`
                      : `it looks like a feed but did not answer: ${chk.error}`,
        aviso: chk.ok ? undefined : chk.error,
      };
    }

    // Solo el dominio: probablemente quiere seguir el medio entero.
    if (ruta === '/' || ruta === '') {
      const hallado = await buscarFeed(u.origin);
      if (hallado) {
        return {
          as: 'fuente', kind: 'rss', feed_url: hallado.feed_url,
          name: hallado.nombre ?? await nombreDeSitio(u.origin) ?? host,
          label: `the outlet ${hallado.nombre ?? host} · found its feed`,
          alternativas: [{ as: 'fuente', kind: 'tema', label: 'a topic limited to this site' }],
        };
      }
      const nombre = await nombreDeSitio(u.origin) ?? host;
      return {
        as: 'fuente', kind: 'tema', name: nombre,
        label: `${nombre} publishes no feed — it would be followed by searching the site`,
        alternativas: [{ as: 'elemento', label: 'just this page, once' }],
      };
    }

    // Cualquier otra URL con ruta: un artículo concreto.
    return {
      as: 'elemento', url: t,
      label: `one article from ${host}`,
      alternativas: [{ as: 'fuente', kind: 'rss', label: `follow ${host} from now on` }],
    };
  }

  // Sin URL y corto: un tema a buscar. La coma o el punto final delatan una
  // frase, y una frase es texto pegado, no un tema.
  const palabras = t.split(/\s+/).length;
  if (palabras <= 10 && !/[.;:!?]$/.test(t)) {
    // Un nombre propio de dos o tres palabras, todas capitalizadas, es una
    // persona: se busca distinto que un tema (ver el paso de monitores).
    const esNombre = palabras >= 2 && palabras <= 3 &&
      t.split(/\s+/).every(w => /^[A-ZÁÉÍÓÚÑ][\p{L}'’-]+$/u.test(w));
    return {
      as: 'fuente', kind: esNombre ? 'persona' : 'tema', name: t,
      label: esNombre ? `a person to follow · ${t}` : `a topic to search · ${t}`,
      alternativas: [
        { as: 'fuente', kind: esNombre ? 'tema' : 'persona',
          label: esNombre ? 'treat it as a topic' : 'treat it as a person' },
      ],
    };
  }

  return { as: 'elemento', body_text: t, label: 'pasted text', name: lineas[0]?.slice(0, 120) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return bad('POST only', 405);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad('invalid JSON body'); }

  const auth = requireToken(req, CORS, b?.token);
  if (!auth.ok) return auth.response;

  const db = sb();
  try {
    switch (b.op) {
      // ── La caja ──────────────────────────────────────────────────────────
      case 'intake.peek': {
        // Solo mira. No escribe nada, así que se puede llamar mientras se teclea.
        return ok(await clasificar(String(b.texto ?? '')));
      }

      case 'intake.add': {
        const texto = String(b.texto ?? '').trim();
        if (!texto) return bad('nothing to add');

        // Se vuelve a resolver AQUÍ aunque el navegador ya lo hubiera hecho: lo
        // que llega del cliente sirve para elegir rama, nunca como dato.
        const r = await clasificar(texto);
        const forzado = String(b.as ?? '');
        const kindForzado = String(b.kind ?? '');

        if (forzado === 'fuente' || (forzado === '' && r.as === 'fuente')) {
          const kind = kindForzado || r.kind || 'rss';
          const buscada = kind === 'tema' || kind === 'persona';

          if (!buscada && !r.feed_url) return bad('could not work out what to follow there');
          const nombre = (r.name || r.feed_url || texto).slice(0, 120);

          const fila: Record<string, unknown> = {
            kind, name: nombre, notes: b.notes ?? null,
            feed_url: buscada ? null : r.feed_url,
          };
          const { data, error } = await db.from('glossa_radar_sources')
            .insert(fila).select('*').single();
          if (error) {
            if ((error as { code?: string }).code === '23505') return bad('that source is already registered');
            throw error;
          }
          return ok({ as: 'fuente', source: data, label: r.label });
        }

        // Elemento suelto: entra en la misma cola que todo lo demás.
        const url = r.url ?? (ES_URL.test(texto) ? texto : null);
        const cuerpo = r.body_text ?? null;
        if (!url && !cuerpo) return bad('a link or the text is required');

        const { data, error } = await db.from('glossa_radar_items').insert({
          source_id: null, origin: 'pegado',
          external_id: url ?? ('pegado:' + await huella(cuerpo!)),
          url: url ?? 'about:blank',
          title: (r.name || url || cuerpo || '').slice(0, 300) || '(sin título)',
          author: b.author ?? null,
          body_text: cuerpo,
          published_at: new Date().toISOString(),
          state: 'pending',
        }).select('id,title').single();
        if (error) {
          if ((error as { code?: string }).code === '23505') return bad('that is already in the queue');
          throw error;
        }
        return ok({ as: 'elemento', item: data, label: r.label });
      }

      // ── El panel ─────────────────────────────────────────────────────────
      case 'sources.panel': {
        // Una sola consulta con los pendientes ya contados. Pedirlos por fuente
        // serían veinte viajes para pintar una tabla.
        const { data, error } = await db.rpc('glossa_radar_fuentes_panel');
        if (error) throw error;
        return ok({ sources: data ?? [] });
      }

      case 'queue.list': {
        // Todo lo que no viene de un feed —pegado y, en su momento, hallado por
        // búsqueda— más lo que esté fallando, venga de donde venga. Es la vista
        // de «qué he metido yo y en qué anda».
        const { data, error } = await db.from('glossa_radar_items')
          .select('id,title,url,origin,state,published_at,digested_at,error,glossa_radar_sources(name)')
          .or('origin.neq.feed,state.eq.error')
          .order('created_at', { ascending: false }).limit(40);
        if (error) throw error;
        return ok({ items: data ?? [] });
      }

      // ── Fuentes ──────────────────────────────────────────────────────────
      case 'sources.list': {
        const { data, error } = await db.from('glossa_radar_sources')
          .select('*').order('active', { ascending: false }).order('name');
        if (error) throw error;
        return ok({ sources: data });
      }
      case 'sources.check': {
        const url = await resolverYouTube(String(b.feed_url || '').trim());
        const esYT = String(b.kind || '') === 'youtube' || !!idDeCanal(url);
        return ok({ ...(esYT ? await canalResponde(url) : await feedResponde(url)), feed_url: url });
      }

      case 'sources.create': {
        const bruta = String(b.feed_url || '').trim();
        if (!/^https?:\/\//i.test(bruta)) return bad('the URL must start with http(s)://');
        const feed_url = await resolverYouTube(bruta);
        const kind = String(b.kind || 'rss');
        if (!['youtube', 'podcast', 'rss'].includes(kind)) return bad('invalid type');
        // Se comprueba antes de guardar: una fuente rota que falla cada noche en
        // silencio es peor que un error ahora.
        const chequeo = kind === 'youtube' ? await canalResponde(feed_url) : await feedResponde(feed_url);
        if (!chequeo.ok) return bad(chequeo.error!);
        const { data, error } = await db.from('glossa_radar_sources')
          .insert({ kind, feed_url, name: String(b.name || chequeo.nombre || feed_url).slice(0, 120),
                    homepage: b.homepage ?? null, notes: b.notes ?? null })
          .select().single();
        if (error) return bad(error.code === '23505' ? 'that source is already registered' : error.message);
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
        if (!url && !texto) return bad('a link or the text is required');
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
        if (error) return bad(error.code === '23505' ? 'that is already in the inbox' : error.message);
        return ok({ item: data });
      }
      case 'inbox.list': {
        const { data, error } = await db.from('glossa_radar_items')
          .select('id,title,url,origin,state,note,published_at,digested_at,error')
          .neq('origin', 'feed').order('published_at', { ascending: false }).limit(60);
        if (error) throw error;
        return ok({ items: data });
      }
      case 'inbox.delete': {
        const { error } = await db.from('glossa_radar_items').delete().eq('id', b.id).neq('origin', 'feed');
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
      // Publicar y retirar. Un solo campo, pero es la única compuerta que tiene
      // este sistema entre lo que escribe un modelo y lo que lee cualquiera.
      case 'weekly.publish': {
        const { data, error } = await db.from('glossa_radar_weekly')
          .update({ state: 'publicado', published_at: new Date().toISOString() })
          .eq('week_start', b.week_start).select('week_start,state').single();
        if (error) throw error;
        return ok(data);
      }
      case 'weekly.unpublish': {
        const { data, error } = await db.from('glossa_radar_weekly')
          .update({ state: 'borrador' })
          .eq('week_start', b.week_start).select('week_start,state').single();
        if (error) throw error;
        return ok(data);
      }
      case 'weekly.list': {
        const { data, error } = await db.from('glossa_radar_weekly')
          .select('week_start,week_end,state,topic_count,item_count,generated_at')
          .order('week_start', { ascending: false }).limit(30);
        if (error) throw error;
        return ok({ issues: data ?? [] });
      }

      case 'weekly.rebuild': {
        // Lo escribe el Action, no una edge function: el modelo tarda ~16 min y
        // aquí el techo son 150 s. Esto sólo aprieta el botón; el resultado
        // aparece en la base cuando termine, y el panel lo recoge al recargar.
        const r = await db.rpc('glossa_weekly_dispatch', { semana: b.semana ?? null });
        if (r.error) throw r.error;
        return ok({ lanzado: true, nota: 'El número tarda unos 15 minutos. Vuelve a cargar esta página entonces.' });
      }

      // ── Estado general ───────────────────────────────────────────────────
      case 'status': {
        const { data, error } = await db.rpc('glossa_radar_estado');
        if (error) throw error;
        return ok(data);
      }
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
        return bad(`unknown operation: ${b.op}`);
    }
  } catch (e) {
    return bad(String(e).slice(0, 300), 500);
  }
});
