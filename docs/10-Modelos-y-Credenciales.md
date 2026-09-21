# 10 · Modelos y credenciales

## Estado actual (2026-08-20) — antes de leer el plan

**Este repo no llama a ninguna API de LLM.** Ni `scripts/`, ni las edge functions, ni los
workflows. El modelo que produce las piezas es **Claude ejecutando `skills/SKILL.md`** desde
la superficie que se esté usando (Code, Cowork, chat); el reparto de abajo es el plan al que
se quiere llegar, no lo que corre hoy.

| Pieza | Plan (abajo) | Hoy |
|---|---|---|
| Análisis y redacción | Anthropic API (Opus) | Claude ejecutando el skill, sin API propia |
| Carga barata (triaje, ranking) | OpenRouter | no existe |
| Embeddings del KB | proveedor dedicado y fijo | los pone `thesis-repo`: `kb_chunks` en `vector(1536)` (text-embedding-3); el `vector(384)` de su edge function `generate-embeddings` es de OTRA tabla (`evaluated_items`) |
| Búsqueda web | Exa (decidido) | Tavily (opcional) + OpenAlex sin clave |

Consecuencias prácticas:
- `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` y `OPENAI_API_KEY` están declaradas en
  `.env.example` y **ningún archivo las lee**. La única clave que se consume de verdad es
  `TAVILY_API_KEY`, y es opcional.
- La columna `glossa_issues.model` existe desde la migración 0001 y solo se escribe si el
  workflow declara `GLOSSA_MODEL`. Si no se va a poblar, retirarla.
- **Corregido (2026-09-01, medido contra la base):** el KB (los chunks del RAG, `kb_chunks`)
  es **`vector(1536)`** — `text-embedding-3` a dimensión nativa, la duda quedó confirmada. El
  `vector(384)` que decía aquí es de `evaluated_items` (gte-small), otra tabla y otro pipeline.
  El conteo de chunks cambia a diario (46.675 al medir); no fijarlo aquí. Ojo: en `aauml/thesis`
  hay una propuesta abierta de REDUCIR esa dimensión por espacio en disco (su issue 15), así que
  antes de alinear nada con el KB, la fuente de verdad es la base misma, no este doc.

## Reparto de modelos (plan)

- **OpenRouter → el zoo de modelos baratos, para la carga.** Triaje y resumen de muchas fuentes, ranking de relevancia, limpieza de transcripciones, etiquetado del KB, verificación cruzada multi-modelo. Sirve igual para Glossa y para el PhD.
- **Anthropic directo (NO vía OpenRouter) → Opus** para el análisis y la redacción final, y para Citations/caching. El premium se queda directo.
- **Embeddings (KB) → proveedor dedicado** (OpenAI `text-embedding-3`, Voyage o Gemini), no OpenRouter. **Se elige una vez y se deja fijo**: cambiar de modelo de embeddings obliga a reindexar todo el KB.

## Credenciales

Todas en 1Password, en la bóveda única de la cartera (`$OP_VAULT`). Los
**valores nunca** van al chat ni a git; se leen con `op` (ver
[CLAUDE.md](../CLAUDE.md)). En el repo, un `.env.example` con los **nombres** de
variables, sin valores.

⚠️ **Este repo es público**, así que la tabla de abajo dice *qué hace falta*, no
*cómo se llama el item*. Enumerar los nombres publicaría el mapa de credenciales
de los otros seis proyectos, que son privados. Localiza cada uno en el momento
con `op item list` y el prefijo del proyecto.

| Necesidad | Dónde está | Estado |
|---|---|---|
| Zoo de modelos baratos (OpenRouter) | item propio de Glossa | ✅ en bóveda |
| Embeddings (KB) / OpenAI | se reutiliza la clave de otro proyecto de la cartera | ✅ (sirve para embeddings) |
| Base de datos del KB | la Neon o la Supabase del KB compartido | ✅ elegir una (ambas soportan pgvector) |
| Opus programático (Anthropic API) | — | ⛳ falta (si se llama a Opus por API fuera del chat) |
| Buscador de agente (Exa / Tavily) | — | ⛳ falta |
| Publicación (GitHub) | — | ⛳ por definir (conector o git autenticado) |

## Cómo se consume (desde Claude Code)

```bash
KEY=$(op item get "<ITEM DE OPENROUTER>" --vault "$OP_VAULT" --fields credential --reveal)
# prueba rápida (no imprime la clave):
curl -s https://openrouter.ai/api/v1/models -H "Authorization: Bearer $KEY" -o /dev/null -w "%{http_code}\n"
```

## Notas

- **KB DB:** Neon y Supabase ambos valen (Postgres + pgvector). Elegir **una** para no dispersar el KB.
- **Material sensible del PhD:** usa proveedores sin *logging* (OpenRouter deja filtrarlos) o ve directo al proveedor.
- **Alternativa a OpenRouter:** Vercel AI Gateway, ya que el sitio vive en Vercel —un proveedor menos. Validar features/precios al configurarlo.
- El nombre del item se referencia **exactamente** como está en la bóveda, con su ortografía tal cual (tiene una mayúscula rara a mitad de palabra). Si lo renombras a algo más limpio, hay que actualizar las referencias.
