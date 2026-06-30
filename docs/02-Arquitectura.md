# 02 · Arquitectura

## Tres piezas, tres roles

| Pieza | Rol | Dónde vive |
|---|---|---|
| **Cerebro** | Lógica editorial, voz, modos, compuertas | El **skill** (hoy `lecturas`, se renombra a `glossa`) |
| **Alcance** | Búsqueda en APIs, KB, push a GitHub | **Conectores MCP** (nivel de cuenta) |
| **Vitrina** | Lo público y compartible | **Sitio Astro** en Vercel |

La idea central: el **cerebro es portátil** (un skill funciona en chat, Cowork y Code) y el **alcance es portátil** (conectores a nivel de cuenta están disponibles en cualquier superficie). Por eso no hace falta construir una app: la misma capacidad sigue al usuario a donde esté, dentro del mismo Claude.

## Las cinco capas

Ver los diagramas de referencia *"de punta a punta"* y *"muchas puertas, un solo pasillo"* (en el historial de diseño).

1. **Semilla** — la intención humana que ancla la pieza (hipótesis, ángulo, o reacción a un digest). Fechada y versionada. Es el ancla de autoría.
2. **Investigación** — un *router de fuentes* reparte la consulta según el track: primero el KB, luego las APIs en vivo. Produce un *dossier* con citas. Reemplaza el "Recetario Multi-LLM" manual (~80 min en cinco herramientas) por una corrida.
3. **Análisis** — el modelo (Opus) toma semilla + dossier, arma el *understanding brief*, verifica y redacta el MDX bilingüe. La lógica editorial del skill es el *system prompt*.
4. **Procedencia / verificación** — *sidecar* por pieza (fuentes, qué se verificó, modelo, versión de semilla). Citations API para ligar afirmaciones a fuentes. Ver [05](05-Procedencia-y-Autoria.md).
5. **Publicación** — *commit* de los MDX + sidecar al repo; Vercel despliega EN/ES. Ver [06](06-Publicacion.md).

## Surface-agnostic

El objetivo es empezar una idea donde sea —incluido el móvil en la calle— y que la misma capacidad esté disponible. Se logra no atando nada a una superficie:

- **Cerebro → skill.** Portátil por definición.
- **Alcance → conectores MCP.** A nivel de cuenta, disponibles en chat/móvil, Cowork y Code.
- **Memoria → KB hospedado** y expuesto como conector (ver [04](04-Investigacion-y-KB.md)), para que también sea alcanzable desde el móvil.

La única asimetría entre superficies es el *shell* (ver [03](03-Modos-Compuertas-y-Superficies.md)); por eso se prefieren conectores sobre scripts.
