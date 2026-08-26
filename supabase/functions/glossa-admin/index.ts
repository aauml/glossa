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
/**
 * Un enlace de Apple Podcasts NO trae el feed: la página es un escaparate y el
 * RSS vive en el servidor del programa. Lo único estable de esa URL es el id
 * numérico del final (`/id1669813431`), y la API de búsqueda de Apple lo
 * cambia por el feed de verdad.
 *
 * Es pública y no pide clave. Se usa para eso y solo para eso: traducir un id a
 * una URL de feed, que luego se comprueba como cualquier otra.
 */
/**
 * Un episodio suelto de Apple Podcasts.
 *
 * `?i=<id>` identifica UN episodio; el id de la ruta identifica el PROGRAMA. El
 * clasificador solo miraba el segundo, así que pegar un episodio ofrecía seguir
 * el pódcast entero y nunca la pieza — que era justo lo que se pedía.
 *
 * La API de Apple no encuentra un episodio por su id a secas: hay que pedir los
 * del programa y buscar el que coincide. Se devuelve su descripción, que son
 * las notas del episodio: no es la transcripción, pero es texto real y a menudo
 * son dos o tres mil caracteres.
 */
/**
 * La MEJOR superficie de un programa, no la primera que se pegó.
 *
 * Apple y Spotify son escaparates: distribuyen audio y no publican texto. El
 * sitio del propio programa casi siempre sí —transcripción o notas largas— y su
 * RSS suele traer más que su web. Pegar el escaparate y quedarse ahí era
 * conformarse con lo que menos da.
 *
 * Solo mira lo que el feed ya declara (`link` del canal, `itunes:owner`): no
 * inventa dominios ni sale a buscar a ciegas.
 */
