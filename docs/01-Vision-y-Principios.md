# 01 · Visión y principios

## Qué es, en una frase

Un **sistema de producción intelectual con procedencia verificable**: la autoría de las ideas es humana y la ejecución de la escritura es asistida por IA. El sistema investiga con varias fuentes, lo discutimos hasta acordar una tesis, y produce lecturas tipo revista, bilingües (EN/ES), publicadas en un sitio propio.

Glossa evoluciona el skill `lecturas` (hoy invocado en chat) hacia un proyecto portátil con motor de investigación real y memoria propia, **sin perder la conversación como interfaz**.

## Principio rector

**El pensamiento es mío; la ejecución es asistida.** El análisis, las hipótesis, las tesis y todo lo previo a la escritura los pongo yo. La máquina investiga, verifica, redacta y publica. De ahí salen tres ideas que mandan sobre el diseño:

- **El portafolio no son los artículos, es la prueba de procedencia.** Lo que da valor es el registro demostrable de que las ideas son mías y la ejecución asistida. Esa distinción es la columna vertebral, no un detalle.
- **El modelo se alquila, el corpus se posee.** Los modelos se cambian y mejoran en el calendario de quien los entrena. El KB —la memoria curada— es el activo que construyo yo y que compone bajo mi control. El diferenciador a años vista no es "usé el mejor modelo", sino "tengo un corpus curado y verificado que es mío".
- **El sistema encarna lo que estudia.** Como el interés de fondo es la gobernanza de IA (contestabilidad, supervisión humana significativa, auditabilidad), diseñar Glossa con trazabilidad, compuertas humanas y auditoría de fuentes hace que el propio sistema practique esos principios. Es coherencia, no marketing.

## Principios de diseño

1. **Portabilidad (*surface-agnostic*).** Debe funcionar igual desde el chat (incluido el móvil), Cowork o Code. El cerebro va en un **skill** y el alcance en **conectores MCP** a nivel de cuenta, no en una app atada a una superficie.
2. **Conectores antes que scripts.** Siempre que se pueda, una capacidad se expone como conector (alcanzable desde cualquier superficie, incluso sin shell) en vez de como script local. Los scripts quedan para lo que un conector no pueda hacer.
3. **Compuertas.** Hay paradas humanas explícitas antes de escribir. No son fricción: son la evidencia de autoría y la supervisión humana del flujo.
4. **Procedencia por defecto.** Cada pieza deja un registro estructurado (semilla, fuentes, verificación, modelo). El transcript no se evapora: lo importante **se serializa como archivos en el repo**.
5. **KB propio.** Las lecturas se fundan primero en un corpus curado por mí; cada pieza publicada vuelve al corpus y lo engorda (el *volante*).
6. **El sitio es la vitrina; no se construye app de chat.** Reconstruir un cuadro de chat sería caro y poco diferenciado. Lo público y *ownable* es el sitio + la procedencia; la conversación ocurre en el Claude que ya uso.
