# 12 · Runbook — continuar en Claude Code

Lo que falta necesita **GitHub** (escribir en repos), **secretos vía `op`** y **publicar** —solo alcanzable desde Code. Cowork ya dejó: el diseño, los docs 01–11 y la base (migración 0001 en `phd-kb`).

## Estado al entrar
- **DB lista:** tablas `glossa_*` en `phd-kb` (migración 0001 aplicada y verificada).
- **KB con fuel:** ~500 items en `evaluated_items` sobre riesgo/contestabilidad + inventario `federal_ai_systems` (445). Material de sobra para PATTERN.
- **Memoria:** hay una fila reciente en `session_summaries` (canal `cowork`) con todo este trabajo.

## Orden de ejecución
1. **Entorno:** `op whoami` (→ SERVICE_ACCOUNT) y `op item list --vault ademas.ai`. Probar OpenRouter (snippet del doc 10).
2. **Gobernanza en `aauml/thesis`:** aplicar la fila PUB en `AGENTS.md`, el bloque `D-NNN` en `DECISIONS.md` y la entrada de `CHANGELOG.md` (textos listos en el doc 11). Push.
3. **Repo de Glossa:** crear o renombrar `aauml/lecturas` → `aauml/glossa`; subir esta carpeta (README, docs, `db/migrations`, CLAUDE.md).
4. **Skill:** evolucionar `lecturas` → `glossa` (leer de `phd-kb`, escribir `glossa_*`, modos/compuertas, bilingüe; alinear con SKILL-CHAT/SKILL-KB).
5. **Conectores / keys (vía `op`):** Exa + OpenAlex + GitHub + OpenRouter.
6. **Fase 1 — pieza PATTERN, de punta a punta:** semilla (`glossa_seeds`) → research (KB semantic-search + Exa + OpenAlex) → compuerta → MDX EN/ES → push → verificar URLs → registrar en `glossa_issues` / `glossa_issue_sources`.

## Decisiones tomadas
- **Buscador:** Exa (semántico; Tavily como fallback barato). Swappable.
- **DB:** phd-kb (migración 0001 aplicada).
- **Modelos:** OpenRouter (baratos) + Anthropic directo (Opus) + embeddings dedicados.

## Prompt para arrancar en Code (pegar tal cual)

```
Proyecto Glossa (capa de publicación sobre phd-kb).
1) Lee /docs, sobre todo 11-Integracion-phd-kb y 12-Runbook-Code, y las últimas filas de session_summaries en Supabase phd-kb (wtwuvrtmadnlezkbesqp).
2) Verifica op (op whoami) y OpenRouter.
3) Ejecuta el Runbook (doc 12) en orden: gobernanza en aauml/thesis, repo glossa, skill, conectores, y la primera pieza (PATTERN) de punta a punta.
Respeta las compuertas: pregúntame antes de fijar la tesis y antes de publicar.
```
