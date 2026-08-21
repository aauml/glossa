import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// `sortDate` ordena la portada. Llevaba sufijos manuales (2026-06-30b/c/d) para
// desempatar piezas del mismo día, mezclados con algún ISO completo: el orden
// dependía de comparar cadenas de formatos distintos. Ahora es siempre un
// timestamp local y el build falla si alguien vuelve al formato antiguo.
const SORT_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
// `issue` identifica la pieza en la colección. El sufijo de letra desambigua
// números reutilizados en su día (N° 26, N° 26b…).
const ISSUE = /^N\.?[°º] \d{1,3}[a-z]?$/;

const articles = defineCollection({
  // Content Layer (Astro 6+): la API `type: 'content'` con carpeta implícita
  // se retiró. El `id` que produce este loader es "{slug}/{lang}" — sin la
  // extensión que traía la API vieja, y el código ya la recortaba igualmente.
  loader: glob({ pattern: '**/[^_]*.mdx', base: './src/content/articles' }),
  schema: z.object({
    issue: z.string().regex(ISSUE, 'issue debe ser "N° 33" (EN) o "N.º 33" (ES), con sufijo de letra opcional'),
    date: z.string(),
    sortDate: z.string().regex(SORT_DATE, 'sortDate debe ser ISO local completo, p. ej. "2026-06-30T09:00:00"'),
    title: z.string(),
    titleHTML: z.string(),
    dek: z.string(),
    dekHTML: z.string().optional(),
    coverDek: z.string(),
    kicker: z.string().optional(),
    source: z.string().optional(),
    sourceLabel: z.string().optional(),
    topics: z.array(z.string()),
    language: z.enum(['en', 'es']),
    track: z.enum(['general', 'thesis', 'ai-policy', 'finance', 'geopolitics']).optional().default('general'),
    hidden: z.boolean().optional().default(false),
  }),
});

export const collections = { articles };
