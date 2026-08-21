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

---

# Lecciones

Escritas para que Umbrella las enrute a los demás proyectos. Formato: fecha,
título, y a qué recurso declarado aplican.

### 2026-08-20 — "Sin secretos en el repo" no es lo mismo que mínimo privilegio
_Applies to: Supabase · relational database · Vercel · deployment / hosting_

El worker de publicación corría con la anon key pública, documentado como
*worker secretless* y presentado como mínimo privilegio. Falló de las dos formas
posibles a la vez: el endpoint que lo alimentaba quedó **abierto a internet**
—cualquiera podía encolar un artículo que se commiteaba a `main` y se desplegaba—
y además **dejó de funcionar** el día que `anon` perdió el UPDATE que necesitaba.

Si el escritor necesita permiso de escritura, dárselo a `anon` se lo da a todo el
mundo. La pregunta que hay que hacerse en voz alta al diseñar una cola es *quién
puede escribir en ella*. Corregido con una cabecera de token propio
(`supabase/functions/_shared/auth.ts`) más service key en Secrets del repo.

### 2026-08-21 — Un modelo prefiere el metadato al contenido, y eso rompe la atribución
_Applies to: Anthropic · LLM · ai_models_

Al resumir un vídeo pasándole el título del feed como pista, el modelo identificó
correctamente por el audio quién hablaba pero **atribuyó la tesis al nombre del
título**, que era otro. Nada falló visiblemente: la salida era coherente y
plausible, con la persona equivocada.

En cualquier sistema cuyo valor sea la procedencia, esto es el peor fallo posible
y no lo detecta ningún test de "¿respondió?". La corrección es decirle
explícitamente qué fuente manda cuando hay conflicto, y **obligarle a declarar la
discrepancia** en un campo propio en vez de resolverla en silencio.

### 2026-08-21 — Gemini: el suelo de coste de un vídeo es su audio
_Applies to: ai_models · research_sources_

Medido sobre un episodio de una hora: 332.772 tokens al muestreo por defecto,
frente a un tope de 250.000/min en el tramo gratuito — o sea, ni uno entra.
Bajando a 0,1 fps son 126.375 y entra con margen. Por debajo de 0,05 fps ya no
baja: lo que queda es el audio, que es irreducible.

Para entrevistas de bustos parlantes el vídeo no aporta nada, así que 0,1 fps es
el punto. Y los modelos **Pro no están en el tramo gratuito** (cuota 0): solo la
familia Flash.

### 2026-08-21 — Una salida sin lector es peor que ninguna salida
_Applies to: GitHub · repository / CI-CD_

Aplicando `STANDARD-PUBLISHED-OUTPUT` a este proyecto apareció el caso exacto que
el estándar describe: los dossiers del radar se habían diseñado **sin ningún
lector**. Se habrían generado cada noche, envejeciendo sin que nadie los abriera,
dando la falsa impresión de que el sistema funcionaba porque "corría bien".

El panel de administración es lo que los convierte en algo consumido. La regla
práctica que queda: al diseñar un artefacto nuevo, nombrar al lector **antes** de
escribir el generador — si no hay nombre, no se construye el generador.

