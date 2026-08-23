# 13 · Radar

Lee muchos canales y podcasts para no tener que verlos. Escucha cada episodio,
saca un resumen estructurado y agrupa los resúmenes **por tema**. La unidad de
salida es el tema, no el canal: se pregunta "¿qué pasó con Irán?" y hay material
al día con lo que dijo cada fuente y dónde chocan.

**No publica nada.** Es material de lectura privado. Una pieza de Glossa nace
cuando Arturo le pone su tesis; entonces sigue el camino normal de publicación.

## Dónde vive cada cosa

| Pieza | Dónde | Cuándo |
|---|---|---|
| Descubrir qué hay nuevo | edge function `glossa-radar-run` | cada 6 h |
| Escuchar y analizar | la misma, dos episodios por pasada | cada 15 min |
| Censar quién cubrió cada tema | `src/lib/gdelt.mjs` + `gnews.mjs`, gratis | dentro del reportaje |
| Salir a buscar fuera | Action `glossa-reportaje.yml` | sábado 15:00 UTC |
| Cotejar afirmaciones | Action `glossa-cotejo.yml` | sábado 09:00 UTC |
| Corregir la calibración | Action `glossa-consejo.yml` | domingo 08:00 UTC |
| Escribir el número | Action `glossa-weekly.yml` | domingo 10:00 UTC |
| Vigilar todo lo anterior | Action `glossa-vigilante.yml` | cada 4 h |
| Leer la cola de golpe | Action `glossa-cola.yml` | a mano, desde el panel |
| Los datos | tablas `glossa_radar_*` | — |
| Alimentarlo y mirarlo | `/admin`, tras contraseña | — |

Lo que cabe en 150 s vive en una edge function; lo que no, en un Action. Esa
línea no es de estilo: el número tarda ~16 minutos y se midió que solo el peor
de seis modelos terminaba dentro del techo de una edge function.

**El reloj está partido en dos a propósito.** Descubrir cuesta cuota de YouTube y
lo nuevo no aparece cada cuarto de hora; analizar es lo lento y conviene que vaya
seguido. Un solo reloj obligaba a elegir entre gastar cuota de más o leer de
menos.

## El ritmo, y por qué existe un botón para saltárselo

Una pasada del radar tiene 120 s de los 150 que le da la edge function, y reserva
50 s por episodio para no dejar ninguno a medias. Salen **dos episodios por
pasada, ~12 por hora**. Suficiente para el día a día: entran unos 40 diarios.

No es suficiente cuando quieres cortar el número ahora y hay ochenta esperando —
a ese ritmo son siete horas y el número corre a las 10:00 UTC. `glossa-cola.yml`
llama a la misma función una detrás de otra, sin la espera de quince minutos, y
sube a ~60 por hora. Mismo código, mismos topes; lo único que cambia es la
frecuencia.

Va **secuencial** y no en paralelo: el radar selecciona ocho pendientes y los
marca `running` uno a uno según los procesa, así que dos llamadas a la vez
pagarían dos veces los mismos episodios. Y no tiene horario: si corriera solo se
saltaría el tope diario de Gemini todos los días antes de comer.

## La semana, y qué es «cortar»

Cortar no corta nada. Es **sacar una foto**: con lo que ya está analizado dentro
de un rango de fechas, escribir la revista. Lo que sigue en la cola no se cancela
ni se pierde — no sale en esa foto, y sale en la siguiente. Nada se lee dos veces
y nada se borra.

La ventana se ancla al **domingo**, y la calcula `glossa_semana_actual()` para
que el panel y el guion no puedan discrepar:

| Cuándo se corta | Qué cubre | Qué escribe |
|---|---|---|
| domingo (automático) | la semana que acaba de cerrarse, domingo→sábado | el número oficial |
| cualquier otro día | de este domingo hasta hoy | un corte **parcial**, que pisa la misma fila |

Así, cortar el martes y el jueves actualiza siempre la misma revista, y el
domingo la cierra con la semana entera. Antes la ventana era «los últimos siete
días desde hoy» y cada corte intermedio creaba una fila con fechas que no eran
las de ninguna semana.

