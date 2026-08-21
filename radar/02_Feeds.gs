/**
 * Lectura de RSS. YouTube y los podcasts publican feeds abiertos: no hay que
 * raspar nada ni usar claves. Es la vía limpia para saber qué hay nuevo.
 */

const NS_ATOM  = XmlService.getNamespace('http://www.w3.org/2005/Atom');
const NS_YT    = XmlService.getNamespace('yt',    'http://www.youtube.com/xml/schemas/2015');
const NS_MEDIA = XmlService.getNamespace('media', 'http://search.yahoo.com/mrss/');

function fetchFeed_(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (res.getResponseCode() >= 300) throw new Error(`feed ${res.getResponseCode()}: ${url}`);
  return XmlService.parse(res.getContentText()).getRootElement();
}

/** Canal de YouTube: feed Atom con el videoId ya separado. */
function parseYouTube_(root) {
  return root.getChildren('entry', NS_ATOM).map(e => ({
    external_id: e.getChildText('videoId', NS_YT),
    url: `https://www.youtube.com/watch?v=${e.getChildText('videoId', NS_YT)}`,
    title: e.getChildText('title', NS_ATOM),
    published_at: e.getChildText('published', NS_ATOM),
  }));
}

/** Podcast: RSS 2.0. El audio va en <enclosure>, que es lo que Gemini escuchará. */
function parsePodcast_(root) {
  const ch = root.getChild('channel');
  if (!ch) return [];
  return ch.getChildren('item').map(it => {
    const enc = it.getChild('enclosure');
    const guid = it.getChildText('guid') || (enc && enc.getAttribute('url').getValue());
    return {
      external_id: guid,
      url: (enc && enc.getAttribute('url').getValue()) || it.getChildText('link'),
      title: it.getChildText('title'),
      published_at: new Date(it.getChildText('pubDate')).toISOString(),
    };
  }).filter(x => x.url);
}

function readSource_(src) {
  const root = fetchFeed_(src.feed_url);
  const items = src.kind === 'youtube' ? parseYouTube_(root) : parsePodcast_(root);
  return items.filter(i => i.external_id && i.published_at);
}

/**
 * Muchos títulos vienen como "Invitado: tema". Separarlo aquí evita gastar una
 * llamada al modelo solo para saber quién habla.
 */
function splitGuest_(title) {
  const m = /^([^:]{3,60}):\s*(.+)$/.exec(title || '');
  return m ? { author: m[1].trim(), subject: m[2].trim() } : { author: null, subject: title };
}
