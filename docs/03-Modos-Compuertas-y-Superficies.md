# 03 · Modos de entrada, compuertas y superficies

## Modos de entrada

La semilla no siempre es una tesis previa; es **la intención humana**, y su posición se mueve según cómo arranque la pieza.

| Modo | Qué traigo | Dónde entra mi autoría | ¿Pasa por digest? |
|---|---|---|---|
| **Tesis primero** | Una hipótesis formada | Al inicio | No |
| **Serie** | Un hueco del argumento a tapar | Al inicio | No |
| **Fuente primero** | URL / PDF / pódcast / YouTube | Tras el digest (mi reacción) | Sí |
| **Pregunta primero** | Una duda, sin tesis aún | Tras el digest | Sí |
| **Vigilancia** | Nada — la máquina avisa | Tras el digest | Sí |
| **Dialéctica** | Dos fuentes en tensión | Tras el digest | Sí |

- **Multimedia:** YouTube y pódcast entran por un paso de **ingesta** (transcripción) antes del digest. Al router le da igual un URL, un PDF, un *paste* o un vídeo.
- **Vigilancia** es la puerta especial: la inicia la máquina, no yo. Radares permanentes (nuevos informes GAO, *Federal Register* sobre IA, demandas que citen un sistema, papers nuevos) que, al detectar algo, mandan un digest: "¿lo convertimos en lectura?". Se implementa con **tareas programadas**.

Lo invariante en todos los modos: entra una intención humana fechada y hay una compuerta antes de escribir. Lo único que cambia es por dónde empieza a correr el agua.

## Compuertas (supervisión humana)

Una compuerta es una parada donde el flujo **se detiene y espera mi OK**. Dos funciones:

- **Encuadre** — se fija la tesis/ángulo. En modo materia-prima ocurre tras el digest; en modo ángulo ya viene puesto.
- **Revisión** — se aprueba (y se edita) el borrador y/o las fuentes antes de publicar.

En **modo ángulo** ambas pueden colapsar en una sola conversación. En **modo materia-prima** hay hasta tres toques míos: reacciono en el digest, encuadro la tesis y reviso antes de publicar. **Nada se escribe ni se publica sin OK.** La compuerta es elástica: durante la conversación se tira de fuentes según hace falta —no es estrictamente "antes" ni "después" de investigar; es el ping-pong.

## Superficies y portabilidad

| Superficie | Conversar | Ejecutar búsquedas | Publicar | Notas |
|---|---|---|---|---|
| **Chat / móvil** | Sí | Vía conectores + web search | Vía conector GitHub (commits por API) | **Sin shell**: solo corre lo que sea conector o herramienta nativa |
| **Cowork** | Sí | Sí (conectores + bash + web) | Sí (conectores o git) | Entorno completo; bueno para conversar y operar |
| **Claude Code** | Sí | Sí | Sí | Mejor para **construir** la tubería y el repo |

**Consecuencia clave:** como el móvil no tiene shell, todo lo que dependa de código no corre ahí. Por eso **investigación y publicación van por conectores**. Lo único que hay que hospedar para que sea alcanzable desde el móvil es el **KB**.

**Flujo desde el móvil:** idea en el chat → la masajeo hasta la teoría → el skill trae info por conectores + web → discutimos (compuerta) → "créalo" → commit por conector GitHub → Vercel publica. Funciona entero sin tocar una terminal.