Un corte parcial nunca le gana al oficial. La compuerta que conserva el número
con más piezas —puesta porque una pasada a medias llegó a pisar un número
completo— solo compara cortes del mismo tipo.

## Salir a buscar: el tema como encargo

Se midió el número del 2026-08-16: **190 de 195** elementos venían de los canales
seguidos. El cotejo sí consultaba documentos externos, pero los pedía sin texto,
emitía un veredicto sobre una frase y los tiraba.

Cada sábado, `glossa-reportaje.yml` coge los asuntos en que se agrupó la semana
y sale a buscarlos fuera: otros medios, otros países, el texto entero. Lo que
encuentra **entra como material**, no como sello.

> **Desde el 2026-08-23 salen TODOS los asuntos, no los seis mayores.** Se puede
> porque la primera pasada —el censo de quién cubrió qué y desde dónde— es
> gratis, y lo de pago se reparte según lo que ese censo diga que falta
> comprobar. El detalle completo, con lo que se descartó y por qué, está en
> **[docs/14 · El censo y el cupo](14-Censo-y-Cupo.md)**. Lo que sigue en esta
> sección describe qué pasa DENTRO de un tema una vez que tiene cuota.

- **Las consultas las propone un modelo y las constriñe el código.** La etiqueta
  de un tema —«Security dynamics in the Middle East»— es una abstracción del
  clasificador e inservible para buscar; el ángulo sale de las cifras y los
  nombres concretos que dijeron los canales. El código excluye los dominios de
  las fuentes seguidas, las plataformas y los sitios de transcripción, y si el
  tema toca un país no anglófono y todas las consultas volvieron en inglés,
  sintetiza una.
- **El presupuesto se ajusta solo.** Se busca por rondas de dos y después de cada
  una se mide, gratis: cuántos relatos distintos quedan tras colapsar
  casi-duplicados y despachos de agencia compartidos, y si dos medios publican
  cifras distintas para lo mismo. Se gasta **más donde la primera pasada volvió
  pobre** y menos donde volvió rica.
- **Un reportaje se digiere con otro prompt.** El del análisis pide tesis,
  encuadre y hablantes porque está hecho para analistas con posición; aplicado a
  un despacho produce «Reuters argues that…» e inventa la posición. El de
  reportaje no puede producir una voz: qué ocurrió, quién habló para el acta, qué
  cifras y quién las publicó, y qué sigue sin saberse.
- **En el número son dos fondos separados**, y la separación se hace al leer, por
  `origin`. Un reportaje no lleva tesis ni encuadre ni canal: la forma del objeto
  es la distinción, antes de que ninguna regla tenga que defenderla.

## Qué se guarda de cada episodio

| | qué queda en la base |
|---|---|
| Vídeo de YouTube | **el vídeo no se baja nunca.** Gemini escucha desde la URL y solo vuelve el análisis |
| Artículo o reportaje | el texto completo, porque hubo que bajarlo para leerlo |

Una semana entera ocupa menos de 1 MB. Lo pesado nunca se toca.

Los subtítulos de YouTube serían más ligeros que el vídeo y **no se pueden bajar
desde un servidor**: YouTube contesta «Sign in to confirm you're not a bot» a las
direcciones de centro de datos. La salida es guardar las cookies de una sesión, y
esa línea no se cruza — es la misma que con los periódicos de pago. El camino
queda montado y sin horario por si algún día corre desde otro sitio.

## El filtro de duración, y cómo se perdió una vez

Al descubrir, se piden las duraciones de los vídeos nuevos (una unidad por lote)
y se filtra: **menos de 10 minutos** es un Short o un clip, **más de 3 horas** es
una retransmisión cruda, y un **directo en emisión** no tiene archivo que
analizar. Lo filtrado se escribe como `skipped` con su nota — un filtro que
trabaja callado es indistinguible de un descubrimiento roto. Y si la llamada de
duraciones falla, se deja pasar todo: descartar sin datos es el fallo que una vez
tiró 47 episodios buenos de 48.

