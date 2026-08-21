# Glossa — CLAUDE.md

Guía para Claude al trabajar en este proyecto. El diseño completo está en [`/docs`](docs/).

## Recursos declarados (para Umbrella / Panel Madre)

Bloque de inventario cross-proyecto — ver `aauml/umbrella`. Actualizar si cambia el stack.

```yaml
resources:
  database:
    provider: Supabase (phd-kb)
    capability: relational database
    implemented_in: docs/11-Integracion-phd-kb.md
  vector_store:
    provider: Supabase (phd-kb)
    capability: vector database / embeddings
    implemented_in: scripts/research_from_supabase.mjs
  deployment:
    provider: Vercel
    capability: deployment / hosting
    implemented_in: skills/references/deployment.md
  dns:
    provider: Cloudflare
    capability: DNS / caching
  source_control:
    provider: GitHub
    capability: repository / CI-CD
    implemented_in: .github/workflows/glossa-publish.yml
  research_sources:
    - provider: OpenAlex
      capability: search / benchmarking
      implemented_in: scripts/research_from_supabase.mjs
    - provider: Tavily
      capability: search / benchmarking
      implemented_in: scripts/research_from_supabase.mjs
  ai_models:
    provider: Anthropic
    capability: LLM
    implemented_in: skills/SKILL.md
  secrets:
    provider: 1Password
    capability: credential management
```

**Las rutas de `implemented_in` son relativas a la raíz del repo `aauml/glossa`**, que es la fuente de verdad. La carpeta de Drive es un espejo parcial: solo `docs/`, `db/migrations/` y este archivo. El código (`src/`, `scripts/`, `.github/`, `skills/`, `supabase/`) vive únicamente en el repo.

Nota: `provider` de la base de datos usa a propósito el mismo texto que declara `thesis-repo` (`Supabase (phd-kb)`) — es la MISMA cuenta/proyecto, reutilizada, no una copia. Glossa solo lee (`evaluated_items`, `semantic-search`), no administra el esquema ni escribe fuera de `glossa_*`. El KB vectorial lo posee `thesis-repo`; aquí `implemented_in` apunta a cómo se **consulta** desde un worker sin secretos.

Nota: el deployment sí existe y está en vivo — sitio Astro en Vercel, dominio `glossa.ademas.ai` (CNAME en Cloudflare → `cname.vercel-dns.com`, DNS-only). Cada push a `main` de `aauml/glossa` despliega.

Nota: lo más reutilizable de este repo es **publicar desde una superficie sin shell** (chat/móvil): `Supabase (cola) → pg_net → repository_dispatch → GitHub Action → commit → Vercel → write-back de URLs`. La cadena está documentada en la cabecera de `.github/workflows/glossa-publish.yml`; el mismo patrón, para investigación, en `.github/workflows/glossa-research.yml` + `scripts/research_from_supabase.mjs`.

Nota (2026-08-20, corrige lo anterior): el worker **no** corre *secretless*. Se intentó con la anon key pública y falló de las dos maneras posibles — dejó de funcionar el 2026-07-01 cuando `anon` perdió el UPDATE, y mientras funcionó era la misma apertura que permitía a cualquiera encolar una publicación. Ahora: la cola la escribe la **service key** desde GitHub Secrets, y la edge function `glossa-enqueue` exige la cabecera `x-glossa-token`. Si vas a reutilizar el patrón, cópialo con la compuerta, no sin ella.

Nota: `ai_models` es Anthropic porque el análisis y la redacción los hace Claude ejecutando `skills/SKILL.md` — **no hay ninguna llamada a una API de LLM en el código**. `.env.example` declara `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` y `OPENAI_API_KEY` (plan del doc 10), pero ningún archivo los usa todavía; por eso no se declaran aquí como recursos. Ver la tabla plan-vs-estado al principio del doc 10.

## 1Password — Acceso a secretos (ya configurado, headless)

`op` (1Password CLI) ya está autenticado de forma global con el service account `claude-code-sandbox` vía `~/.zshenv` (token de solo lectura, en todas las sesiones). No hay que hacer login ni abrir la app de 1Password. Verifícalo: `op whoami` → User Type: SERVICE_ACCOUNT.

Todos los secretos viven en una sola bóveda: `ademas.ai`, organizados por nombre (ej.: `Radius - OpenAI API Key`, `Radius - Neon DATABASE_URL`, `Supabase thesis`).

Leer un secreto (úsalo directo en variable, NO lo imprimas en el chat):

```bash
KEY=$(op item get "Radius - OpenAI API Key" --vault ademas.ai --fields credential --reveal)
```

Ver los campos de un item: `op item get "NOMBRE" --vault ademas.ai --format json`

Listar/buscar items: `op item list --vault ademas.ai`

Es solo lectura (no escribe/edita). Si una sesión vieja pide el master password, ciérrala y abre una nueva (o `exec zsh`) para que tome el token de `~/.zshenv`.
