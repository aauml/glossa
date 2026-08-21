import rss from '@astrojs/rss';
import { articlesByLang } from '../lib/collection.js';

export async function GET(context) {
  const articles = await articlesByLang('es');
  return rss({
    title: 'Glossa — lecturas anotadas',
    description: 'Lecturas anotadas personales. Yo dirijo, la IA ejecuta. Cada afirmación trazada a una fuente real.',
    site: context.site,
    customData: '<language>es</language>',
    items: articles.map(a => ({
      title: `${a.data.issue} — ${a.data.title}`,
      description: a.data.coverDek,
      pubDate: new Date(a.data.sortDate),
      link: `/articles/${a.slug}/es/`,
      categories: a.data.topics,
    })),
  });
}
