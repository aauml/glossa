# 09 · Decisiones abiertas

Lo que falta decidir antes de o durante la construcción.

## Técnicas

- **Hospedaje del KB.** Supabase pgvector u otra opción de índice vectorial con endpoint MCP. *(Bloquea la Fase 2.)*
- **Buscadores de pago.** Cuál entra primero (Exa vs Tavily vs Perplexity API) y con qué presupuesto. *(Afecta la Fase 1.)*
- **Set mínimo de conectores para el MVP.** Confirmar: buscador + OpenAlex + GitHub.

## Marca / migración

- **Renombrar `lecturas` → `glossa`. ✅ HECHO (2026-06-30, desde Code):**
  - Repo `aauml/lecturas` → `aauml/glossa` (rename, conserva historia y enlace de Vercel).
  - Skill `lecturas` → `glossa`.
  - **Subdominio `glossa.ademas.ai`** añadido al proyecto Vercel; DNS CNAME en Cloudflare (zona `ademas.ai`, DNS-only). Canonical del sitio = `https://glossa.ademas.ai`.
  - Redirección `lecturas-ten.vercel.app` → `glossa.ademas.ai` (308, preserva ruta) para no romper enlaces.
- **Identidad visual** (logotipo, tipografía) y **marca visible en el masthead** del sitio (hoy aún "Lecturas"): pendiente — ver [docs/08](08-Marca-y-Nombre.md).

## Editoriales

- **Idioma de la documentación del repo.** Esta carpeta está en español; ¿se mantiene o se duplica en inglés para el repo público?
- **Alcance público de la procedencia.** Cuánto del rastro (semilla, fuentes) se expone en el sitio.

---

*Cuando se cierre una de estas, anótese aquí la decisión y la fecha, y muévase lo que corresponda al Roadmap.*
