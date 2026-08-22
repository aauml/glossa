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

export async function episodiosYouTube(canalId: string, apiKey: string): Promise<Entrada[]> {
  const u = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  u.searchParams.set('part', 'snippet');
  u.searchParams.set('playlistId', listaDeSubidas(canalId));
  u.searchParams.set('maxResults', '30');
  u.searchParams.set('key', apiKey);

  const r = await fetch(u, { signal: AbortSignal.timeout(15_000) });
  const d = await r.json();
  if (!r.ok) throw new Error(`youtube ${r.status}: ${String(d?.error?.message ?? '').slice(0, 120)}`);

  return (d.items ?? []).map((i: any) => ({
    external_id: i.snippet.resourceId.videoId,
    url: `https://www.youtube.com/watch?v=${i.snippet.resourceId.videoId}`,
    title: i.snippet.title,
    published_at: i.snippet.publishedAt,
  }));
}
