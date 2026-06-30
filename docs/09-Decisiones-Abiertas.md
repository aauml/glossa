# 09 · Decisiones abiertas

Lo que falta decidir antes de o durante la construcción.

## Técnicas

- **Hospedaje del KB.** Supabase pgvector u otra opción de índice vectorial con endpoint MCP. *(Bloquea la Fase 2.)*
- **Buscadores de pago.** Cuál entra primero (Exa vs Tavily vs Perplexity API) y con qué presupuesto. *(Afecta la Fase 1.)*
- **Set mínimo de conectores para el MVP.** Confirmar: buscador + OpenAlex + GitHub.

## Marca / migración

- **Renombrar `lecturas` → `glossa`.** Tarea pendiente y consecuente (necesita manos y credenciales):
  - Repo `aauml/lecturas` → `glossa` (o nuevo repo).
  - Proyecto y URL en Vercel (`lecturas-ten.vercel.app` → dominio/sub nuevo).
  - Skill `lecturas` → `glossa`.
  - Redirecciones para no romper enlaces existentes.
- **Subdominio exacto** bajo el paraguas "AI" (p. ej. `glossa.[tu-dominio]`).
- **Identidad visual** (logotipo, tipografía, encaje con el resto de apps).

## Editoriales

- **Idioma de la documentación del repo.** Esta carpeta está en español; ¿se mantiene o se duplica en inglés para el repo público?
- **Alcance público de la procedencia.** Cuánto del rastro (semilla, fuentes) se expone en el sitio.

---

*Cuando se cierre una de estas, anótese aquí la decisión y la fecha, y muévase lo que corresponda al Roadmap.*
