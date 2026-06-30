# 04 · Investigación y KB

## Router de fuentes

El router lee la semilla y reparte la consulta por **track** (p. ej. track `thesis` → legal + académico con fuerza). Es **ampliable**: añadir una fuente nueva es registrar un conector, no rehacer nada.

Dos verdades que mandan en esta capa:

- **El techo de calidad lo ponen las fuentes, no el modelo.** Un modelo brillante con fuentes malas escribe desde fuentes malas. La recuperación mejora por curación, no por un modelo más listo.
- **Primero el KB, luego la web.** El corpus propio es el suelo de confianza; las APIs en vivo son la frontera (lo actual).

## Catálogo de fuentes (candidatos)

Precios, límites y autenticación se validan al construir. SSRN y PACER son ariscas y habrá que rodearlas.

- **Académico:** OpenAlex, Semantic Scholar, CrossRef, arXiv.
- **Legal / gov US:** CourtListener (Free Law Project), GovInfo, *Federal Register* API, Congress.gov, Regulations.gov, GAO.
- **Búsqueda para agentes / web:** Exa (semántica), Tavily, Brave, Perplexity API; más el web search nativo de la superficie.
- **Multimedia (ingesta):** transcripción de YouTube / pódcast → texto.
- **KB propio:** conector de recuperación sobre la biblioteca (abajo).

## KB — diseño

- **Fuente inicial:** la biblioteca ya curada (Marco Teórico, Metodología, Corpus Jurídico, Estado del Arte, Caso DOJ…) más las piezas publicadas.
- **Hosting:** un índice vectorial **hospedado** (candidato: Supabase pgvector) expuesto como **conector MCP**, para que sea alcanzable desde cualquier superficie, incluido el móvil. (La *Project knowledge* del chat no sirve: no es portable a Cowork/Code.)
- **Recuperación:** primero el KB, luego web/APIs. Son complementarios: el KB va por detrás en lo que se mueve rápido.
- **Curación:** etiquetas, *dedup* y retirar lo superado. Un KB sin poda se vuelve cajón de sastre; se diseña con curación desde el principio.
- **Volante:** cada pieza publicada + sus fuentes verificadas vuelven como entrada curada. La próxima lectura arranca sabiendo lo anterior; el corpus compone solo.

El KB es además el **puente con la tesis**: una lectura sobre un sistema concreto bebe de las mismas fuentes (informes GAO, validaciones, etc.) que el trabajo doctoral, y al revés.
