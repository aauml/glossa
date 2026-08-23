# Glossa — DECISIONS.md

Decisiones de arquitectura con su porqué. Una decisión sin el motivo escrito se
revierte por accidente seis meses después, cuando el motivo ya no está a la
vista y la decisión parece arbitraria.

| # | Fecha | Ámbito | Decisión | Estado |
|---|---|---|---|---|
| D-001 | 2026-08-21 | Publicación | La compuerta del token, desde el primer commit | vigente |
| D-002 | 2026-08-22 | Ingesta | Filtrar por duración, no por canal | vigente |
| D-003 | 2026-08-22 | Ingesta | Descubrir y digerir con relojes distintos | vigente |
| D-004 | 2026-08-22 | Revista | El número se escribe fuera de la edge function | vigente |
| D-005 | 2026-08-22 | Revista | Kimi K3, elegido midiendo seis | vigente |
| D-006 | 2026-08-22 | Revista | Secciones emergentes, nunca fijas | vigente |
| D-007 | 2026-08-22 | Revista | Un solo renderizador para borrador y publicado | vigente |
| D-008 | 2026-08-22 | Panel | Una caja, y la clasificación en el servidor | vigente |
| D-009 | 2026-08-22 | Credenciales | Cuenta propia por proyecto, no clave propia | vigente |
| D-010 | 2026-08-22 | Revista | Solo se cita en el idioma original | vigente |
| D-011 | 2026-08-22 | Revista | Publicar sin revisión, pero con fusible mecánico | pendiente (paso 6-7) |
| D-012 | 2026-08-23 | Revista | Un tema es un encargo, no una etiqueta | vigente |
| D-013 | 2026-08-23 | Revista | Lo de fuera puede ser pieza propia | vigente |
| D-014 | 2026-08-23 | Ingesta | El presupuesto de búsqueda se ajusta a la divergencia | vigente |
| D-015 | 2026-08-23 | Revista | Dos fondos separados en el punto de entrada | vigente |
| D-016 | 2026-08-23 | Revista | La semana se ancla al domingo; los cortes intermedios son parciales | vigente |
| D-017 | 2026-08-23 | Radar | Dos relojes y un botón para saltarse el ritmo | vigente |

---

## D-001 · La compuerta del token, desde el primer commit

La cola de publicación corría con la clave pública anónima y se presentaba como
una virtud: «sin secretos en el repo». Era un agujero. Cualquiera podía encolar
un artículo que un Action commiteaba a `main` y Vercel desplegaba.

Falló de las dos maneras posibles: dejó de funcionar sola cuando el rol perdió
permisos, y mientras funcionó estaba abierta.

Ahora: clave de servicio en los secretos del repo y cabecera `x-glossa-token`,
que **falla cerrado** — sin el secreto configurado, se rechaza todo. Si alguien
copia este patrón, que lo copie con la compuerta.

## D-002 · Filtrar por duración, no por canal

Ante 1.091 vídeos semanales de los que el 70% era ruido, la reacción fácil era
quitar los canales ruidosos. Se descartó: **el solapamiento entre fuentes no es
redundancia**. El mismo invitado en otro programa y otra semana responde a otras
preguntas.

El recorte va por *tipo de material* —Shorts, clips, retransmisiones crudas— y
nunca por voz. El solapamiento se gestiona al sintetizar, donde la regla
«coincidir no es corroborar» ya lo resuelve.

## D-003 · Descubrir y digerir con relojes distintos

Digerir tiene que ir cada 15 minutos y **no es una preferencia**: una edge
function muere a los 150 s y un episodio tarda entre 26 y 60, así que caben dos
por pasada. Con 42 episodios diarios hacen falta 21 pasadas solo para no
acumular cola.

Descubrir no gana nada yendo tan seguido, y cada pasada volvía a examinar y
rechazar los mismos 200 Shorts: 2.900 unidades diarias de la API para no
enterarse de nada nuevo. Separado — descubrir cada 6 h — baja a ~150.

## D-004 · El número se escribe fuera de la edge function

Ver D-005: el modelo elegido tarda 16 minutos. El techo de 150 s no estaba
limitando el tiempo, estaba **eligiendo el modelo**, y eligiendo el peor.

El reloj se muda a un GitHub Action (seis horas de margen). La edge function se
queda desplegada para el botón manual del panel.

## D-005 · Kimi K3, elegido midiendo seis

Se dio el mismo material y el mismo encargo a Gemini 3 Flash, GPT-5, Grok 4.6,
Claude Sonnet 5, Kimi K2.6 y Kimi K3. La prosa era aceptable en todos; la
diferencia estaba en qué consideraban noticia.

Los titulares lo resumen: Gemini tituló *«American Hegemony Fractures Amid Debt
Crisis»* —la tesis del material, contada—. K3 tituló *«The hegemon's worst week,
sung by a choir that rehearses together»*, que es la tesis **examinada**.

