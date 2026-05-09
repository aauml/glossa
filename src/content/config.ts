import { defineCollection, z } from 'astro:content';

const articles = defineCollection({
  type: 'content',
  schema: z.object({
    slug: z.string(),
    issue: z.string(),
    date: z.string(),
    sortDate: z.string(),
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
    hidden: z.boolean().optional().default(false),
  }),
});

export const collections = { articles };
