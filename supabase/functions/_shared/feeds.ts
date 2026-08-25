// Lectura de RSS. YouTube y los podcasts publican feeds abiertos: no hay que
// raspar nada ni usar claves. Es la vía limpia para saber qué hay nuevo.

export type Entrada = { external_id: string; url: string; title: string; published_at: string;
                        // Lo que el feed ya trae escrito. No es la transcripción, pero
                        // en muchos programas son dos o tres mil caracteres de notas, y
                        // es lo único que hay cuando la página del episodio se dibuja
                        // con JavaScript. Ver `parsearFeed`.
                        texto?: string };

/** Extrae el contenido de la primera etiqueta que coincida. */
const tag = (xml: string, nombre: string) => {
  const m = new RegExp(`<${nombre}[^>]*>([\\s\\S]*?)</${nombre}>`, 'i').exec(xml);
  return m ? m[1].trim() : '';
};
const limpiar = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
   .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
   .replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();

/**
 * Se parsea con expresiones regulares a propósito: Deno no trae un parser de XML
 * y traerse uno para leer un feed de quince entradas no compensa. Los feeds de
 * YouTube y de podcasts tienen una forma fija y conocida.
 */
export function parsearFeed(xml: string, kind: string): Entrada[] {
  const out: Entrada[] = [];

  if (kind === 'youtube') {
    for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const e = m[1];
      const id = tag(e, 'yt:videoId');
      if (!id) continue;
      out.push({
        external_id: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: limpiar(tag(e, 'title')),
        published_at: tag(e, 'published'),
      });
    }
    return out;
  }

  // Atom — blogs de Hugo/Jekyll y afines. Sin esta rama, un feed Atom pasaba el
  // chequeo del alta (que acepta `<feed`), se daba de alta con su nombre, y
  // traía CERO para siempre: la fuente «muerta» perfecta, correcta y silenciosa.
  if (/<feed[\s>]/i.test(xml.slice(0, 2000)) && !/<rss[\s>]/i.test(xml.slice(0, 2000))) {
    for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const e = m[1];
      const link = /<link[^>]*href=["']([^"']+)["']/i.exec(e)?.[1] ?? '';
      if (!link) continue;
      const id = limpiar(tag(e, 'id')) || link;
      const fecha = tag(e, 'published') || tag(e, 'updated');
      out.push({
        external_id: id, url: link,
        title: limpiar(tag(e, 'title')),
        published_at: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
      });
    }
    return out;
  }

  // RSS 2.0 — podcasts y medios escritos.
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    // La PÁGINA del episodio manda sobre el MP3, por dos razones que apuntan al
    // mismo sitio. La primera: Gemini solo sabe abrir URLs de YouTube — a un
    // enclosure le devuelve «400 INVALID_ARGUMENT», y por eso ni un solo podcast
    // se había digerido nunca desde que existe el radar. La segunda: es donde
    // está la transcripción, y es adonde debe llevar la flechita del número —
    // un lector que pincha una fuente quiere el episodio, no una descarga.
    const enc = /<enclosure[^>]*url=["']([^"']+)["']/i.exec(it);
    const link = limpiar(tag(it, 'link'));
    const url = link || (enc ? enc[1] : '');
    if (!url) continue;
    const guid = limpiar(tag(it, 'guid')) || url;
    const fecha = tag(it, 'pubDate');
    // El TEXTO DEL FEED, que estaba delante todo el tiempo.
    //
    // The Cognitive Revolution se saltaba entero —«la página devolvió 73
    // caracteres», porque Megaphone la dibuja con JavaScript— mientras su
    // propio feed traía 3.610 caracteres de notas por episodio. Se pedía por la
    // ventana lo que estaba sobre la mesa.
    //
    // Sigue siendo el plan B: si la página del episodio da transcripción (la de
    // Dwarkesh da 78.000 caracteres), esa gana. Esto es el suelo, no el techo.
    const texto = limpiar(tag(it, 'content:encoded')) ||
                  limpiar(tag(it, 'description')) ||
                  limpiar(tag(it, 'itunes:summary'));
    out.push({
      external_id: guid,
      url,
      title: limpiar(tag(it, 'title')),
      published_at: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
      ...(texto && texto.length >= 400 ? { texto } : {}),
    });
  }
  return out;
}

/**
 * El texto de una página, sin la maquinaria alrededor.
 *
 * Los feeds de podcast no traen transcripción —comprobado en los tres dados de
 * alta: ninguno usa `<podcast:transcript>`— pero la PÁGINA del episodio sí la
 * suele tener. Medido: Dwarkesh 145.000 caracteres, un boletín de Substack
 * 7.400. Una página renderizada por JavaScript devuelve casi nada, y eso hay
 * que saber distinguirlo de un fallo.
 */
