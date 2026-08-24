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
| D-018 | 2026-08-23 | Revista | La paráfrasis se reconoce pero no se cita | vigente |
| D-019 | 2026-08-23 | Revista | Un parcial nunca pisa a un oficial, y nunca se publica solo | vigente |
| D-020 | 2026-08-23 | Revista | Las ediciones tienen país: México y Estados Unidos | vigente |
| D-021 | 2026-08-23 | Revista | Se cuenta la noticia, no quién la dijo | vigente |
| D-022 | 2026-08-23 | Revista | Traducir con cascada verificada, no con el mejor modelo | vigente |
| D-023 | 2026-08-23 | Radar | El censo es gratis; lo de pago es la excepción | vigente |

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

## D-018 · La paráfrasis se reconoce pero no se cita

La resolución fina de D-010 para el camino del reportaje. Un reportaje trae
`what_happened` y `attributed[].what` en inglés SIEMPRE — son paráfrasis, y
traducida cuando el artículo no es inglés. La primera versión las registró como
citables para no acusar de «inventada» a una cita que procede del material; eso
desarmaba D-010 por la puerta de atrás: ocho palabras del resumen,
entrecomilladas, pasaban por literales.

La resolución: dos conjuntos. Lo citable (citas del artículo en su idioma,
cifras) y lo RECONOCIDO PERO NO CITABLE (la paráfrasis). Una cita que solo
encaja en el segundo produce su propio fallo grave — «cita de paráfrasis» — que
ni la acusa de inventada ni la deja pasar por literal.

## D-019 · Un parcial nunca pisa a un oficial, y nunca se publica solo

Un corte parcial existe para mirar cómo va la semana, no para salir. De ahí dos
reglas que el código impone y no negocia:

- **No pisa.** La compuerta que conserva «el número con más piezas» compara solo
  cortes del mismo tipo, y la celda parcial→oficial rechaza siempre. Sin eso, un
  `WEEK_END` de sábado —el valor que la propia ayuda del workflow sugería—
  machacaba el número oficial con un parcial.
- **No se publica solo.** Aunque el fusible pase. La cola del fallo era peor que
  el fallo: un parcial publicado deja `state='publicado'`, el domingo siguiente
  el guion ve eso y NO escribe el número real de la semana, y nada lo nota — el
  vigilante solo comprueba que la fila exista.

## D-020 · Las ediciones tienen país: México y Estados Unidos

Las dos ediciones se localizan, y es una decisión editorial, no una preferencia
de estilo: **español de México** e **inglés de Estados Unidos**. Las fuentes en
español de esta publicación son mexicanas y quien la lee está en California; el
peninsular y el británico sonarían prestados.

Con eso, **las citas se traducen** y van entre comillas latinas «así», como en
cualquier periódico. No son traducciones literales palabra por palabra y no
tienen por qué serlo.

*Se llegó aquí por descarte, y las dos paradas previas valen como advertencia.*
Primero se dejaron las citas en inglés dentro de la prosa española, para que unas
comillas siguieran significando «palabras exactas». Luego se tradujeron en
cursiva y sin comillas, por el mismo motivo. Las dos eran soluciones rigurosas a
un problema que no existe: **nadie lee «dijo que el estrecho está abierto» en un
diario en español y entiende que ésas fueron las sílabas exactas.** La convención
ya significa «esto dijo», no «esto sonó así», y forzarla producía un texto fiel e
ilegible.

Lo que el fusible comprueba se traslada con la regla. En inglés compara cada
frase entrecomillada contra el material, letra por letra. En español eso no diría
nada, así que comprueba lo único comprobable en otro idioma: que no haya más
voces citadas que en el original — es decir, que no se invente a nadie.

## D-021 · Se cuenta la noticia, no quién la dijo

Los canales y los podcasts son **de dónde salen los asuntos**, no la historia.
El número se escribe como se escribe una noticia: se dice qué pasó, en prosa
limpia, sin el nombre de nadie colgando de cada frase. Se nombra una fuente solo
cuando nombrarla informa — porque el asunto está en disputa, porque nadie de
fuera lo confirmó, o porque quién lo dijo ES la noticia.

Antes el número contaba quién había hablado: «Escobar sostiene que…», «un
invitado de Napolitano afirmó…». Eso convertía la revista en un informe sobre su
propia lista de lectura.

**La inversión que lo hace posible sin perder nada:** el aparato de marcas pasa a
señalar lo que NO está asentado, y la prosa sin marcar significa establecido.