Este filtro **se perdió una vez** y vale contar cómo: vivía solo en una versión
de la edge function desplegada a mano, nunca commiteada, y el despliegue del
2026-08-22 desde el repo lo pisó sin que nada lo dijera. Se notó por un directo
en `error` y una tanda de Shorts pagados. De ahí la regla, ahora en LESSONS.md:
nada se despliega que no esté commiteado.

El reloj está en la base a propósito. `pg_cron` y `pg_net` ya estaban instalados
y ya son el par que dispara los workers de publicación; meter Apps Script, un
cron de Vercel o un Worker habría añadido un cuarto runtime con sus propios
secretos y sus propios límites. **Hubo una versión en Apps Script** (retirada el
2026-08-21, recuperable del historial): funcionaba, pero dejó de tener sentido en
cuanto el panel existió.

## El RSS de YouTube murió; se usa la API oficial

El 2026-08-21, el endpoint `/feeds/videos.xml` empezó a devolver **404 para todos
los canales** —el de Google y el de TED incluidos— mientras el resto de
youtube.com seguía respondiendo. Había funcionado esa misma tarde. Nunca estuvo
documentado: era una conveniencia que YouTube podía retirar sin aviso, y la retiró.

El descubrimiento de canales pasa a la **YouTube Data API v3**, que sí está
soportada. Cuesta **1 unidad por canal comprobado** de las 10.000 diarias
gratuitas — unas 5.000 comprobaciones al día, muy por encima de lo que esto va a
necesitar. Los podcasts y la prensa siguen por RSS, que en su caso funciona.

Detalle que ahorra una llamada: la lista de "subidas" de un canal es su propio id
con `UU` en vez de `UC`, así que no hace falta preguntarla.

## Los números, medidos

Un episodio de una hora de YouTube:

| Muestreo | Tokens |
|---|---|
| Por defecto (1 fps) | 332.772 — **no cabe** en los 250.000/min del tramo gratuito |
| 0,1 fps (el que se usa) | 126.375 — cabe con margen |
| 0,05 fps | 114.873 — ya no baja: lo que queda es el audio |

Una pasada real: 10 episodios descubiertos, 2 digeridos con sus temas en 115 s,
~105.000 tokens cada uno. El resto queda en cola para la siguiente.

**Presupuesto de tiempo.** Una edge function tiene 150 s de reloj; la pasada para
a los 120 s y deja lo que no cabe en cola. Un episodio a medias sería peor que un
episodio sin empezar.

**Cuota.** El tramo gratuito da 500 llamadas/día en Flash Lite y cada episodio
gasta 2 (resumen + temas). Un canal a 11/semana usa ~3 al día. Con muchas fuentes
habría que espaciar el cron — es el único número que hay que vigilar al crecer.

## Tres criterios, dentro de los prompts

No son notas al pie: están escritos en `supabase/functions/_shared/prompts.ts`.

1. **El contenido manda sobre los metadatos.** Al probarlo con un título
   equivocado, el modelo identificó bien por el audio quién hablaba pero atribuyó
   la tesis al nombre del título. En un sistema cuyo valor es la procedencia eso
   es el peor fallo posible. Ahora hay un campo `title_mismatch` que obliga a
   declarar la discrepancia en vez de resolverla en silencio — y en la primera
   pasada real detectó que dos títulos prometían más de lo que el episodio daba.
2. **Separar lo afirmado de lo documentado.** Cada claim lleva `status`:
   *afirmado* sin respaldo, *atribuido* si cita a un tercero, *documentado* solo
   si remite a algo verificable.
3. **No se guardan transcripciones.** Solo análisis y citas cortas con su minuto,
   que es lo que hace falta para escribir y para volver a la fuente.

## Qué genera y quién lo lee

Exigido por `STANDARD-PUBLISHED-OUTPUT`: los resúmenes y los temas los lee Arturo
en el panel. Antes de que el panel existiera **no los leía nadie**, que es
justo el fallo que el estándar describe. Si el panel desaparece, esto también.
