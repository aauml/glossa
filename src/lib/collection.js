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

/**
 * Los temas de los filtros de la portada: los de lo que se está publicando
 * AHORA, no los de toda la historia.
 *
 * Contar sobre las cuarenta y ocho piezas dejaba una fila fija —«NIST AI RMF»,
 * «Brussels Effect», «Regulatory interoperability»— de una tanda de piezas
 * académicas de hace meses, mientras México, Pemex o el Estrecho de Ormuz, que
 * es lo que hay arriba de la lista, no aparecían. El filtro describía el
 * archivo y no el contenido; quien lo miraba veía una portada parada.
 *
 * La ventana son las quince últimas piezas: dentro de ella manda la frecuencia
 * —un tema que vuelve importa más que uno de una sola vez— y el empate lo
 * rompe la más reciente, porque `articles` ya viene de nueva a vieja.
 */
export function topTopics(articles, limit = 8, dias = 30) {
  // La ventana es de TIEMPO, no de número de piezas. Con quince entraban las
  // académicas de junio —solo hay cinco de esta semana— y volvían «Ontology» y
  // «NIST AI RMF» a una portada que hoy habla de México y de Irán. Si en la
  // ventana hay muy poco, se cae a las ocho últimas para no dejar la fila coja.
  // Treinta días y no sesenta: con sesenta entraban las del 30 de junio, que
  // caen dentro por dos días y traen consigo media portada de hace dos meses.
  const corte = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10);
  let recientes = articles.filter(a => String(a.data.sortDate || '').slice(0, 10) >= corte);
  if (recientes.length < 4) recientes = articles.slice(0, 8);
  const freq = new Map();
  const visto = new Map();
  recientes.forEach((a, i) => {
    for (const t of (a.data.topics || [])) {
      freq.set(t, (freq.get(t) || 0) + 1);
      if (!visto.has(t)) visto.set(t, i);
    }
  });
  return [...freq.entries()]
    .sort((x, y) => y[1] - x[1] || visto.get(x[0]) - visto.get(y[0]))
    .slice(0, limit).map(e => e[0]);
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