async function mejorFeed(feedUrl: string) {
  try {
    const r = await fetch(feedUrl, { redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const xml = (await r.text()).slice(0, 200_000);
    const cab = xml.split('<item>')[0];
    const sitio = /<link[^>]*>\s*(?:<!\[CDATA\[)?\s*(https?:\/\/[^<\]\s]+)/i.exec(cab)?.[1];
    if (!sitio) return null;
    const host = new URL(sitio).host.replace(/^www\./, '');
    if (/megaphone|libsyn|buzzsprout|podbean|anchor|simplecast|acast|spotify|apple/.test(host)) return null;

    // ¿Publica su propio feed? Suele traer el texto entero donde el de audio
    // solo trae notas: 262.000 caracteres contra 3.610 en el caso medido.
    for (const ruta of ['/latest/rss/', '/rss/', '/feed/', '/rss.xml', '/feed.xml']) {
      try {
        const u = new URL(ruta, sitio).href;
        const rr = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
        if (!rr.ok) continue;
        const t = (await rr.text()).slice(0, 300_000);
        if (!/<(rss|feed)[\s>]/i.test(t)) continue;
        const item = t.split('<item>')[1] ?? '';
        const cuerpo = /<content:encoded>([\s\S]*?)<\/content:encoded>/i.exec(item)?.[1] ?? '';
        const propio = cuerpo.length;
        const audio = (/<content:encoded>([\s\S]*?)<\/content:encoded>/i.exec(xml.split('<item>')[1] ?? '')?.[1] ?? '').length;
        if (propio > Math.max(audio * 2, 8000)) {
          return { feed_url: u, sitio: host, caracteres: propio };
        }
      } catch { /* siguiente ruta */ }
    }
    return null;
  } catch { return null; }
}

async function resolverEpisodioApple(url: string) {
  const ep = /[?&]i=(\d{5,})/.exec(url)?.[1];
  const prog = /\/id(\d{5,})/.exec(url)?.[1];
  if (!ep || !prog) return null;
  try {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${prog}&entity=podcastEpisode&limit=60`,
                          { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const d = await r.json();
    const x = (d?.results ?? []).find((y: Record<string, unknown>) => String(y.trackId) === ep);
    if (!x) return null;
    return {
      titulo: String(x.trackName ?? ''),
      programa: String(x.collectionName ?? ''),
      texto: String(x.description ?? ''),
      pagina: String(x.trackViewUrl ?? url),
      audio: String(x.episodeUrl ?? ''),
    };
  } catch { return null; }
}

async function resolverApple(url: string) {
  const id = /\/id(\d{5,})/.exec(url)?.[1] ?? /[?&]i=(\d{5,})/.exec(url)?.[1];
  if (!id) return { ok: false as const, error: 'that Apple Podcasts link carries no show id' };
  try {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&entity=podcast`,
                          { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return { ok: false as const, error: `Apple answered ${r.status}` };
    const d = await r.json();
    const x = (d?.results ?? [])[0];
    if (!x?.feedUrl) {
      return { ok: false as const,
               error: x ? 'Apple lists that show but publishes no feed for it'
                        : 'Apple does not know that show id' };
    }
    return { ok: true as const, feed_url: String(x.feedUrl),
             nombre: x.collectionName ? String(x.collectionName) : undefined,
             episodios: Number(x.trackCount) || undefined };
  } catch (e) {
    return { ok: false as const, error: `could not ask Apple: ${String(e).slice(0, 120)}` };
  }
}

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
// El radar solo mira siete días hacia atrás al dar de alta una fuente. Un
// programa quincenal cuyo último episodio sea de hace once días se da de alta
// bien y no trae NADA, y en el panel eso se ve como «0 en cola, 0 esta semana»
// — que en esta lista significa «muerta». Pasó con Dwarkesh y con The EU AI Act
// Newsletter: los dos correctos, los dos silenciosos, y nada que lo explicara.
const BACKFILL_DIAS = 7;

/**
 * Pide el feed y devuelve lo que hace falta para decidir: si responde, cómo se
 * llama, si es podcast, y de cuándo es su último episodio. Todo de UNA petición
 * — antes se pedía dos veces, una para el título y otra para mirar `<itunes:`.
 */
async function feedResponde(url: string) {
  try {
    const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return { ok: false as const, error: `the feed responded ${r.status}` };
    // Hasta 400 KB. Con 120 KB un feed de texto completo no llegaba ni al final
    // de su PRIMERA entrada —The Cognitive Revolution publica el transcript
    // entero—, así que el cierre `</item>` quedaba fuera del trozo, no se
    // reconocía ninguna entrada y el feed pasaba por vacío: ni fechas, ni aviso
    // de silencio, ni muestra que enseñar.
    const txt = (await r.text()).slice(0, 400_000);
    if (!/<(rss|feed)\b/i.test(txt)) {
      return { ok: false as const, error: 'that URL responds but is not an RSS/Atom feed' };
    }
    // El título puede venir en CDATA, y entonces el primer carácter tras
    // `<title>` es un `<`. Un patrón de «todo menos <» fallaba ahí y seguía
    // buscando, así que un podcast de Substack se daba de alta como «untitled».
    const nombre = (txt.match(/<title[^>]*>\s*<!\[CDATA\[([\s\S]{1,200}?)\]\]>/i) ||
                    txt.match(/<title[^>]*>([^<]{1,200})</i) || [])[1];

    // Las fechas se leen SOLO de dentro de <item>/<entry>. El <pubDate> de canal
    // y el <updated> de cabecera de Atom se refrescan a diario aunque no haya
    // episodio nuevo: mirados, `diasDesdeUltimo` daba 0 siempre y el aviso de
    // silencio —que existe para el podcast quincenal recién añadido— no saltaba
    // nunca. Justo la regresión que esta función se escribió para impedir.
    // Se corta por el COMIENZO de cada entrada, no por el par abrir/cerrar: una
    // entrada más larga que el trozo descargado no tiene cierre, y buscarlo
    // dejaba el feed entero por no leído.
    const trozos = txt.split(/<(?:item|entry)[\s>]/i).slice(1)
      .map(x => x.split(/<\/(?:item|entry)>/i)[0]);
    const fechas: number[] = [];
    for (const bloque of trozos) {
      const m = /<(?:pubDate|published|updated)[^>]*>([^<]{6,60})</i.exec(bloque);
      if (!m) continue;
      const t = Date.parse(m[1].trim());
      if (!Number.isNaN(t)) fechas.push(t);
    }
    const ultimo = fechas.length ? Math.max(...fechas) : undefined;

    // Una muestra de lo que ese feed trae de verdad: el titular de las últimas
    // entradas y cuánto texto lleva cada una. Es lo que se enseña antes de
    // pulsar «Add», porque un feed que responde no es un feed que sirva —
    // `<ruta>/rss` de El Financiero contesta y devuelve el diario entero.
    const muestras: { titulo: string; caracteres: number }[] = [];
    for (const it of trozos) {
      if (muestras.length >= 3) break;
      const tt = (it.match(/<title[^>]*>\s*<!\[CDATA\[([\s\S]{1,200}?)\]\]>/i) ||
                  it.match(/<title[^>]*>([^<]{1,200})</i) || [])[1];
      const cuerpo = (it.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) ||
                      it.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] ?? '';
      if (tt) muestras.push({
        titulo: tt.replace(/\s+/g, ' ').trim(),
        caracteres: cuerpo.replace(/<[^>]+>/g, '').trim().length,
      });
    }

    return {
      ok: true as const,
      muestras,
      nombre: nombre ? nombre.trim() : undefined,
      esPodcast: /<itunes:|<enclosure[^>]+type=["']audio/i.test(txt),
      ultimo,
      diasDesdeUltimo: ultimo === undefined
        ? undefined
        : Math.floor((Date.now() - ultimo) / 864e5),
    };
  } catch (e) {
    return { ok: false as const, error: `could not read the feed: ${String(e).slice(0, 120)}` };
  }
}

/**
 * El nombre a secas, sin el eslogan.
 *
 * Apple y muchos feeds meten el reclamo en el título: «"The Cognitive
 * Revolution" | AI Builders, Researchers, and Live Player Analysis». En una
 * lista de fuentes eso no informa de nada y empuja fuera a las demás. Se corta
 * por el separador solo cuando el título es largo y lo que queda delante sigue
 * siendo un nombre.
 */
function nombreCorto(t?: string) {
  if (!t) return t;
  let n = t.trim().replace(/^["“']|["”']$/g, '').trim();
  if (n.length <= 40) return n;
  const corte = n.split(/\s+[|—–]\s+|\s+-\s+|:\s+/)[0].trim().replace(/^["“']|["”']$/g, '').trim();
  return corte.length >= 3 ? corte : n;
}

/**
 * La URL de un feed, en una sola forma. El índice único compara texto exacto:
 * el mismo Megaphone añadido por el enlace de Apple y pegado con mayúsculas o
 * barra final se daba de alta DOS veces — dos filas sondeadas cada 6 h y los
 * episodios cayendo siempre en la que ganara la carrera del `external_id`,
 * mientras la otra acumulaba ceros y acababa señalada como callada.
 */
function normalizarFeed(u: string): string {
  try {
    const x = new URL(u.trim());
    x.protocol = x.protocol.toLowerCase();
    x.hostname = x.hostname.toLowerCase();
    x.hash = '';
    let ruta = x.pathname.replace(/\/+$/, '');
    return `${x.protocol}//${x.host}${ruta}${x.search}`;
  } catch { return u.trim(); }
}

const KINDS = new Set(['youtube', 'podcast', 'rss', 'tema', 'persona']);

/** Lo que hay que avisar cuando una fuente correcta no va a traer nada aún. */
function avisoDeSilencio(dias?: number) {
  if (dias === undefined || dias <= BACKFILL_DIAS) return undefined;
  return `its last episode is ${dias} days old, and the radar only looks ${BACKFILL_DIAS} days back — ` +
         `nothing will come in until it publishes again`;
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
  alternativas?: { as: string; kind?: string; label: string; feed_url?: string; name?: string }[];
  aviso?: string;
  saludable?: boolean;
  /**
   * Qué se encontró y qué se va a sacar de ahí, en dos o tres renglones, ANTES
   * de pulsar «Add». El rótulo dice la categoría («a feed», «one article»); esto
   * dice lo concreto —los últimos titulares, cuánto texto hay— que es lo único
   * que distingue el feed del columnista del feed del diario entero.
   */
  vista?: string[];
  /**
   * Varias puertas para lo mismo, para elegir. Se llenan cuando pegar algo
   * encuentra más de una superficie —web, podcast, YouTube, Substack—; con una
   * sola no aparece nada y el flujo es el de siempre.
   */
  opciones?: Opcion[];
};

type Opcion = {
  as: 'fuente' | 'elemento';
  kind?: string;
  label: string;
  /** La evidencia: últimos titulares, cuánto texto, cuánto cuesta. */
  detalle?: string;
  feed_url?: string;
  name?: string;
  solo?: string;
};

/** «6,483 characters» / «no text» — cómo se dice cuánto hay para leer. */
const cuanto = (n: number) => n >= 400
  ? `${n.toLocaleString()} characters of text`
  : n > 0 ? `only ${n.toLocaleString()} characters — headline and little else`
          : 'no text in the feed; the page gets fetched';

/** Los últimos titulares de un feed, para enseñar de quién es lo que trae. */
function vistaDeMuestras(muestras?: { titulo: string; caracteres: number }[]) {
  if (!muestras?.length) return [];
  const medio = Math.round(muestras.reduce((a, m) => a + m.caracteres, 0) / muestras.length);
  return [
    `Latest: ${muestras.slice(0, 2).map(m => '“' + m.titulo.slice(0, 64) + '”').join(', ')}`,
    `Each entry carries ${cuanto(medio)}`,
  ];
}

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
/**
 * El feed de UNA SECCIÓN o de un columnista, no el del diario entero.
 *
 * Pegar `elfinanciero.com.mx/opinion/raymundo-riva-palacio/` debería seguir a
 * ESE columnista. Existe el feed y responde — pero con una trampa que solo se ve
 * mirando lo que devuelve: `<ruta>/rss` contesta 200 con RSS válido y trae el
 * DIARIO ENTERO, cien entradas de MasterChef y decomisos. Habría dado de alta
 * «Riva Palacio» para recibir el periódico completo.
 *
 * Por eso no basta con que un feed responda: hay que comprobar que lo que trae
 * es de esa sección. Se exige que la mayoría de las entradas lleven la firma o
 * el tramo de la ruta, y si no, no vale.
 */
async function feedDeSeccion(u: URL) {
  const ruta = u.pathname.replace(/\/+$/, '');
  if (!ruta || ruta.split('/').filter(Boolean).length > 3) return null;
  const ultimo = ruta.split('/').filter(Boolean).pop() ?? '';
  // Palabras del último tramo: sirven para comprobar que el feed es de esto.
  const señas = ultimo.split('-').filter(w => w.length >= 4).map(w => w.toLowerCase());
  if (!señas.length) return null;

  const candidatos = [
    // El patrón de Arc (El Financiero, Reforma, El Universal y medio mundo).
    `${u.origin}/arc/outboundfeeds/rss/category${ruta}/?outputType=xml`,
    `${u.origin}${ruta}/rss`, `${u.origin}${ruta}/feed`, `${u.origin}${ruta}/rss.xml`,
  ];
  for (const url of candidatos) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(9000) });
      if (!r.ok) continue;
      const xml = (await r.text()).slice(0, 200_000);
      if (!/<(rss|feed)[\s>]/i.test(xml)) continue;
      const items = xml.split(/<item[\s>]/i).slice(1, 9);
      if (items.length < 1) continue;
      // ¿Es de ESTA sección? La firma o la ruta tienen que aparecer en la
      // mayoría de las entradas. Sin esto se cuela el feed del diario entero.
      const suyas = items.filter(it => {
        const t = it.toLowerCase();
        return señas.every(w => t.includes(w)) || t.includes(ruta.toLowerCase());
      }).length;
      if (suyas < Math.ceil(items.length * 0.6)) continue;
      const nombre = (xml.match(/<dc:creator>\s*(?:<!\[CDATA\[)?([^<\]]{3,60})/i) || [])[1];
      const muestras = items.slice(0, 3).map(it => ({
        titulo: ((it.match(/<title[^>]*>\s*(?:<!\[CDATA\[)?([^<\]]{1,200})/i) || [])[1] ?? '')
          .replace(/\s+/g, ' ').trim(),
        caracteres: ((it.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) ||
                      it.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] ?? '')
          .replace(/<[^>]+>/g, '').trim().length,
      })).filter(m => m.titulo);
      return { feed_url: url, nombre: nombre?.trim(), entradas: items.length, muestras };
    } catch { /* siguiente candidato */ }
  }
  return null;
}

/**
 * TODAS las puertas por las que se puede seguir a alguien, no la primera.
 *
 * Una persona o un programa no vive en un sitio: The Cognitive Revolution tiene
 * web con transcripts, feed de audio, canal de YouTube y Substack, y cada uno da
 * una cosa distinta —el transcript se lee entero y gratis, el audio hay que
 * escucharlo, el canal trae el vídeo—. Elegir por él una y callar las demás era
 * decidir a ciegas lo que más cambia el resultado.
 *
 * Se buscan a la vez y se devuelven las que CONTESTAN, cada una diciendo qué
 * trae. Ninguna se da de alta sin que él la marque.
 */
async function superficiesDe(entrada: { origen?: string; html?: string; nombre?: string })
    : Promise<Opcion[]> {
  const { origen, nombre } = entrada;
  let html = entrada.html;
  if (!html && origen) {
    try {
      const r = await fetch(origen, {
        redirect: 'follow', signal: AbortSignal.timeout(10_000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; glossa-radar/1.0)' },
      });
      if (r.ok) html = (await r.text()).slice(0, 300_000);
    } catch { /* sin página: quedan las búsquedas por nombre */ }
  }

  const tareas: Promise<Opcion[]>[] = [];

  // 1) Los feeds que la propia página declara — pueden ser varios: el blog, el
  //    podcast y los comentarios se declaran igual y no son lo mismo.
  if (html && origen) {
    const declarados: string[] = [];
    for (const tag of html.match(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi) ?? []) {
      const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
      if (href) { try { declarados.push(new URL(href, origen).toString()); } catch { /* href roto */ } }
    }
    for (const url of [...new Set(declarados)].slice(0, 4)) {
      tareas.push(feedResponde(url).then(c => c.ok ? [{
        as: 'fuente' as const, kind: c.esPodcast ? 'podcast' : 'rss', feed_url: url,
        name: nombreCorto(c.nombre),
        label: `${c.esPodcast ? 'Podcast feed' : 'Their own site'} · ${c.nombre ?? url}`,
        detalle: vistaDeMuestras(c.muestras).join(' · '),
      }] : []));
    }
  }

  // 2) Substack: el enlace suele estar en la página; el feed siempre es /feed.
  if (html) {
    const sub = /https?:\/\/([a-z0-9-]+)\.substack\.com/i.exec(html)?.[1];
    if (sub) {
      const url = `https://${sub}.substack.com/feed`;
      tareas.push(feedResponde(url).then(c => c.ok ? [{
        as: 'fuente' as const, kind: 'rss', feed_url: url, name: nombreCorto(c.nombre),
        label: `Substack · ${c.nombre ?? sub}`,
        detalle: vistaDeMuestras(c.muestras).join(' · '),
      }] : []));
    }
  }

  // 3) El podcast, buscado por nombre en el directorio de Apple. Sale aunque la
  //    página no lo enlace, que es el caso corriente.
  if (nombre) {
    tareas.push((async (): Promise<Opcion[]> => {
      try {
        const r = await fetch(
          `https://itunes.apple.com/search?media=podcast&entity=podcast&limit=2&term=${encodeURIComponent(nombre)}`,
          { signal: AbortSignal.timeout(9000) });
        if (!r.ok) return [];
        const d = await r.json() as { results?: { feedUrl?: string; collectionName?: string; trackCount?: number }[] };
        const out: Opcion[] = [];
        for (const res of (d.results ?? []).slice(0, 2)) {
          if (!res.feedUrl || !parecido(nombre, res.collectionName ?? '')) continue;
          const c = await feedResponde(res.feedUrl);
          if (!c.ok) continue;
          out.push({
            as: 'fuente', kind: 'podcast', feed_url: res.feedUrl, name: nombreCorto(res.collectionName),
            label: `Podcast · ${res.collectionName}`,
            detalle: [res.trackCount ? `${res.trackCount.toLocaleString()} episodes` : '',
                      ...vistaDeMuestras(c.muestras)].filter(Boolean).join(' · '),
          });
        }
        return out;
      } catch { return []; }
    })());
  }

  // 4) El canal de YouTube, por nombre. Trae el vídeo, que es lo único que se
  //    puede escuchar cuando no hay transcript en ninguna parte.
  if (nombre) tareas.push(buscarCanalYouTube(nombre));

  // 5) X: no hay feed que seguir, y decir lo contrario sería mentir. Lo que sí
  //    se puede es un monitor por nombre, que es buscar lo que dice y lo que se
  //    dice de él — y eso gasta crédito de búsqueda, así que se avisa.
  if (html) {
    const x = /https?:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{2,15})(?![A-Za-z0-9_])/i.exec(html)?.[1];
    if (x && !/^(share|intent|home|i|search)$/i.test(x)) {
      tareas.push(Promise.resolve([{
        as: 'fuente' as const, kind: 'persona', name: nombre ?? `@${x}`,
        label: `X · @${x}`,
        detalle: 'No feed exists: it gets followed by searching for what they say. Costs search credit',
      }]));
    }
  }

  const halladas = (await Promise.all(tareas)).flat();
  // Dos puertas al mismo feed —la declarada y la de Apple— son una sola opción.
  const vistas = new Set<string>();
  return halladas.filter(o => {
    const k = (o.feed_url ?? `${o.kind}:${o.name ?? o.label}`).replace(/\/+$/, '').toLowerCase();
    if (vistas.has(k)) return false;
    vistas.add(k); return true;
  }).slice(0, 6);
}

/** ¿El resultado de una búsqueda es de verdad lo que se pidió? Dos palabras en común. */
function parecido(a: string, b: string) {
  const pal = (x: string) => new Set(x.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 4));
  const A = pal(a), B = pal(b);
  if (!A.size) return false;
  const comunes = [...A].filter(w => B.has(w)).length;
  return comunes >= Math.min(2, A.size);
}

/** El canal de YouTube de alguien, buscado por nombre con la clave que ya hay. */
async function buscarCanalYouTube(nombre: string): Promise<Opcion[]> {
  const key = Deno.env.get('GLOSSA_YOUTUBE_KEY');
  if (!key) return [];
  try {
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=2' +
      `&q=${encodeURIComponent(nombre)}&key=${key}`, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) return [];
    const d = await r.json() as { items?: { id?: { channelId?: string }; snippet?: { title?: string } }[] };
    const out: Opcion[] = [];
    for (const it of d.items ?? []) {
      const id = it.id?.channelId, titulo = it.snippet?.title ?? '';
      if (!id || !parecido(nombre, titulo)) continue;
      out.push({
        as: 'fuente', kind: 'youtube', feed_url: `https://www.youtube.com/channel/${id}`,
        name: nombreCorto(titulo), label: `YouTube · ${titulo}`,
        detalle: 'Each new video is listened to; the only surface when no transcript exists anywhere',
      });
    }
    return out;
  } catch { return []; }
}

async function buscarFeed(origen: string) {
  // Probadas contra sitios reales, no inventadas: seis rutas dejaban fuera al
  // FT (/rss/home), a The Economist (/latest/rss.xml) y a El País
  // (/rss/elpais/portada.xml), que sí publican feed — el panel decía «publishes
  // no feed» de tres periódicos que lo publican.
  //
  // El orden es por probabilidad, y se para en la primera que conteste: un
  // sitio corriente resuelve en la primera o la segunda.
  for (const ruta of ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml',
                      '/rss/home', '/latest/rss.xml', '/latest/rss/', '/feed/rss',
                      '/rss/index.xml', '/feeds/all.atom.xml', '/blog/rss.xml',
                      '/rss/elpais/portada.xml', '/?feed=rss2']) {
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

/**
 * Baja un artículo y saca su título y su texto.
 *
 * Hace falta porque Gemini NO puede abrir una URL cualquiera: su `fileUri` solo
 * entiende YouTube. Un enlace pelado a un periódico se le mandaba tal cual y
 * devolvía «400 INVALID_ARGUMENT», que no dice nada de la causa. Si el texto no
 * viaja con el elemento, no hay nada que analizar.
 *
 * Lo que hay detrás de un muro de pago no se va a obtener así, y está bien: se
 * guarda lo que sea público y se ve en el panel que salió corto. Para lo de pago
 * está pegar el texto, que es lo que un suscriptor ya tiene delante.
 */
async function extraerArticulo(url: string) {
  try {
    const r = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Glossa/1.0)' },
    });
    if (!r.ok) return { error: `the page responded ${r.status}` };
    let html = (await r.text()).slice(0, 400_000);

    const meta = (prop: string) =>
      new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']{1,300})["']`, 'i')
        .exec(html)?.[1];
    const titulo = meta('og:title') ?? /<title[^>]*>([^<]{1,300})</i.exec(html)?.[1];
    const autor  = meta('article:author') ?? meta('author');
    const sitio  = meta('og:site_name');

    // Fuera lo que no es el artículo. Sin esto el texto empieza con el menú de
    // navegación —el caso real fue «Skip to contentSkip to site index»— y el
    // análisis se cree que eso es el principio de la pieza.
    html = html
      .replace(/<(script|style|noscript|svg|iframe|form)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

    // Si hay <article>, es lo que buscamos; si no, el cuerpo entero.
    const art = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(html)?.[1] ?? html;
    const texto = art
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/h[1-6]>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
      .replace(/&#39;|&rsquo;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).filter(l => l.length > 2)
      .join('\n').slice(0, 120_000);

    return {
      titulo: titulo?.trim(), autor: autor?.trim(), sitio: sitio?.trim(),
      texto: texto.length > 200 ? texto : undefined,
      corto: texto.length <= 200,
    };
  } catch (e) {
    return { error: `could not read the page: ${String(e).slice(0, 120)}` };
  }
}

/**
 * Qué se sacaría de una página concreta: su titular y cuánto texto legible hay.
 *
 * Se mira ANTES de encolar porque el fallo caro es silencioso: una página de
 * pago o dibujada con JavaScript se da de alta igual, y el vacío no aparece
 * hasta que el semanal se escribe sin ella. Dicho aquí, se decide en el momento
 * si vale la pena pegar el texto a mano.
 */
/** Qué vídeo es. oEmbed da título y canal sin gastar cuota de la API. */
async function vistaDeYouTube(url: string): Promise<string[]> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
                          { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return ['Listens to the video and writes it up from the audio'];
    const d = await r.json() as { title?: string; author_name?: string };
    return [`“${String(d.title ?? '').slice(0, 90)}”${d.author_name ? ` · ${d.author_name}` : ''}`,
            'Listens to the audio and writes it up; nothing is taken from the page'];
  } catch { return ['Listens to the video and writes it up from the audio']; }
}

async function vistaDePagina(url: string): Promise<string[]> {
  try {
    const r = await fetch(url, {
      redirect: 'follow', signal: AbortSignal.timeout(11_000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; glossa-radar/1.0)' },
    });
    if (!r.ok) return [`The page answers ${r.status}: nothing can be read from it yet`];
    const html = (await r.text()).slice(0, 900_000);
    const titulo = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{3,200})/i) ||
                    html.match(/<title[^>]*>([^<]{3,200})</i) || [])[1];
    // El bloque de texto MÁS largo, no el primero: el primer <article> de una
    // portada suele ser un adorno de 73 caracteres (ver LESSONS).
    let mejor = '';
    for (const m of html.matchAll(/<(article|main)[\s>][\s\S]*?<\/\1>/gi)) {
      const limpio = m[0].replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
                         .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (limpio.length > mejor.length) mejor = limpio;
    }
    const lineas: string[] = [];
    if (titulo) lineas.push(`“${titulo.replace(/\s+/g, ' ').trim().slice(0, 90)}”`);
    lineas.push(mejor.length >= 400
      ? `Reads ${mejor.length.toLocaleString()} characters from the page`
      : `No readable text on the page — likely paywalled or drawn with JavaScript. ` +
        `Paste the text itself and it goes in whole`);
    return lineas;
  } catch (e) {
    return [`The page did not answer in time (${String(e).slice(0, 60)})`];
  }
}

async function clasificar(texto: string): Promise<Resuelto> {
  const t = String(texto ?? '').trim();
  if (!t) return { as: 'elemento', label: 'nothing to add' };

  const lineas = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const url = primeraUrl(t);

  // Un enlace en la primera línea y texto debajo: el caso de pegar un artículo
  // entero con su procedencia. Es lo más rico que puede entrar.
  if (url && lineas.length > 1 && ES_URL.test(lineas[0])) {
    // La primera línea de un pegado suele ser el menú de navegación —el caso
    // real fue «Skip to contentSkip to site index»—, así que como título se
    // busca la primera línea que parezca una frase.
    const titular = lineas.slice(1).find(l => l.length > 20 && l.split(/\s+/).length > 3);
    return {
      as: 'elemento', url, body_text: lineas.slice(1).join('\n'),
      label: 'an article, with its text · goes into the weekly',
      vista: [`“${(titular ?? lineas[1]).slice(0, 90)}”`,
              `Takes the ${lineas.slice(1).join(' ').split(/\s+/).length.toLocaleString()} words you pasted, ` +
              `with ${new URL(url).hostname.replace(/^www\./, '')} as the source`],
      name: (titular ?? lineas[1]).slice(0, 200),
      alternativas: [SOLO_PIEZA],
    };
  }

  // Texto largo o con saltos, sin ser una URL suelta: material pegado.
  //
  // Esta rama NO ofrecía «pieza suelta» y la de texto corto sí: pegar un
  // artículo entero —el caso normal— era justo el que se quedaba sin la
  // opción. El botón decía «Add» y nada explicaba a dónde iba.
  if (!ES_URL.test(t) && (lineas.length > 1 || t.length > 400)) {
    return {
      as: 'elemento', body_text: t,
      label: 'pasted text · goes into the weekly',
      vista: [`“${lineas[0].slice(0, 90)}”`,
              `Takes the ${t.split(/\s+/).length.toLocaleString()} words as they are — no source URL, ` +
              `so nothing gets fetched`],
      name: lineas[0].slice(0, 120),
      alternativas: [SOLO_PIEZA],
    };
  }

  if (ES_URL.test(t)) {
    let u: URL;
    try { u = new URL(t); } catch {
      return { as: 'elemento', body_text: t, label: 'pasted text · goes into the weekly',
               alternativas: [SOLO_PIEZA] };
    }
    const host = u.hostname.replace(/^www\./, '');
    const ruta = u.pathname;

    // Un vídeo suelto de YouTube — no el canal.
    if (/(^|\.)youtu\.be$/.test(host) ||
        (/(^|\.)youtube\.com$/.test(host) && (/^\/watch/.test(ruta) || /^\/shorts\//.test(ruta)))) {
      const v = await vistaDeYouTube(t);
      return { as: 'elemento', url: t, label: 'one YouTube episode · goes into the weekly',
               vista: v, alternativas: [SOLO_PIEZA] };
    }

    // Un canal.
    if (/(^|\.)youtube\.com$/.test(host) && /^\/(@|channel\/|c\/|user\/)/.test(ruta)) {
      const resuelto = await resolverYouTube(t);
      const chk = await canalResponde(resuelto);
      return {
        as: 'fuente', kind: 'youtube', feed_url: resuelto,
        saludable: chk.ok,
        name: chk.ok ? chk.nombre : undefined,
        label: chk.ok
          ? `a YouTube channel · ${chk.nombre}${chk.videos ? ` · ${Number(chk.videos).toLocaleString()} videos` : ''}`
          : `a YouTube channel — but it did not answer: ${chk.error}`,
        aviso: chk.ok ? undefined : chk.error,
        vista: chk.ok
          ? ['New videos get picked up as they appear',
             'Each one is listened to and summarised; anything under five minutes is skipped']
          : undefined,
        alternativas: [{ as: 'elemento', label: 'one episode' }],
      };
    }

    // Apple Podcasts. Va ANTES de la comprobación de feeds porque esa URL no es
    // un feed y nunca lo va a ser: hay que cambiarla por el feed del programa.
    // Sin esto caía hasta el final y se daba de alta como «un artículo de
    // podcasts.apple.com», que no es ni artículo ni fuente.
    if (/(^|\.)(podcasts|music)\.apple\.com$/.test(host)) {
      // Con `?i=` es UN episodio: se ofrece como elemento —con la pieza suelta
      // delante— y seguir el programa entero queda como alternativa.
      const uno = /[?&]i=\d{5,}/.test(t) ? await resolverEpisodioApple(t) : null;
      if (uno) {
        const hayTexto = uno.texto.length >= 400;
        return {
          as: 'elemento', url: uno.pagina, body_text: hayTexto ? uno.texto : undefined,
          name: uno.titulo,
          label: `one episode of ${uno.programa}` + (hayTexto
            ? ' · goes into the weekly'
            : ' — Apple gives no text for it; paste the transcript'),
          aviso: hayTexto
            ? 'Only the episode notes are available, not a transcript: the piece will be thinner than one built from the audio.'
            : undefined,
          vista: [`“${uno.titulo.slice(0, 90)}”`,
                  hayTexto
                    ? `Reads ${uno.texto.length.toLocaleString()} characters of episode notes — not a transcript`
                    : 'Apple publishes no text for this episode; the transcript has to be pasted in'],
          alternativas: [SOLO_PIEZA, { as: 'fuente', kind: 'podcast', label: `follow ${uno.programa}` }],
        };
      }
      const ap = await resolverApple(t);
      if (!ap.ok) {
        return { as: 'elemento', url: t,
                 label: `an Apple Podcasts link — but ${ap.error}`, aviso: ap.error };
      }
      const chk = await feedResponde(ap.feed_url);
      const mejorAp = chk.ok ? await mejorFeed(ap.feed_url) : null;
      const nombre = nombreCorto(ap.nombre ?? (chk.ok ? chk.nombre : undefined));
      if (mejorAp) {
        return {
          as: 'fuente', kind: 'podcast', feed_url: mejorAp.feed_url, name: nombre, saludable: true,
          label: `a podcast · ${nombre ?? 'untitled'} — Apple only distributes the audio, so this ` +
                 `follows its own site (${mejorAp.sitio}), where the full text is: ` +
                 `${Math.round(mejorAp.caracteres / 1000)}k characters per episode`,
          vista: ['Every new episode gets read from the show\u2019s own site, not from Apple',
                  `About ${Math.round(mejorAp.caracteres / 1000)}k characters of transcript each`],
        };
      }
      const callado = chk.ok ? avisoDeSilencio(chk.diasDesdeUltimo) : undefined;
      return {
        as: 'fuente', kind: 'podcast', feed_url: ap.feed_url, name: nombre,
        saludable: chk.ok,
        label: chk.ok
          ? `a podcast · ${nombre ?? 'untitled'}` +
            (ap.episodios ? ` · ${ap.episodios.toLocaleString()} episodes` : '') +
            (callado ? ` · nothing yet: ${callado}` : '')
          : `Apple points to ${new URL(ap.feed_url).hostname}, but it did not answer: ${chk.error}`,
        aviso: chk.ok ? callado : chk.error,
        vista: chk.ok ? vistaDeMuestras(chk.muestras) : undefined,
      };
    }

    // ¿Es un feed? No se deduce de la forma de la URL: `feeds.megaphone.fm/
    // breakingpoints` es un podcast y no termina en `.xml` ni en `/feed`, y una
    // lista de dominios conocidos siempre estaría incompleta. Se le pregunta a
    // la propia URL, que es una petición y una respuesta definitiva.
    const pareceFeed = /\.(xml|rss)$/i.test(ruta) || /\/(feed|rss)\/?$/i.test(ruta) ||
                       /^feeds?\./i.test(host) || /\/(feed|rss|podcast)s?\//i.test(ruta);
    const chkFeed = ruta !== '/' && ruta !== '' ? await feedResponde(t) : { ok: false as const, error: '', probado: false };

    if (chkFeed.ok || pareceFeed) {
      // Si ya se probó y falló, NO se vuelve a pedir: eran dos timeouts de 12 s
      // seguidos en el camino del fallo, en una función que promete una petición.
      const chk = ('probado' in chkFeed && chkFeed.probado === false) ? await feedResponde(t) : chkFeed;
      // `<itunes:` es lo que separa un podcast de un medio escrito y ya viene en
      // lo que se descargó: antes se volvía a pedir el feed entero solo para
      // mirarlo.
      const kind = chk.ok && chk.esPodcast ? 'podcast' : 'rss';
      const callado = chk.ok ? avisoDeSilencio(chk.diasDesdeUltimo) : undefined;
      // ¿Hay una superficie mejor que esta? Se dice y se ofrece; no se cambia
      // por detrás, que sería dar de alta algo distinto de lo que se pegó.
      const mejor = kind === 'podcast' ? await mejorFeed(t) : null;
      if (mejor) {
        return {
          as: 'fuente', kind, feed_url: mejor.feed_url,
          name: chk.ok ? nombreCorto(chk.nombre) : undefined, saludable: true,
          label: `a podcast · ${(chk.ok ? chk.nombre : undefined) ?? 'untitled'} — using its own site (${mejor.sitio}), ` +
                 `which publishes the full text: ${Math.round(mejor.caracteres / 1000)}k characters per episode`,
          vista: ['Every new episode gets read from the show\u2019s own site, where the transcript is',
                  `About ${Math.round(mejor.caracteres / 1000)}k characters each`],
          // La alternativa lleva su URL. Sin ella, «use the audio feed instead»
          // volvía a clasificar el mismo texto y daba de alta otra vez el feed
          // del sitio: el botón decía una cosa y hacía la contraria.
          alternativas: [{ as: 'fuente', kind, feed_url: t, label: 'use the audio feed instead' }],
        };
      }
      return {
        as: 'fuente', kind, feed_url: t, name: chk.ok ? nombreCorto(chk.nombre) : undefined,
        saludable: chk.ok,
        label: chk.ok
          ? `a ${kind === 'podcast' ? 'podcast' : 'feed'} · ${chk.nombre ?? 'untitled'}` +
            (callado ? ` · nothing yet: ${callado}` : '')
          : `it looks like a feed but did not answer: ${chk.error}`,
        aviso: chk.ok ? callado : chk.error,
        vista: chk.ok ? vistaDeMuestras(chk.muestras) : undefined,
      };
    }

    // Solo el dominio: probablemente quiere seguir el medio entero.
    if (ruta === '/' || ruta === '') {
      const titulo = await nombreDeSitio(u.origin) ?? host;
      // Antes de quedarse con el primer feed que conteste: ¿cuántas puertas hay?
      // Un programa suele tener web, audio, YouTube y Substack, y no dan lo mismo.
      const puertas = await superficiesDe({ origen: u.origin, nombre: titulo });
      if (puertas.length > 1) {
        return {
          as: 'fuente', kind: puertas[0].kind, feed_url: puertas[0].feed_url,
          name: puertas[0].name ?? titulo,
          label: `${titulo} · found ${puertas.length} ways to follow it — pick the ones you want`,
          opciones: puertas,
        };
      }
      const hallado = await buscarFeed(u.origin);
      if (hallado) {
        return {
          as: 'fuente', kind: 'rss', feed_url: hallado.feed_url,
          name: hallado.nombre ?? titulo,
          label: `the outlet ${hallado.nombre ?? host} · found its feed`,
          vista: vistaDeMuestras((await feedResponde(hallado.feed_url) as { muestras?: { titulo: string; caracteres: number }[] }).muestras),
          alternativas: [{ as: 'fuente', kind: 'tema', label: 'a topic limited to this site' }],
        };
      }
      const nombre = titulo;
      return {
        as: 'fuente', kind: 'tema', name: nombre,
        label: `no feed found for ${nombre} — it would be followed by searching the site instead. ` +
               `If you know its feed URL, paste that and it gets followed properly`,
        vista: [`Searches ${host} by name each round instead of reading a feed`,
                'That spends search credit and finds less: a feed URL is always better'],
        alternativas: [{ as: 'elemento', label: 'just this page, once' }],
      };
    }

    // ¿Es la página de un columnista o una sección? Se comprueba antes de
    // tratarla como artículo suelto: seguir a un columnista es lo que se quería.
    const seccion = await feedDeSeccion(u);
    if (seccion) {
      return {
        as: 'fuente', kind: 'rss', feed_url: seccion.feed_url,
        name: seccion.nombre || u.pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' '),
        saludable: true,
        label: `just this section of ${host}` +
               (seccion.nombre ? ` · ${seccion.nombre}` : '') +
               ` — not the whole paper`,
        vista: vistaDeMuestras(seccion.muestras),
        // Las dos lecturas de la misma URL, dichas las dos: seguir al columnista
        // o seguir al diario. La pregunta era literalmente esa.
        opciones: await (async (): Promise<Opcion[]> => {
          const opts: Opcion[] = [{
            as: 'fuente', kind: 'rss', feed_url: seccion.feed_url,
            name: seccion.nombre || u.pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' '),
            label: `Follow this column only · ${seccion.nombre ?? u.pathname.split('/').filter(Boolean).pop()}`,
            detalle: vistaDeMuestras(seccion.muestras).join(' · '),
          }];
          const todo = await buscarFeed(u.origin);
          if (todo) {
            const c = await feedResponde(todo.feed_url);
            opts.push({
              as: 'fuente', kind: 'rss', feed_url: todo.feed_url,
              name: todo.nombre ?? host,
              label: `Follow all of ${host} · everything the paper publishes`,
              detalle: c.ok ? vistaDeMuestras(c.muestras).join(' · ') : undefined,
            });
          }
          opts.push({ as: 'elemento', label: 'Read this page once',
                      detalle: 'Nothing gets followed; it just goes into the weekly' });
          return opts;
        })(),
        alternativas: [{ as: 'elemento', label: 'only this page, once' }, SOLO_PIEZA],
      };
    }

    // Cualquier otra URL con ruta: un artículo concreto.
    return {
      as: 'elemento', url: t,
      label: `one article from ${host} · goes into the weekly`,
      vista: await vistaDePagina(t),
      alternativas: [{ as: 'fuente', kind: 'rss', label: `follow ${host} from now on` },
                     SOLO_PIEZA],
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
      // Un nombre puede tener podcast y canal propios. Buscarlos cuesta dos
      // peticiones y ahorra seguir por búsqueda —que se paga— algo que publica
      // un feed gratis.
      opciones: await (async (): Promise<Opcion[]> => {
        const puertas = await superficiesDe({ nombre: t });
        if (!puertas.length) return [];
        return [...puertas, {
          as: 'fuente' as const, kind: esNombre ? 'persona' : 'tema', name: t,
          label: esNombre ? `Search for ${t}` : `Search the web for “${t}”`,
          detalle: 'No feed: every round spends search credit',
        }];
      })(),
      vista: [esNombre
        ? `Searches for what ${t} says and what gets said about them, in every language`
        : `Searches the web for “${t}” each round, in every language`,
        'Costs search credit each round; sources with a feed cost nothing'],
      alternativas: [
        { as: 'fuente', kind: esNombre ? 'tema' : 'persona',
          label: esNombre ? 'treat it as a topic' : 'treat it as a person' },
      ],
    };
  }

  return { as: 'elemento', body_text: t, label: 'pasted text', name: lineas[0]?.slice(0, 120),
           alternativas: [SOLO_PIEZA] };
}