export async function textoDePagina(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Glossa/1.0)' },
      redirect: 'follow', signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return '';
    const html = (await r.text()).slice(0, 900_000);
    const sinRuido = html
      .replace(/<(script|style|nav|header|footer|aside|form)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');
    // Se prueban TODOS los <article> y <main> y gana el más largo, no el
    // primero. Ese detalle costó una fuente entera: la página de The Cognitive
    // Revolution abre con un <article> decorativo de 73 caracteres y el
    // transcript —204.592— viene después, así que el extractor devolvía 73, el
    // radar concluía «se dibuja con JavaScript» y saltaba cada episodio.
    //
    // Y si el mejor trozo es más pobre que la página entera, se queda la página:
    // más vale menú de más que transcripción de menos.
    const trozos = [...sinRuido.matchAll(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/gi)]
      .map(m => m[2]);
    const mejor = trozos.sort((a, b) => b.length - a.length)[0] ?? '';
    const cuerpo = mejor.length > sinRuido.length * 0.4 ? mejor : sinRuido;
    return cuerpo
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ').trim();
  } catch { return ''; }
}

/** Muchos títulos vienen como «Invitado: tema». Separarlo aquí evita gastar una
 *  llamada al modelo solo para saber quién habla. */
export function partirInvitado(title: string) {
  const m = /^([^:]{3,60}):\s*(.+)$/.exec(title || '');
  return m ? m[1].trim() : null;
}

// ── YouTube por la API oficial ────────────────────────────────────────────
//
// El endpoint de RSS de YouTube (/feeds/videos.xml) empezó a devolver 404 para
// TODOS los canales el 2026-08-21 —el de Google y el de TED incluidos— mientras
// el resto de youtube.com seguía respondiendo. Nunca estuvo documentado: era una
// conveniencia que podían retirar sin aviso, y la retiraron.
//
// La Data API sí está soportada. Coste: 1 unidad por comprobación de 10.000
// diarias, o sea unas 5.000 comprobaciones al día — muy por encima de lo que
// este radar va a necesitar nunca.

/** El id del canal, venga como URL de canal o como la vieja URL de RSS. */
export function idDeCanal(url: string): string | null {
  return (/[?&]channel_id=(UC[\w-]+)/.exec(url) ||
          /youtube\.com\/channel\/(UC[\w-]+)/.exec(url) ||
          /^(UC[\w-]+)$/.exec(url.trim()))?.[1] ?? null;
}

/**
 * La lista de "subidas" de un canal es su propio id con UU en vez de UC. Es una
 * convención estable de YouTube, y aprovecharla ahorra una llamada por canal.
 */
export const listaDeSubidas = (canal: string) => 'UU' + canal.slice(2);

// ── El filtro de duración, y por qué está AQUÍ y en git ──────────────────
//
// Un Short de 40 segundos y un directo de seis horas no son episodios, y
// mandárselos a Gemini como vídeo cuesta llamadas (y en los directos, un 403
// que se quedaba en error). El filtro existía — y se PERDIÓ: vivía solo en una
// versión de la edge function desplegada a mano, nunca commiteada, y el
// despliegue del 2026-08-22 desde el repo lo pisó sin que nada lo dijera. Se
// notó por un «LIVE:» en error y 18 cortos digeridos de más. Una función
// desplegada a mano es código que el siguiente despliegue borra.
const MIN_SEG = 600;      // por debajo: Short o clip
const MAX_SEG = 10_800;   // por encima: retransmisión cruda

/** «PT1H2M30S» → segundos. */
function segundosISO(d: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d ?? '');
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

export type Filtrado = Entrada & { motivo: string };