De sus tres afirmaciones verificables sobre procedencia, K3 acertó las tres.
Coste: 4 dólares al año. El más caro eran 76, así que el precio no decidía nada.

**Contrapartida asumida:** mete un sexto proveedor de LLM en la cartera para un
solo trabajo, y hay una lección de otro proyecto que dice que el razonamiento
extendido no mejora la salida estructurada. La medición sobre material propio
pesó más.

## D-006 · Secciones emergentes, nunca fijas

Se evaluaron tres modelos: secciones fijas como una revista impresa, emergentes,
o híbrido con hilos que persisten. Se eligió **emergente puro**.

Una sección fija tiene que decir algo cada semana, y esa presión es exactamente
la que produce relleno. Si una semana no llegó nada de un asunto, esa semana no
hay sección de ese asunto — y el índice, que cambia cada número, es lo único que
dice qué hubo esta vez.

Cada entrada lleva una etiqueta de asunto específica («Iran war», «US midterms»),
nunca un cajón genérico: una etiqueta que vale para cualquier pieza no informa.

## D-007 · Un solo renderizador para borrador y publicado

`src/lib/weekly.js` lo usan el panel y la página pública. Si el borrador se
pintara distinto de lo publicado, revisarlo no probaría nada.

Escapa todo lo que viene del modelo salvo tres etiquetas —`doc`, `attr`, `said`—
que son el aparato epistémico. Un `<script>` inyectado sale como texto.

## D-008 · Una caja, y la clasificación en el servidor

Alimentar el sistema pasaba por tres pestañas y dos formularios de cuatro y cinco
campos. Ahora una caja acepta un enlace, un texto pegado o un tema.

La clasificación va en el servidor porque resolver un `@handle`, olfatear si una
URL es un feed o leer el título de un sitio necesitan peticiones que CORS
prohíbe. En el navegador serían dos implementaciones de las mismas reglas, y la
del navegador siempre sería la equivocada.

**Adivinar está permitido; adivinar en silencio no.** Lo ambiguo vuelve con
alternativas de un clic.

## D-009 · Cuenta propia por proyecto, no clave propia

Se creó una clave separada para Glossa y el límite seguía compartido: la
concurrencia cuelga de la organización. Un trabajo de 16 minutos habría dejado al
otro proyecto sin poder llamar al proveedor durante 16 minutos.

La regla: cuando dos proyectos comparten un proveedor, separar **cuentas**, y
**comprobar el id de organización**. Que la clave responda no prueba nada.

## D-010 · Solo se cita en el idioma original

El fusible que permitirá publicar sin revisión comprueba que cada frase
entrecomillada exista literal en el material. Los resúmenes guardan las citas en
su idioma, así que una cita traducida nunca coincidirá.

Se eligió **no traducir citas**: al hablante en otro idioma se le parafrasea con
atribución y sin comillas. Cuesta silenciar como citables a algunas voces en una
publicación bilingüe, y es el precio de que unas comillas signifiquen siempre
palabras literales.

El origen no es teórico: un modelo tomó una cita guardada en español, la tradujo
al inglés y la presentó entrecomillada como palabras textuales del hablante.

## D-011 · Publicar sin revisión, pero con fusible mecánico

El destino es que el número salga solo. La compuerta manual se mantiene mientras
tanto, y lo que la sustituirá **no es una revisión humana más rápida** sino
comprobaciones que una máquina puede hacer: que cada cita exista literal, que
cada marca de «documentado» tenga un cotejo detrás, que el aparato esté bien
formado.

Asumido y escrito para no volver sobre ello: eso caza citas inventadas y marcas
no ganadas, pero **no** puede cazar un número bien formado y bien citado que se
equivoque sobre qué significó la semana. Se acepta a sabiendas.

## D-012 · Un tema es un encargo, no una etiqueta

Se midió el número del 2026-08-16: **190 de 195** elementos venían de los canales
de YouTube seguidos. El cotejo sí salía a Internet —19 documentos, 17 dominios,
Reuters, la BBC, congress.gov, el Tesoro— pero los pedía **sin texto**, emitía un
veredicto sobre una frase y los tiraba. Ninguno llegó al número. Una pieza sobre
las elecciones de medio mandato se escribió con cuatro programas de opinión.

Detrás había un fallo mayor: **al modelo nunca se le pasaron los temas.** El
prompt le decía «merge the raw topics into 4-5 pieces» mientras
`glossa_radar_topics` no se leía en ningún sitio. La función que dice en qué se
agrupó la semana existía desde la migración 0014 y su único lector era la vía de
las ocho casillas que el guion semanal había sustituido.

A partir de aquí un tema es un encargo: se sale a buscarlo en otros medios y
otros países, se trae el texto entero, y **entra como material**. Al pie del
número van todas las fuentes que se usaron de verdad, no solo las que ya estaban
en la lista.

