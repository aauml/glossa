# 05 · Procedencia y autoría

El registro que convierte una conversación en un activo de portafolio. Es lo que permite decir "esto lo pensé yo, el día X" y "cada afirmación cuelga de una fuente".

## Artefactos de procedencia

- **Semilla** — archivo versionado y fechado. Es la prueba de autoría. Esquema propuesto:

  ```yaml
  id: glossa-0007
  fecha: 2026-06-30
  autor: Arturo
  modo: tesis-primero | fuente-primero | pregunta | vigilancia | dialectica | serie
  tesis: "Enunciado de la hipótesis o ángulo."
  angulo: "Qué quiero argumentar / por dónde."
  notas_previas: "Lo que ya sé o sospecho antes de investigar."
  fuente_origen: "(si aplica) URL/PDF/vídeo que disparó la pieza"
  ```

- **`sources.json` (sidecar por pieza)** — por cada fuente:

  ```json
  {
    "id": "src-01",
    "tipo": "informe | paper | sentencia | norma | nota | video",
    "ref": "URL o cita",
    "respalda": "qué afirmación del artículo sostiene",
    "verificada": "si | no | parcial",
    "como": "cómo se verificó"
  }
  ```

- **Registro de ejecución** — modelo usado, versión del skill, versión de la semilla, fecha de la corrida.
- **Citations API** — liga cada afirmación factual a su fuente durante la redacción.

## Resultado

Un **grafo de procedencia por artículo**: semilla (humana, fechada) → fuentes (con verificación) → borrador → publicación. Opcionalmente, **páginas públicas de procedencia/método** en el sitio (la versión "producto" de la vitrina), que enseñan la semilla y las fuentes de cada pieza. Es el diferenciador frente al *slop*.

## Regla de seguridad

Nunca se piden, revelan, pegan ni guardan tokens, PATs ni secretos en chat ni en archivos. Se usan remotos autenticados, conectores o variables de entorno seguras. Si no hay vía segura, se crean los archivos y se indica qué credencial falta —sin pedirla en claro.