| | |
|---|---|
| sin marca | corroborado fuera, o documentado |
| dorado | rastreable hasta un documento (sigue exigiendo cotejo `documenta`) |
| punteado | lo dice una sola fuente — y se la nombra |
| liso | se afirma y nada lo sostiene — y se nombra a quién |

Así «coincidir no es corroborar» deja de ser una advertencia editorial y pasa a
gobernar **cuándo se puede quitar la marca**: cinco canales de la misma órbita
repitiendo una cosa no la asientan —es un relato con cinco bocas— y solo la
asienta el reporteo de fuera o un documento.

Y es comprobable, que es lo que impide que se relaje: **una pieza que no cita ni
un reportaje ni un cotejo y no marca nada levanta un fallo grave**. Si no hubo
con qué comprobarlo, se escribe igual — pero marcado. El silencio hay que
ganárselo.

## D-022 · Traducir con cascada verificada, no con el mejor modelo

Se midieron seis modelos sobre el mismo número, tres vueltas cada uno, con el
fusible de juez —o las comillas siguen literales o no, y eso no es opinable—.
**Ninguno acertó las tres veces**: Grok sin razonamiento 2/3, Haiku 2/3, Gemini
1/3, y Kimi K3 —el que se venía usando, a $0,094 la vuelta— tampoco tenía por
qué ser distinto.

Así que no se elige un modelo: se comprueba el resultado. La cascada va **por
orden de coste** —Gemini gratis, luego Grok sin razonamiento, luego Haiku— y el
fusible decide después de cada intento. Si tocó una cita, se pasa al siguiente;
si ninguno la conserva, no se guarda nada y el número en inglés queda intacto.

Dos cosas que esto ordena de paso:

- **El orden lo decide el desperdicio, no la tarifa.** Para el mismo trabajo,
  Grok sin razonamiento gastó 5.004 tokens de salida, Kimi 41.387 y DeepSeek
  32.000 sin llegar a emitir una letra. Un modelo de razonamiento traduciendo
  paga por pensar lo que no hay que pensar.
- **Escribir sí justifica el modelo caro; traducir no.** En el número el juicio
  es el producto. En la traducción, el criterio propio del modelo es justo lo
  que no se quiere.

Primera corrida real: Gemini, gratis, diecisiete segundos, citas intactas. De
$0,094 a $0,00.

## D-023 · El censo es gratis; lo de pago es la excepción

Las fuentes seguidas dan **los temas**, no el material. Sobre cada tema hay que
salir a la calle, en cualquier idioma y país, y solo escribir después. Como la
lista de fuentes va a seguir creciendo, el coste por asunto tenía que bajar solo:
un tope escrito a mano —«24 búsquedas por semana»— envejece en cuanto se añade la
fuente número treinta y cuatro.

**La salida es que la anchura no cueste.** Se hace en dos capas:

**1 · El censo, gratis, sobre TODOS los temas.** Dos índices abiertos, y el
orden entre ellos lo decidió la práctica y no el papel.

*Google News RSS es el que trabaja.* Sin clave, sin cuenta y sin cupo. En las dos
corridas reales censó los diez temas y devolvió entre 40 y 240 medios por asunto,
de cuatro a seis países. Da titular, medio y fecha — el enlace va cifrado— y con
eso basta para lo único que se le pide aquí.

*GDELT es mejor y no ha entregado nunca.* Una consulta suya devolvió 250
artículos de 213 medios, ~30 países y 10 idiomas, **con la URL real**, así que el
texto se leería gratis. Pero en producción ha fallado el 100 % de las veces:
estrangula por IP con una dureza que no perdona ni al portátil ni al runner de
GitHub. Se deja declarado como capa preferente porque cuando responde no hay
color, con reintento, freno progresivo y un cortacircuitos que lo apaga a los
tres fallos para que un GDELT caído no cueste veinticinco segundos por tema. **Y
se dice en el parte cuál de los dos sirvió**: un censo más pobre que nadie
anuncia es indistinguible de una semana sin noticias.

**2 · La profundidad, de pago, racionada por lo que dijo el censo.** Se le
pregunta a Tavily cuánto cupo queda de verdad, se divide entre las semanas que
faltan, se descuenta lo que cotejo y monitores consumen, y lo que sale se reparte
entre los temas **en proporción a lo que el censo dijo que falta comprobar**. Un
tema que cuarenta medios de cinco países cuentan igual se lleva **cero**: ya está
corroborado y pagar por confirmarlo otra vez no compra nada. Ese cero es lo que
financia los temas de los que nadie más ha escrito.

