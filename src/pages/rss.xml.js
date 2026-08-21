import rss from '@astrojs/rss';
import { articlesByLang } from '../lib/collection.js';

// Un feed por idioma: mezclar EN y ES en uno solo obliga al lector a filtrar.
export async function GET(context) {
  const articles = await articlesByLang('en');
  return rss({
    title: 'Glossa — annotated readings',
    description: 'Personal annotated readings. I direct, AI executes. Every claim traced to a real source.',
    site: context.site,
    customData: '<language>en</language>',
    items: articles.map(a => ({
      title: `${a.data.issue} — ${a.data.title}`,
      description: a.data.coverDek,
      pubDate: new Date(a.data.sortDate),
      link: `/articles/${a.slug}/en/`,
      categories: a.data.topics,
    })),
  });
}
