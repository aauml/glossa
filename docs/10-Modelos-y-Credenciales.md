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
| Embeddings del KB | proveedor dedicado y fijo | los pone `thesis-repo`: `vector(384)` vía su edge function `generate-embeddings` |
| Búsqueda web | Exa (decidido) | Tavily (opcional) + OpenAlex sin clave |

Consecuencias prácticas:
- `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` y `OPENAI_API_KEY` están declaradas en
  `.env.example` y **ningún archivo las lee**. La única clave que se consume de verdad es
  `TAVILY_API_KEY`, y es opcional.
- La columna `glossa_issues.model` existe desde la migración 0001 y solo se escribe si el
  workflow declara `GLOSSA_MODEL`. Si no se va a poblar, retirarla.
- El KB es **`vector(384)`**, no las 1536 dimensiones nativas de `text-embedding-3`. Antes de
  dar por bueno "OpenAI text-embedding-3" hay que confirmar con `aauml/thesis` qué modelo lo
  generó: cambiarlo obliga a reindexar 43.758 chunks.

## Reparto de modelos (plan)

- **OpenRouter → el zoo de modelos baratos, para la carga.** Triaje y resumen de muchas fuentes, ranking de relevancia, limpieza de transcripciones, etiquetado del KB, verificación cruzada multi-modelo. Sirve igual para Glossa y para el PhD.
- **Anthropic directo (NO vía OpenRouter) → Opus** para el análisis y la redacción final, y para Citations/caching. El premium se queda directo.
- **Embeddings (KB) → proveedor dedicado** (OpenAI `text-embedding-3`, Voyage o Gemini), no OpenRouter. **Se elige una vez y se deja fijo**: cambiar de modelo de embeddings obliga a reindexar todo el KB.

## Credenciales

Todas en 1Password, bóveda `ademas.ai`. Los **valores nunca** van al chat ni a git; se leen con `op` (ver [CLAUDE.md](../CLAUDE.md)). En el repo, un `.env.example` con los **nombres** de variables, sin valores.

| Necesidad | Item en la bóveda | Estado |
|---|---|---|
| Zoo de modelos baratos | `OpenRouter - API KEy` | ✅ en bóveda |
| Embeddings (KB) / OpenAI | `Radius - OpenAI API Key` | ✅ (sirve para embeddings) |
| Base de datos del KB | `Radius - Neon DATABASE_URL` o `Supabase thesis` | ✅ elegir una (ambas soportan pgvector) |
| Opus programático (Anthropic API) | — | ⛳ falta (si se llama a Opus por API fuera del chat) |
| Buscador de agente (Exa / Tavily) | — | ⛳ falta |
| Publicación (GitHub) | — | ⛳ por definir (conector o git autenticado) |

## Cómo se consume (desde Claude Code)

```bash
KEY=$(op item get "OpenRouter - API KEy" --vault ademas.ai --fields credential --reveal)
# prueba rápida (no imprime la clave):
curl -s https://openrouter.ai/api/v1/models -H "Authorization: Bearer $KEY" -o /dev/null -w "%{http_code}\n"
```

## Notas

- **KB DB:** Neon y Supabase ambos valen (Postgres + pgvector). Elegir **una** para no dispersar el KB.
- **Material sensible del PhD:** usa proveedores sin *logging* (OpenRouter deja filtrarlos) o ve directo al proveedor.
- **Alternativa a OpenRouter:** Vercel AI Gateway, ya que el sitio vive en Vercel —un proveedor menos. Validar features/precios al configurarlo.
- El nombre del item se referencia **exactamente** como está en la bóveda (`OpenRouter - API KEy`). Si lo renombras a algo más limpio, hay que actualizar las referencias.
