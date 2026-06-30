# 10 · Modelos y credenciales

## Reparto de modelos

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
