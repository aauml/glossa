// Lectura de RSS. YouTube y los podcasts publican feeds abiertos: no hay que
// raspar nada ni usar claves. Es la vía limpia para saber qué hay nuevo.

export type Entrada = { external_id: string; url: string; title: string; published_at: string };

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
    // En un podcast el audio va en <enclosure>: es lo que Gemini escuchará.
    const enc = /<enclosure[^>]*url=["']([^"']+)["']/i.exec(it);
    const link = limpiar(tag(it, 'link'));
    const url = enc ? enc[1] : link;
    if (!url) continue;
    const guid = limpiar(tag(it, 'guid')) || url;
    const fecha = tag(it, 'pubDate');
    out.push({
      external_id: guid,
      url,
      title: limpiar(tag(it, 'title')),
      published_at: fecha ? new Date(fecha).toISOString() : new Date().toISOString(),
    });
  }
  return out;
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
  if (!r.ok) throw new Error(`youtube ${r.status}: ${String(d?.error?.message ?? '').slice(0, 120)}`);

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