*El reparto es una pendiente, no un escalón, y eso se aprendió cayéndose.* El
umbral se puso primero en 0,22 de parecido entre titulares, y dos corridas del
mismo día sobre la MISMA semana dieron veredictos opuestos: «U.S.-Iran friction»
midió 0,30 y se llevó cero, y una hora más tarde midió 0,207 y se llevó la cuota
entera. La medida fluctúa lo bastante como para que un acantilado puesto en mitad
del ruido decida al azar. En pendiente, esa misma fluctuación mueve una búsqueda
arriba o abajo. El **cero** sobrevive, pero solo para el caso extremo —acuerdo
alto **y** cinco países **y** cuarenta medios a la vez—, porque es el único
veredicto que deja un asunto sin comprobar y equivocarse ahí es lo caro.

*Y ningún asunto se lleva más de un cuarto de la semana.* «Nadie fuera escribió
de esto» es la puntuación máxima y significa dos cosas muy distintas: una
exclusiva, o que un canal se inventó un asunto que no existe. Sin freno, la
segunda se comía la mitad del presupuesto.

*Lo que se descartó, y por qué.* Gemini con búsqueda de Google incorporada: 429,
no entra en el tramo gratuito. DuckDuckGo: contesta 200 y devuelve cero enlaces a
un robot. SerpAPI: demanda DMCA de Google de diciembre de 2025 — no se construye
sobre eso. Brave (índice propio, independiente de Google) y Exa (semántico) se
dejan para más adelante, y por un motivo concreto: lo que aportarían no es más
volumen sino **un índice que no comparte origen**, y eso solo hace falta el día
que se demuestre que un censo único se está dejando cosas.

*Lo que esto NO autoriza.* Ni GDELT ni Google News son fuentes citables. Dan
dónde mirar. Lo que se cite sale del texto del medio, leído y digerido como
cualquier otro, con las mismas reglas de [[D-010]] y D-018.

*El comité lo revisó* y puso una objeción que se acepta: comparar titulares por
palabras compartidas es señal débil —el parafraseo y el reescrito por SEO la
rompen— y lo suyo sería extraer afirmaciones y alinearlas con embeddings
multilingües. Es correcto y queda como etapa siguiente; que GDELT traiga el texto
es justo lo que la hace posible. Mientras tanto la señal se usa solo para decidir
**dónde gastar**, nunca para afirmar que algo está corroborado — un umbral que se
equivoca cuesta unos créditos, no una frase falsa en el número.

## D-024 · El directorio de fuentes crece solo; decide el consejo, Arturo veta

Las cuarenta fuentes eran una lista escrita a mano, y una lista a mano es una
foto que envejece. La pregunta era cómo hacerla crecer sin que crezca torcida:
sin que un racimo de canales que se citan entre sí eleve a los suyos, y sin que
un periodista con fuentes propias e incontrastables entre como verdad o quede
fuera como ruido.

**La decisión tiene tres partes:**

*1 · Los candidatos nacen del material, no de un directorio.* Dos viveros: las
**menciones** que el análisis ya detectaba y tiraba (a quién cita cada voz como
SU fuente de información — el grafo de citas, `glossa_radar_menciones`) y los
medios que el **reportaje** del viernes encuentra y que entregan texto útil. Se
descartó indexar listas externas de medios: cuota y suscripciones que no hay, y
un directorio ajeno hereda el sesgo de quien lo compiló.

*2 · Decide el comité del consejo, no el radar y no Arturo.* La regla es la de
D-038 de thesis, extendida: quien analiza (Gemini) no vota sobre qué fuentes
analizará. Arturo pidió explícitamente quedar fuera del bucle de aprobación; su
única palabra es el **veto** desde el panel, que es la asimetría correcta — el
sistema no puede meterle una fuente por encima de un no humano, pero tampoco
depende de que un humano apruebe cada alta.

*3 · La cámara de eco se mide por estructura, no por etiqueta ideológica.*
Clasificar ideologías es frágil justo donde importa. Lo que se exige es
independencia contada (citas de fuentes DISTINTAS), la lista de quiénes citan
delante del comité, y una prueba que se gana aportando: hechos que sobreviven al
cotejo y relatos distintos de los que ya había. La redundancia degrada — repetir
lo que los padrinos ya decían no renueva la audición, la termina. El material a
prueba entra al número etiquetado (`probation`) y tiene prohibido corroborar.

Los frenos son estructurales, no de gusto: `fuentes_altas_por_semana` (cada
fuente cuesta cuota de Gemini a diario) y `fuentes_tope_por_tema` (promover con
el cupo lleno exige que algo salga). Ver docs/15-Fuentes-Organicas.md y la
migración 0044.