export async function episodiosYouTube(canalId: string, apiKey: string):
    Promise<{ entradas: Entrada[]; filtrados: Filtrado[] }> {
  const u = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('playlistId', listaDeSubidas(canalId));
  u.searchParams.set('maxResults', '30');
  u.searchParams.set('key', apiKey);

  const r = await fetch(u, { signal: AbortSignal.timeout(15_000) });
  const d = await r.json();
  if (!r.ok) {
    // Un 404 en la lista de subidas admite dos lecturas muy distintas: el id del
    // canal está mal, o el canal existe y NO HA PUBLICADO NADA —YouTube no crea
    // la lista hasta el primer vídeo—. Se preguntaba y se decía «youtube 404»,
    // el vigilante lo pausaba a los tres intentos, y el panel avisaba de una
    // avería que no existía: CSIS Wadhwani AI Center tiene canal y cero vídeos.
    // Una unidad de cuota, solo en el camino del fallo, separa las dos cosas.
    if (r.status === 404) {
      try {
        const c = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&id=${canalId}&key=${apiKey}`,
                              { signal: AbortSignal.timeout(10_000) });
        const cd = await c.json();
        if (c.ok && (cd.items ?? []).length) {
          throw new Error('el canal existe pero no ha publicado ningún vídeo todavía — no hay nada que leer, y no es una avería');
        }
        throw new Error('ese id de canal no existe en YouTube — la URL guardada apunta a un canal que no está');
      } catch (e) {
        throw e instanceof Error ? e : new Error(String(e));
      }
    }
    throw new Error(`youtube ${r.status}: ${String(d?.error?.message ?? '').slice(0, 120)}`);
  }

  const brutas: Entrada[] = (d.items ?? []).map((i: any) => ({
    external_id: i.snippet.resourceId.videoId,
    url: `https://www.youtube.com/watch?v=${i.snippet.resourceId.videoId}`,
    title: i.snippet.title,
    published_at: i.snippet.publishedAt,
  }));
  if (!brutas.length) return { entradas: [], filtrados: [] };

  // Segunda llamada: duraciones y si es directo. 1 unidad por lote de 50, que es
  // la segunda unidad que el contador de cuota ya venía cobrando.
  const v = new URL('https://www.googleapis.com/youtube/v3/videos');
  v.searchParams.set('part', 'contentDetails,snippet');
  v.searchParams.set('id', brutas.map(x => x.external_id).join(','));
  v.searchParams.set('key', apiKey);
  const rv = await fetch(v, { signal: AbortSignal.timeout(15_000) });
  const dv = await rv.json();
  // Si esta llamada falla, MEJOR dejar pasar todo que descartar a ciegas: un
  // filtro que descarta sin datos es el fallo de los 47 de 48.
  if (!rv.ok) return { entradas: brutas, filtrados: [] };

  const detalle: Record<string, { seg: number; envivo: boolean }> = {};
  for (const x of dv.items ?? []) {
    detalle[x.id] = {
      seg: segundosISO(x.contentDetails?.duration),
      envivo: x.snippet?.liveBroadcastContent === 'live' || x.snippet?.liveBroadcastContent === 'upcoming',
    };
  }

  const entradas: Entrada[] = [];
  const filtrados: Filtrado[] = [];
  for (const e of brutas) {
    const det = detalle[e.external_id];
    if (!det) { entradas.push(e); continue; }        // sin datos, se deja pasar
    const min = Math.floor(det.seg / 60), seg = det.seg % 60;
    if (det.envivo) {
      filtrados.push({ ...e, motivo: 'filtrado: directo en emisión — sin archivo que analizar' });
    } else if (det.seg > 0 && det.seg < MIN_SEG) {
      filtrados.push({ ...e, motivo: `filtrado: dura ${min}m${String(seg).padStart(2, '0')}s — Short o clip, por debajo de 10 min` });
    } else if (det.seg > MAX_SEG) {
      filtrados.push({ ...e, motivo: `filtrado: dura ${Math.floor(det.seg / 3600)}h${Math.floor((det.seg % 3600) / 60)}m — retransmisión cruda sin edición` });
    } else {
      entradas.push(e);
    }
  }
  return { entradas, filtrados };
}


/**
 * El mismo episodio, buscado en YouTube.
 *
 * El peldaño que faltaba. Cuando un pódcast no publica transcripción, su página
 * no da nada y el feed solo trae notas, casi siempre queda una salida: el vídeo
 * del episodio, que Gemini SÍ sabe escuchar. Es la diferencia entre un episodio
 * saltado y uno leído entero.
 *
 * Cuesta 100 unidades de las 10.000 diarias, así que solo se llama cuando todo
 * lo gratis ya falló.
 *
 * Y comprueba que sea EL episodio, no uno del mismo programa: se exige que el
 * título del vídeo comparta la mayoría de las palabras largas con el del
 * episodio. Un vídeo equivocado sería peor que ninguno — se analizaría el
 * contenido de otro y nadie lo notaría.
 */
export async function buscarEnYouTube(titulo: string, programa: string, key: string) {
  const fichas = (t: string) => new Set(
    t.toLowerCase().replace(/[^a-z0-9áéíóúñü ]/g, ' ').split(/\s+/).filter(w => w.length >= 4));
  const suyas = fichas(titulo);
  if (suyas.size < 2) return null;

  try {
    const q = encodeURIComponent(`${titulo} ${programa}`.slice(0, 180));
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${q}&key=${key}`,
      { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const d = await r.json();
    for (const it of d.items ?? []) {
      const suyo = fichas(String(it.snippet?.title ?? ''));
      const comunes = [...suyas].filter(w => suyo.has(w)).length;
      // Dos tercios de las palabras del título del episodio. Con menos, es otro
      // episodio del mismo programa y el análisis hablaría de lo que no es.
      if (comunes / suyas.size >= 0.66) {
        return { videoId: String(it.id?.videoId ?? ''), titulo: String(it.snippet?.title ?? ''),
                 canal: String(it.snippet?.channelTitle ?? '') };
      }
    }
    return null;
  } catch { return null; }
}
