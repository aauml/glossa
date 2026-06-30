# 06 · Publicación

## Repo y despliegue

- **Repo:** `aauml/lecturas` (se renombra a `glossa` — ver [09](09-Decisiones-Abiertas.md)). Astro + Vercel; cada *push* a `main` despliega producción.
- **Una pieza =** `src/content/articles/{slug}/en.mdx` + `es.mdx` (+ `sources.json`). El frontmatter y los componentes (`Lede`, `Section`, `Standfirst`, `ContextBox`, exhibits…) ya están definidos en el skill y en su `references/deployment.md`.

## Flujo tool-neutral

1. Acceder al repo con tooling Git/GitHub autenticado.
2. Crear `en.mdx` y `es.mdx` (+ `sources.json`).
3. Correr la validación/build disponible (`npm run build` / `check`).
4. *Commit* (`N° XX — título corto`) y *push* a `main`.
5. Esperar el despliegue de Vercel.
6. Verificar las URLs EN/ES en vivo.

## Desde el móvil

El *commit* se hace por **conector GitHub** (la API crea archivos y commits) — sin shell. Así el "créalo" funciona desde el chat en el teléfono.

## Bilingüe

EN y ES se producen en la misma pasada. El español **no es traducción literal**: se reescribe para ritmo e idioma, con convenciones ibéricas, preservando argumento, estructura y datos. Cuidado con números e instituciones: *billion* → "mil millones"; *trillion* → "billón".
