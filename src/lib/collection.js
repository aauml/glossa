import { getCollection } from 'astro:content';

/**
 * Las piezas de un idioma, listas para la portada y para los feeds.
 * La portada solo existía en inglés y repetía esta lógica inline; extraerla
 * evita que la versión española derive de la inglesa.
 */
export async function articlesByLang(lang) {
  const all = await getCollection('articles');
  return all
    .filter(a => a.data.language === lang && !a.data.hidden)
    .map(a => ({ ...a, slug: a.id.split('/')[0].replace(/\.mdx$/, '') }))
    .sort((a, b) => b.data.sortDate.localeCompare(a.data.sortDate));
}

/** Temas más frecuentes, para los filtros de la portada. */
export function topTopics(articles, limit = 8) {
  const freq = new Map();
  for (const a of articles) for (const t of (a.data.topics || [])) freq.set(t, (freq.get(t) || 0) + 1);
  return [...freq.entries()].sort((x, y) => y[1] - x[1]).slice(0, limit).map(e => e[0]);
}

/** Qué idiomas existen para cada slug — para hreflang y para el conmutador. */
export async function langsBySlug() {
  const all = await getCollection('articles');
  const m = new Map();
  for (const entry of all) {
    const [slug, langWithExt] = entry.id.split('/');
    const lang = langWithExt.replace(/\.mdx$/, '');
    if (!m.has(slug)) m.set(slug, new Set());
    m.get(slug).add(lang);
  }
  return m;
}
