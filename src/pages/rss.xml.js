import rss from '@astrojs/rss';
import { articlesByLang } from '../lib/collection.js';
import { semanalesRss } from '../lib/rss-semanal.js';

// En vivo, como las páginas del semanal: el feed estático solo veía los MDX
// del repo, así que 49 números publicados no entraron NUNCA en el RSS — se
// publican con un PATCH a la base, sin commit ni rebuild. Servido en vivo, el
// feed dice siempre lo que hay; si la base no contesta, degrada a los
// artículos del repo, que es exactamente lo que había antes.
export const prerender = false;

// Un feed por idioma: mezclar EN y ES en uno solo obliga al lector a filtrar.
export async function GET(context) {
  const articles = await articlesByLang('en');
  const items = [
    ...articles.map(a => ({
      title: `${a.data.issue} — ${a.data.title}`,
      description: a.data.coverDek,
      pubDate: new Date(a.data.sortDate),
      link: `/articles/${a.slug}/en/`,
      categories: a.data.topics,
    })),
    ...await semanalesRss('en'),
  ].sort((a, b) => b.pubDate - a.pubDate);
  return rss({
    title: 'Glossa — annotated readings',
    description: 'Personal annotated readings. I direct, AI executes. Every claim traced to a real source.',
    site: context.site,
    customData: '<language>en</language>',
    items,
  });
}
