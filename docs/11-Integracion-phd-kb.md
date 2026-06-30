# 11 · Integración con phd-kb

> Este doc corrige el encuadre "de cero" de los docs 01/04/05: Glossa **no** construye KB, vigilancia, memoria ni costos —eso ya existe en `phd-kb`. Glossa es la **capa de publicación** encima.

## El sistema existente

`aauml/thesis` + Supabase `phd-kb`, con dos dominios (PM y KB), memoria cross-superficie (`session_summaries`), decisiones (`DECISIONS.md` / D-NNN), vigilancia (`monitors` + `monitor_findings`), KB con embeddings (`evaluated_items`) y validación de fuentes (`source_validations`).

**Tesis (marco correcto):** interoperabilidad **EU AI Act ↔ NIST AI RMF**; crosswalk **ontológico** RIA Arts. 11-14 ↔ NIST; caso **PATTERN** (DOJ/BOP); comparativos STRmix, NGI-IPS. Programa **IA Aplicada** (USAL); dir. Bueno de Mata (procesal) + codir. Chamoso (técnico).

## Glossa = tercer dominio "Publicación" (PUB)

No construye KB ni vigilancia: los **consume**. Lee del KB, no lo modifica. Convierte fuentes + hallazgos en lecturas bilingües publicadas con procedencia.

## Schema aplicado (migración 0001 · additive-only)

Tres tablas `glossa_*` en `phd-kb`, RLS habilitado, referencian lo existente (archivo: `db/migrations/0001_glossa_publication_layer.sql`; aplicada 2026-06-30, `success`):

- **`glossa_seeds`** — intención humana fechada (autoría); orígenes opcionales → `monitor_findings` / `reading_conversations` / `evaluated_items`.
- **`glossa_issues`** — artículo + pipeline (`status`: seed→researching→drafting→review→published), bilingüe, `topics`, `chapters`, `model`.
- **`glossa_issue_sources`** — procedencia: `issue` ↔ `evaluated_items(pk)` con `role`, `claim`, `verified`.

## Reutilización (no duplicar)

| Necesidad de Glossa | Lo resuelve (ya existe) |
|---|---|
| Fuentes | `evaluated_items` (+ embeddings / semantic-search) |
| Entradas (vigilancia / fuente) | `monitor_findings.thesis_angle`, `reading_conversations` |
| Verificación de fuentes | `source_validations` |
| Memoria y decisiones | `session_summaries`, `DECISIONS.md`, `CHANGELOG.md` |
| Costos | `infra_costs` |

## Fronteras (regla de dominio)

- **PUB (Glossa)** posee `glossa_*` y el repo de Glossa. **Lee** del KB; no escribe en `evaluated_items` ni toca PM.
- No tocar `agent_docs` (espejo de solo lectura, poblado por `sync-docs.yml`).

## Pendiente en `aauml/thesis` (aplicar desde Code — no alcanzable desde Cowork)

**AGENTS.md** — añadir a la tabla de dominios una fila para PUB:

```
| tablas `glossa_*`, repo de Glossa | **PUB** | (skill de Glossa) |
```

**DECISIONS.md** — registrar (asignar el siguiente `D-NNN`):

```
## D-NNN | Glossa como dominio de Publicación (PUB)
- Glossa es la capa de publicación sobre phd-kb: convierte KB + vigilancia en lecturas bilingües publicadas con procedencia.
- Datos: tablas glossa_* en phd-kb (additive, migración 0001). Código: repo propio (aauml/glossa), separado de aauml/thesis; comparte la Supabase phd-kb.
- Frontera: PUB lee del KB, no lo modifica; no toca PM.
- Fecha: 2026-06-30.
```

**CHANGELOG.md** — entrada:

```
## 2026-06-30 | cowork | glossa/phd-kb | Capa de publicación Glossa
- Migración 0001: glossa_seeds/issues/issue_sources en phd-kb (additive, RLS).
- Glossa recolocado como dominio PUB sobre el KB existente.
```