// La alternativa que separa los dos destinos de un elemento suelto: por defecto
// alimenta el número de la semana; con esto se lee SOLO para un artículo propio
// (origin='pieza', 0045) y el semanal no lo ve. El artículo se ordena después en
// conversación, que es el camino de publicación con autoría de siempre.
const SOLO_PIEZA = { as: 'elemento', solo: '1',
                     label: 'for a standalone piece — keep it out of the weekly' };

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
          if (!KINDS.has(kind)) return bad(`unknown source kind «${kind}»`);
          const buscada = kind === 'tema' || kind === 'persona';

          // La puerta elegida en el panel manda sobre la que el clasificador
          // habría escogido solo: pegar la web de un programa ofrece su feed de
          // texto, su audio y su canal, y el que vale lo decide él.
          //
          // No se acepta a ciegas: tiene que contestar como feed AHORA. Así lo
          // que entra está comprobado, venga de donde venga.
          const elegido = typeof b.feed_url === 'string' ? b.feed_url.trim() : '';
          if (elegido && !buscada) {
            const c = await feedResponde(elegido);
            if (!c.ok) return bad(`not added — ${c.error}`);
            r.feed_url = elegido;
            r.saludable = true;
            if (typeof b.name === 'string' && b.name.trim()) r.name = b.name.trim();
            else r.name = nombreCorto(c.nombre) ?? r.name;
          } else if (buscada && typeof b.name === 'string' && b.name.trim()) {
            r.name = b.name.trim();
          }

          if (!buscada && !r.feed_url) return bad('could not work out what to follow there');
          // Una fuente cuyo chequeo FALLÓ no se guarda. Antes el fallo iba en el
          // `label`, nadie lo miraba aquí, y la fila entraba igual — para fallar
          // cada noche en silencio y aparecer 14 días después como «callada».
          // Se decide por la BANDERA, no por el texto del aviso: el primer
          // intento filtraba la prosa con un regex y «the feed responded 404» no
          // estaba en la lista, así que el roto entró igual. Un contrato no
          // viaja en frases para humanos.
          if (!buscada && r.saludable === false) {
            return bad(`not added — ${r.aviso ?? r.label}`);
          }
          const nombre = (r.name || r.feed_url || texto).slice(0, 120);

          const fila: Record<string, unknown> = {
            kind, name: nombre, notes: b.notes ?? null,
            feed_url: buscada ? null : normalizarFeed(String(r.feed_url)),
          };
          // ¿Ya se sigue esto por otra puerta? El mismo programa por Apple y
          // por su web son dos URLs distintas y una sola fuente: darlas de alta
          // las dos mete cada episodio DOS VECES en el número, con guids
          // distintos, y nada lo delataría salvo leerlo repetido.
          //
          // No se decide por detrás: se dice qué hay y se ofrece cambiarlo.
          const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
          const { data: yaHay } = await db.from('glossa_radar_sources')
            .select('id,name,kind,feed_url').eq('active', true);
          const gemela = (yaHay ?? []).find((v: { name: string; feed_url: string | null }) =>
            norm(v.name) === norm(nombre) && v.feed_url !== fila.feed_url);
          if (gemela && b.reemplazar !== true) {
            return ok({
              as: 'duplicada', source: gemela, feed_url: fila.feed_url,
              label: `You already follow «${gemela.name}» through ${
                (() => { try { return new URL(String(gemela.feed_url)).host; } catch { return 'another feed'; } })()
              }. Adding this one too would read every episode twice.`,
              alternativas: [{ as: 'fuente', reemplazar: '1',
                               label: 'replace the old feed with this one' }],
            });
          }
          if (gemela && b.reemplazar === true) {
            const { data: cambiada, error: eUp } = await db.from('glossa_radar_sources')
              .update({ feed_url: fila.feed_url, kind, name: nombre, consecutive_failures: 0 })
              .eq('id', gemela.id).select('*').single();
            if (eUp) throw eUp;
            return ok({ as: 'fuente', source: cambiada,
                        label: `«${nombre}» now follows ${new URL(String(fila.feed_url)).host}` });
          }

          const { data, error } = await db.from('glossa_radar_sources')
            .insert(fila).select('*').single();
          if (error) {
            if ((error as { code?: string }).code === '23505') return bad('that source is already registered');
            throw error;
          }
          // El aviso que quede (p. ej. «lleva 11 días sin publicar») viaja en la
          // respuesta: en el peek se veía y al confirmar desaparecía.
          return ok({ as: 'fuente', source: data, label: r.label, aviso: r.aviso });
        }

        // Elemento suelto: entra en la misma cola que todo lo demás.
        const url = r.url ?? (ES_URL.test(texto) ? texto : null);
        let cuerpo = r.body_text ?? null;
        let titulo = r.name ?? null;
        let autor = (b.author as string) ?? null;
        let aviso: string | undefined;

        if (!url && !cuerpo) return bad('a link or the text is required');

        // Un enlace SIN texto hay que bajarlo aquí. Gemini solo sabe abrir URLs
        // de YouTube; cualquier otra le llega como `fileUri` y devuelve un
        // «400 INVALID_ARGUMENT» que no dice por qué. Y de paso salen el título
        // y el medio de verdad, en vez de dejar la URL cruda como título.
        const esYoutube = url ? /(?:youtube\.com|youtu\.be)\//.test(url) : false;
        if (url && !cuerpo && !esYoutube) {
          const art = await extraerArticulo(url);
          titulo = art.titulo ?? titulo;
          autor = autor ?? art.autor ?? art.sitio ?? null;

          // Sin texto no hay nada que analizar, y encolarlo solo aplaza el fallo:
          // acabaría en Gemini como si fuera un vídeo y devolvería un 400. Los
          // periódicos de pago responden 403 a cualquier robot —lo hace el NYT—
          // así que se rechaza aquí y se dice qué hacer, que es pegar el texto
          // que un suscriptor ya tiene delante.
          if (!art.texto) {
            let host = url;
            try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* nada */ }
            return bad(art.error?.includes('403') || art.error?.includes('401')
              ? `${host} blocks automated readers. Open it and paste the text in — a link alone gives us nothing to read.`
              : `nothing readable at that link${art.error ? ` (${art.error})` : ''}. Paste the text instead.`);
          }
          cuerpo = art.texto;
        }

        if (!titulo && url) {
          // Último recurso: el nombre del sitio, no la URL entera.
          try { titulo = new URL(url).hostname.replace(/^www\./, ''); } catch { /* nada */ }
        }

        // `solo` viene del botón «standalone piece»: mismo camino de lectura,
        // pero el número de la semana no lo toca (origin='pieza', 0045).
        const solo = b.solo === '1' || b.solo === true;
        const { data, error } = await db.from('glossa_radar_items').insert({
          source_id: null, origin: solo ? 'pieza' : 'pegado',
          external_id: url ?? ('pegado:' + await huella(cuerpo!)),
          url: url ?? 'about:blank',
          title: (titulo || cuerpo || '').slice(0, 300) || '(sin título)',
          author: autor,
          body_text: cuerpo,
          published_at: new Date().toISOString(),
          state: 'pending',
        }).select('id,title').single();
        if (error) {
          if ((error as { code?: string }).code === '23505') return bad('that is already in the queue');
          throw error;
        }
        // Una pieza suelta no espera al radar: se dispara su producción AHORA
        // (0047). El workflow digiere, trae contexto, escribe con Kimi y encola
        // la publicación; la pieza aparece en Articles con su N° al terminar.
        if (solo && data) {
          const { error: eDisp } = await db.rpc('glossa_pieza_dispatch', { item: data.id });
          if (eDisp) return ok({ as: 'elemento', item: data,
            label: r.label, aviso: `saved, but the piece run could not be launched: ${eDisp.message}` });
          // El 5% inicial lo pone esto y no el guion: el runner tarda ~1 min en
          // arrancar y sin esta marca la barra no existiría justo cuando el
          // usuario acaba de pegar y está mirando.
          await db.from('glossa_radar_items').update({
            progress: { pct: 5, fase: 'launched — waiting for the runner', updated_at: new Date().toISOString() },
          }).eq('id', data.id);
          return ok({ as: 'elemento', item: data,
            label: 'standalone piece — being written now; watch the bar below', aviso });
        }
        return ok({ as: 'elemento', item: data, label: r.label, aviso });
      }

      // ── Piezas en producción ─────────────────────────────────────────────
      case 'piezas.progreso': {
        // Las de las últimas 24 h con avance anotado. El 100 no lo escribe
        // nadie: se deduce de la cola de publicación, porque «terminado» solo
        // significa algo cuando la página existe de verdad.
        const { data, error } = await db.from('glossa_radar_items')
          .select('id,title,progress,created_at')
          .eq('origin', 'pieza').not('progress', 'is', null)
          .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
          .order('created_at', { ascending: false }).limit(5);
        if (error) throw error;
        const piezas = [];
        for (const it of data ?? []) {
          const pr = (it.progress ?? {}) as Record<string, unknown>;
          let vivo: Record<string, unknown> | null = null;
          if (pr.slug) {
            const { data: reqs } = await db.from('glossa_publish_requests')
              .select('state,url_en,error,done_at').eq('slug', String(pr.slug))
              .order('requested_at', { ascending: false }).limit(1);
            const q = reqs?.[0];
            if (q?.state === 'done') {
              // Una pieza terminada se enseña diez minutos —lo justo para ver
              // el «live» si estabas mirando— y luego desaparece: su sitio es
              // Articles y la portada, no una barra al 100 % para siempre.
              const edad = Date.now() - new Date(q.done_at ?? 0).getTime();
              if (edad > 10 * 60_000) continue;
              vivo = { url: q.url_en };
            } else if (q?.state === 'error') vivo = { error: q.error };
          }
          piezas.push({ ...it, vivo });
        }

        // El corte del número, con la misma barra. Vive en un ajuste porque su
        // fila no existe hasta que termina, que es lo que se está esperando.
        const { data: cs } = await db.from('glossa_radar_settings')
          .select('value').eq('key', 'corte_estado').maybeSingle();
        let corte = (cs?.value ?? null) as Record<string, unknown> | null;
        if (corte) {
          const edad = Date.now() - new Date(String(corte.updated_at ?? 0)).getTime();
          // Terminado se enseña 10 min; vivo, mientras dé señales (una corrida
          // muerta deja de anotar y a la media hora la barra se retira sola en
          // vez de mentir que sigue trabajando).
          const caduca = corte.fase === 'done' ? 10 * 60_000 : 45 * 60_000;
          if (edad > caduca) corte = null;
        }
        return ok({ piezas, corte });
      }

      // Reintentar una pieza fallida, desde donde murió. Si su MDX ya está en
      // la cola de publicación, se relanza SOLO la publicación (gratis, 0049);
      // si murió antes de escribirse, se relanza la producción entera (0047).
      case 'piezas.retry': {
        const itemId = String(b.item_id ?? '');
        const { data: it } = await db.from('glossa_radar_items')
          .select('id,progress').eq('id', itemId).eq('origin', 'pieza').single();
        if (!it) return bad('no such piece');
        const slug = (it.progress as Record<string, unknown> | null)?.slug;
        if (slug) {
          const { data: reqs } = await db.from('glossa_publish_requests')
            .select('id,state').eq('slug', String(slug))
            .order('requested_at', { ascending: false }).limit(1);
          if (reqs?.[0] && reqs[0].state !== 'done') {
            const { error: e1 } = await db.rpc('glossa_publish_relanzar', { req: reqs[0].id });
            if (e1) throw e1;
            await db.from('glossa_radar_items').update({
              progress: { ...(it.progress as object), pct: 90, fase: 'publishing — retried', error: null,
                          updated_at: new Date().toISOString() } }).eq('id', itemId);
            return ok({ relanzado: 'publicacion' });
          }
        }
        const { error: e2 } = await db.rpc('glossa_pieza_dispatch', { item: itemId });
        if (e2) throw e2;
        await db.from('glossa_radar_items').update({
          progress: { pct: 5, fase: 'relaunched — waiting for the runner', updated_at: new Date().toISOString() },
        }).eq('id', itemId);
        return ok({ relanzado: 'produccion' });
      }

      // Quién ha pedido su propia Glossa. Existe porque una petición que nadie
      // lee es peor que no tener caja: la persona escribió y espera respuesta.
      case 'accesos.list': {
        const { data, error } = await db.from('glossa_subscribers')
          .select('email,lang,created_at,origen').eq('intent', 'acceso')
          .order('created_at', { ascending: false }).limit(50);
        if (error) throw error;
        return ok({ accesos: data ?? [] });
      }

      // Los temas: lo que el clasificador ya produjo, con la evidencia que
      // permite elegir. Arturo fija de aquí; no teclea nombres, porque un
      // nombre tecleado no coincide con ninguna etiqueta y nace vacío.
      case 'temas.list': {
        const { data, error } = await db.rpc('glossa_radar_temas_propuestos', { dias: 21 });
        if (error) throw error;
        // El sector vive en la tabla, no en el RPC: se pega aquí para no tocar
        // una función que ya usan otros.
        const { data: sec } = await db.from('glossa_radar_topics').select('id,sector');
        const porId = new Map((sec ?? []).map((x: { id: string; sector: string }) => [x.id, x.sector]));
        return ok({ temas: (data ?? []).map((t: Record<string, unknown>) =>
          ({ ...t, sector: porId.get(String(t.topic_id)) ?? 'Other' })) });
      }

      // Los departamentos del número: cuáles existen y qué te interesa de cada
      // uno. Sustituyen a fijar temas sueltos — un sector no cambia solo, y la
      // lista de temas sí.
      case 'secciones.list': {
        const [{ data: secs, error }, { data: temas }] = await Promise.all([
          db.from('glossa_radar_secciones').select('*').order('orden'),
          db.from('glossa_radar_topics').select('sector').is('merged_into', null),
        ]);
        if (error) throw error;
        const cuenta: Record<string, number> = {};
        for (const t of temas ?? []) cuenta[t.sector ?? 'Other'] = (cuenta[t.sector ?? 'Other'] ?? 0) + 1;
        return ok({ secciones: (secs ?? []).map(s => ({ ...s, temas: cuenta[s.sector] ?? 0 })) });
      }

      case 'secciones.set': {
        if (!b.sector) return bad('sector is required');
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (b.activo !== undefined) patch.activo = !!b.activo;
        if (b.interes !== undefined) patch.interes = String(b.interes).slice(0, 400) || null;
        const { error } = await db.from('glossa_radar_secciones')
          .update(patch).eq('sector', b.sector);
        if (error) throw error;
        return ok({ guardado: true });
      }

      case 'temas.fijar': {
        if (!b.topic_id) return bad('topic_id is required');
        const fijo = b.fijo !== false;
        const { error } = await db.from('glossa_radar_topics')
          .update({ fijo, fijado_at: fijo ? new Date().toISOString() : null })
          .eq('id', b.topic_id);
        if (error) throw error;

        // Fijar UNIFICA: el tema absorbe a los que ya eran el mismo asunto y
        // hereda su material (0054). Sin esto, fijar dos variantes daría dos
        // secciones alimentadas por los mismos episodios. Soltar lo deshace.
        if (fijo) {
          const { data: fundidos } = await db.rpc('glossa_radar_fundir_en',
            { destino: b.topic_id, umbral: 0.6 });
          return ok({ fijo, absorbidos: (fundidos ?? []).map((x: { label: string }) => x.label) });
        }
        await db.rpc('glossa_radar_desfundir', { destino: b.topic_id });
        return ok({ fijo });
      }

      // Qué pasó con TODO lo que llegó esta semana. Existe porque «¿cómo sé que
      // no estás omitiendo cosas?» es una pregunta legítima, y la respuesta no
      // puede ser «confía»: es la cuenta completa, a la vista y sin pedirla.
      case 'cobertura': {
        const { data, error } = await db.rpc('glossa_radar_cobertura');
        if (error) throw error;
        return ok({ cobertura: data ?? [] });
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
        // Lo que ESPERA o pide atención. No es un archivo.
        //
        // Antes listaba todo lo que no venía de un feed, para siempre: doce
        // reportajes y cuatro hallazgos de la semana pasada, ya leídos, seguían
        // ahí semanas después. Una lista llamada «cola» que solo crece no dice
        // qué está en marcha — dice qué ha existido, que es otra pregunta.
        //
        // Ahora: lo pendiente o roto (venga de donde venga) y lo que ARTURO
        // añadió en las últimas 48 h, para ver en qué acabó lo que acaba de
        // meter. Lo que traen las máquinas —reportajes del viernes, hallazgos de
        // monitores— ya digerido NO se lista: cuarenta y una filas de trabajo
        // hecho disfrazadas de cola hicieron preguntar, con razón, «¿esto no
        // debió limpiarse?». Lo demás ya cumplió y se aparta solo.
        const hace48h = new Date(Date.now() - 48 * 3600_000).toISOString();
        // Las piezas sueltas NO se listan aquí en ningún estado: viven en la
        // barra de producción mientras se hacen y en Articles al terminar.
        // Verlas además en la cola las hacía parecer trabajo pendiente.
        const { data, error } = await db.from('glossa_radar_items')
          .select('id,title,url,origin,state,published_at,digested_at,created_at,error,glossa_radar_sources(name)')
          .neq('origin', 'pieza')
          .or(`state.in.(pending,running,error),and(origin.eq.pegado,created_at.gte.${hace48h})`)
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
        let feed_url = await resolverYouTube(bruta);
        const kind = String(b.kind || 'rss');
        if (!['youtube', 'podcast', 'rss'].includes(kind)) return bad('invalid type');
        // Se comprueba antes de guardar: una fuente rota que falla cada noche en
        // silencio es peor que un error ahora.
        const chequeo = kind === 'youtube' ? await canalResponde(feed_url) : await feedResponde(feed_url);
        if (!chequeo.ok) return bad(chequeo.error!);
        feed_url = kind === 'youtube' ? feed_url : normalizarFeed(feed_url);
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

      // ── Fuentes orgánicas (0044) ─────────────────────────────────────────
      // El panel MIRA el vivero — candidatos, expedientes y las fuentes que el
      // consejo dio de alta a prueba— y solo puede hacer una cosa: vetar. Todo
      // lo demás lo decide el consejo del domingo; esa asimetría es el diseño.
      case 'organicas.list': {
        const [cand, fuentes] = await Promise.all([
          db.from('glossa_radar_candidatos').select('*')
            .order('updated_at', { ascending: false }).limit(80),
          db.from('glossa_radar_sources')
            .select('id,name,feed_url,estado,temas,active,created_at,candidato_id')
            .not('candidato_id', 'is', null).order('created_at', { ascending: false }),
        ]);
        if (cand.error) throw cand.error;
        if (fuentes.error) throw fuentes.error;
        return ok({ candidatos: cand.data ?? [], fuentes: fuentes.data ?? [] });
      }
      case 'candidatos.vetar': {
        // El veto es la única palabra humana del ciclo, y apaga también la
        // fuente si el candidato ya estaba de alta.
        const { data, error } = await db.from('glossa_radar_candidatos')
          .update({ estado: 'vetado', motivo: 'vetado desde el panel',
                    decidido_en: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', b.id).select('id,source_id').single();
        if (error) throw error;
        if (data?.source_id) {
          await db.from('glossa_radar_sources').update({ active: false }).eq('id', data.source_id);
        }
        return ok({ vetado: true });
      }
      case 'candidatos.restaurar': {
        const { error } = await db.from('glossa_radar_candidatos')
          .update({ estado: 'candidato', motivo: 'restaurado desde el panel',
                    decidido_en: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', b.id);
        if (error) throw error;
        return ok({ restaurado: true });
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
        // Por fecha de ESCRITURA, no por semana cubierta. Cuando el reloj pasó de
        // los lunes a los domingos, la semana cambió de empezar en lunes a empezar
        // en domingo, y quedó una fila del formato viejo con `week_start`
        // posterior. Ordenando por semana, el panel enseñaba el número retirado.
        const { data, error } = await db.from('glossa_radar_weekly')
          .select('*').order('generated_at', { ascending: false, nullsFirst: false })
          .limit(1).maybeSingle();
        if (error) throw error;
        return ok({ issue: data });
      }
      // Publicar y retirar. Un solo campo, pero es la única compuerta que tiene
      // este sistema entre lo que escribe un modelo y lo que lee cualquiera.
      case 'weekly.publish': {
        // Una persona puede publicar un número que el fusible marcó; la
        // automatización no. Esa asimetría es deliberada: el fusible comprueba lo
        // que una máquina puede comprobar, y quien lea el número sabe cosas que
        // él no. Lo que no puede pasar es que salga solo con fallos dentro.
        if (b.automatico === true) {
          const { data: w } = await db.from('glossa_radar_weekly')
            .select('fuse').eq('week_start', b.week_start).maybeSingle();
          const graves = ((w?.fuse as { fallos?: { grave: boolean }[] })?.fallos ?? [])
            .filter(f => f.grave);
          if (graves.length) return bad(`the fuse blocked it: ${graves.length} failure(s)`, 409);
        }
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

      case 'weekly.delete': {
        // Borrar es borrar: la fila se va, y si estaba publicada la página del
        // sitio deja de existir con ella. Lo digerido no se toca — los episodios
        // y reportajes siguen en la base y saldrían en un corte nuevo.
        if (!b.week_start) return bad('week_start is required');
        const { error } = await db.from('glossa_radar_weekly')
          .delete().eq('week_start', b.week_start);
        if (error) throw error;
        return ok({ deleted: true });
      }

      case 'weekly.rebuild': {
        // Lo escribe el Action, no una edge function: el modelo tarda ~16 min y
        // aquí el techo son 150 s. Esto sólo aprieta el botón; el resultado
        // aparece en la base cuando termine, y el panel lo recoge al recargar.
        const r = await db.rpc('glossa_weekly_dispatch', { semana: b.semana ?? null });
        if (r.error) throw r.error;
        return ok({ lanzado: true, nota: 'El número tarda unos 15 minutos. Vuelve a cargar esta página entonces.' });
      }

      case 'queue.drain': {
        // El radar lee ~2 episodios cada 15 min porque eso es lo que cabe en una
        // edge function. Esto llama a la misma función seguida, sin la espera, y
        // sube a ~60 por hora. Igual que el número: aquí solo se aprieta el
        // botón, el trabajo vive en un Action.
        const r = await db.rpc('glossa_dispatch', { workflow: 'glossa-cola.yml', entradas: {} });
        if (r.error) throw r.error;
        return ok({ lanzado: true, nota: 'Leyendo la cola. Recarga en unos minutos para ver cómo baja.' });
      }

      case 'cotejos.list': {
        const { data, error } = await db.from('glossa_radar_cotejos')
          .select('claim_text,verdict,verdict_reason,source_domain,url,independence,gate,created_at')
          .order('created_at', { ascending: false }).limit(40);
        if (error) throw error;
        return ok({ cotejos: data ?? [] });
      }

      case 'aprendizaje': {
        // Lo que el sistema sabe de sí mismo por haberlo medido, no por opinar.
        const [{ data: hist }, { data: cal }] = await Promise.all([
          db.rpc('glossa_radar_historial_fuentes'),
          db.rpc('glossa_radar_calibracion'),
        ]);
        return ok({ historial: hist ?? [], calibracion: cal ?? [] });
      }

      case 'consejo.list': {
        const { data, error } = await db.from('glossa_radar_consejo')
          .select('id,convocado_por,ranura,votos,decision,motivo,aplicado,revertido_at,created_at')
          .order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        const { data: aj } = await db.from('glossa_radar_settings')
          .select('key,value').like('key', 'prompt_calibracion_%');
        return ok({ deliberaciones: data ?? [],
                    ranuras: Object.fromEntries((aj ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value])) });
      }
      case 'consejo.revertir': {
        // Devolver la ranura a vacío ES el comportamiento original. Por eso
        // revertir es un clic y no una migración.
        const { error: e1 } = await db.from('glossa_radar_settings')
          .upsert({ key: String(b.ranura), value: '', updated_at: new Date().toISOString() });
        if (e1) throw e1;
        const { error: e2 } = await db.from('glossa_radar_consejo')
          .update({ aplicado: false, revertido_at: new Date().toISOString() }).eq('id', b.id);
        if (e2) throw e2;
        return ok({ revertido: true });
      }

      case 'incidencias': {
        const { data, error } = await db.from('glossa_radar_incidencias')
          .select('id,clase,sujeto,gravedad,detalle,accion,created_at,vista_por_ultima_vez')
          .eq('abierta', true).order('gravedad').order('created_at');
        if (error) throw error;
        return ok({ incidencias: data ?? [] });
      }
      case 'incidencias.cerrar': {
        const { error } = await db.from('glossa_radar_incidencias')
          .update({ abierta: false, cerrada_at: new Date().toISOString() }).eq('id', b.id);
        if (error) throw error;
        return ok({ cerrada: true });
      }

      case 'budget': {
        // El cupo de Tavily NO se pregunta desde aquí: lo anota el guion del
        // reportaje al pasar, en `tavily_estado`. Darle la clave al panel para
        // que preguntara él habría expuesto un secreto más para obtener la misma
        // cifra. La fecha va al lado para que una cifra rancia se vea rancia.
        const [{ data: gasto }, { data: ajus }, { data: reps }, { data: meses }] = await Promise.all([
          db.rpc('glossa_radar_presupuesto'),
          db.from('glossa_radar_settings').select('key,value'),
          db.from('glossa_radar_reportajes')
            .select('label,busquedas,entran,cuota,urgencia,barrido,paro,week_start')
            .order('week_start', { ascending: false }).limit(30),
          db.rpc('glossa_radar_costo_mensual'),
        ]);
        const set = Object.fromEntries((ajus ?? [])
          .map((r: { key: string; value: unknown }) => [r.key, r.value]));
        return ok({
          uso: gasto ?? [],
          meses: meses ?? [],
          topes: Object.fromEntries(Object.entries(set).filter(([k]) => k.startsWith('cap_'))),
          tavily: set.tavily_estado ?? null,
          // Los mandos que se suben y se bajan a mano. Van con el resto para que
          // quien mira el gasto pueda cambiarlo sin irse a otra pantalla.
          mandos: {
            reportaje_temas_barrido:   set.reportaje_temas_barrido ?? null,
            reportaje_busquedas_semana: set.reportaje_busquedas_semana ?? null,
            reportaje_entran_semana:   set.reportaje_entran_semana ?? null,
          },
          // A dónde se fue el dinero y por qué. Un tema con cero búsquedas y
          // `corroborado_gratis` es un acierto, no un hueco.
          reparto: (reps ?? []).map((r: Record<string, unknown>) => ({
            label: r.label, semana: r.week_start, cuota: r.cuota,
            busquedas: r.busquedas, entran: r.entran, paro: r.paro,
            urgencia: (r.urgencia as { nivel?: number; porque?: string })?.porque ?? null,
            medios: (r.barrido as { medios?: number })?.medios ?? null,
            paises: (r.barrido as { paises?: string[] })?.paises?.length ?? null,
            acuerdo: (r.barrido as { acuerdo?: number })?.acuerdo ?? null,
          })),
        });
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