## D-013 · Lo de fuera puede ser pieza propia

Se consideró la versión conservadora —el reportaje solo como contraste, y un
asunto que ningún canal tocó como una línea del cierre— y se descartó. Si la
prensa mexicana cubre algo toda la semana y ninguno de los canales lo menciona,
**eso es una sección**, y dice en su propio texto que nadie aquí lo mencionó.

Lo que cambia es qué es Glossa: deja de ser «lo que dijeron los canales» y pasa a
ser «lo que pasó», con las dos cosas dentro y distinguibles. La ausencia en el
coro es el hallazgo, no un hueco que tapar en silencio.

El camino ya existía sin saberlo: `asignarTemas` corre sobre cualquier elemento
digerido sin mirar su origen, así que un hallazgo de búsqueda ya recibía tema.
Lo único que hacía falta era **dejar de ordenar los temas por número de canales**,
que enterraba justo los que ningún canal había tocado.

## D-014 · El presupuesto de búsqueda se ajusta a la divergencia

No hay un número fijo de búsquedas por tema. Se busca por rondas de dos y después
de cada una se mide, gratis: cuántos relatos distintos quedan tras colapsar
casi-duplicados y despachos de agencia compartidos, y si dos medios publican
cifras distintas para lo mismo.

Se para cuando la ronda no aportó ningún relato nuevo, cuando ya hay cupo, o
cuando todos repiten un solo relato. Se sigue cuando hay choque de cifras —que
además de ser la señal, **es la pieza**— o cuando falta el país del que la
historia va y no volvió nada.

La forma resultante es la correcta y no era obvia: **se gasta más donde la
primera pasada volvió pobre y menos donde volvió rica.** Un tema del que ya
volvieron cuatro reportes distintos no necesita otra ronda; uno del que volvió
uno, sí.

## D-015 · Dos fondos separados en el punto de entrada

Un reportaje entra en `glossa_radar_items` como cualquier otra cosa, y ahí estaba
el peligro: la misma función que arma el material lo habría pintado idéntico a un
episodio, y la distinción se habría perdido donde ningún prompt posterior la
recupera.

Se separan al leer, por `origin`. El coro va con su forma de siempre; el
reportaje va con otra que **no tiene `thesis`, ni `framing`, ni `channel`**. La
forma del objeto es la distinción, y esa es la razón de que exista un segundo
prompt de análisis en vez de reutilizar el que ya había.

Corolario que hubo que arreglar en el mismo sitio: los tres recuentos de
procedencia —concentración de canales, invitados que se repiten, tandas del mismo
día— son hechos sobre EL CORO. Contando también los reportajes metían una fila
fantasma y diluían la única cifra que importa.

Y otro, en el fusible: un reportaje no tiene `claims` ni `thesis`, así que sus
cifras y sus atribuciones hay que registrarlas explícitamente como citables. Sin
eso, la primera vez que el número reprodujera una cifra literal el fusible la
habría llamado inventada — y aquí ya se pagó dos veces la lección de que
**acusar mal es peor que no acusar**.

## D-016 · La semana se ancla al domingo; los cortes intermedios son parciales

Cortar es sacar una foto de lo ya analizado dentro de un rango de fechas — no
cancela ni descarta nada de lo que sigue en la cola. Se puede repetir.

Con la ventana relativa a «hoy», cada repetición escribía una revista distinta:
el martes cubría 18→24 y guardaba una fila `2026-08-18`. Anclada al domingo, los
cortes de martes, jueves y sábado actualizan **la misma** fila y el del domingo
la cierra con la semana entera.

La columna `parcial` es lo que impide que la compuerta se vuelva en contra: esa
compuerta conserva el número con más piezas —se puso porque una pasada a medias
llegó a pisar un número completo— y sin distinguir el tipo de corte habría dejado
que un parcial de siete piezas bloqueara al oficial de cinco.

## D-017 · Dos relojes y un botón para saltarse el ritmo

Descubrir cuesta cuota de YouTube y lo nuevo no aparece cada cuarto de hora;
analizar es lo lento y conviene que vaya seguido. Un solo reloj obligaba a elegir
entre gastar cuota de más o leer de menos, así que descubrir corre cada 6 h y
analizar cada 15 min.

El ritmo de análisis —dos episodios por pasada, ~12 por hora— no sale de una
constante elegida: es lo que cabe en los 150 s de una edge function reservando
50 s por episodio para no dejar ninguno a medias.

Basta para el día a día y no basta para cortar el número con ochenta esperando.
`glossa-cola.yml` llama a la misma función seguida y sube a ~60 por hora. No es
un camino nuevo: es el mismo código a otra frecuencia, que es lo que lo hace
seguro. Va secuencial —dos llamadas a la vez cogerían los mismos episodios— y sin
horario, porque corriendo solo se saltaría el tope diario de Gemini cada día
antes de comer.
