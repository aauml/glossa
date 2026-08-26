# Glossa — LESSONS.md

Lo que costó aprender aquí, escrito para que no se pague dos veces. El formato
es el `LESSONS-SPEC` de Umbrella: un `###` con lo que ahora se sabe, y debajo una
línea `_Applies to:_` con los proveedores o capacidades exactos del bloque de
recursos. **Esa línea es todo el mecanismo**: sin ella la lección se lee aquí y
no llega a nadie más.

Casi todas salieron de comprobar el estado real después de un cambio, no de leer
código. El patrón que se repite hasta ser aburrido: **algo dejó de funcionar y
nada lo dijo**.

---

## Lo que enseñó la auditoría del 2026-08-23

Tres auditorías en paralelo sobre el proyecto entero, con cada hallazgo
verificado contra el código y la base en vivo. Treinta y nueve fallos reales.
Los patrones, que valen más que la lista:

### Traducir el cuerpo y no la cabecera es no haber traducido
_Applies to: general_

**Síntoma** — La página `/es/` del número llevaba el `<h1>` en español y el
`<title>`, la `description` y el `og:title` en **inglés**. O sea: la pestaña del
navegador, el resultado de búsqueda y la tarjeta al compartir iban en inglés
sobre una página traducida con esmero.
**Causa** — El cuerpo español se leía en una variable (`bEs`) y los metadatos
seguían saliendo de la inglesa (`b`), que estaba tres líneas más arriba y se
llamaba parecido.
**Y algo peor al lado**: la página española declaraba `rel="canonical"` apuntando
a la inglesa. Eso le dice al buscador «esto es un duplicado, indexa la otra» — la
edición en español, que se traduce a propósito y se localiza a México (D-020),
quedaba **invisible en las búsquedas**. Son dos ediciones, no una copia:
`canonical` a sí misma y `hreflang` cruzados.

Lo general: **una traducción no acaba en el cuerpo del texto.** Lo que el lector
ve primero —la pestaña, el buscador, la vista previa al compartir— vive en el
`<head>`, no se ve al leer la página, y por eso sobrevive a cualquier revisión
que consista en mirarla.

### Una fecha sin hora es medianoche UTC, que en Los Ángeles es el día anterior
_Applies to: general_

**Síntoma** — Rehacer una semana no rehacía nada. `WEEK_END=2026-08-23` es un
domingo y el guion lo tomaba por corte PARCIAL, así que la compuerta —bien
puesta— se negaba a que pisara el número oficial y salía sin escribir.
**Causa** — `new Date('2026-08-23')` son las 00:00 UTC, o sea las 17:00 del
**sábado** en Los Ángeles, que es la zona a la que se ancló la semana. El formato
que documentaba el propio workflow hacía lo contrario de lo que prometía.
**Arreglo** — Un `YYYY-MM-DD` pelado se interpreta como mediodía allí (20:00 UTC
cae en el mismo día natural en verano y en invierno), y la ayuda del workflow
dice qué poner.

Lo general: **una fecha sin hora ya trae una zona horaria escondida, y es UTC.**
En cuanto el sistema razona en otra, cada fecha pelada se corre un día para
alguien. Y aquí hay un aviso extra: la auditoría ya cerró esta misma trampa una
vez —entonces la ayuda sugería un sábado— y **se reabrió sola al cambiar la
zona**. Arreglar el caso no arregla la clase: lo que hay que arreglar es que una
fecha entre sin zona.

### El navegador reescribe el HTML inválido, y tu CSS apunta al que escribiste
_Applies to: general_

**Síntoma** — Las fuentes al pie de cada pieza eran lo más llamativo de la
página: 17 px en negro y con el triángulo por defecto, debajo de una prosa de
12,6 px atenuada. Y el CSS decía exactamente lo contrario — `.82em`, `--muted`,
sin marcador— con un comentario que presumía de discreción.
**Causa** — El bloque se emitía como `<p class="src">… <details class="fuentes">`.
**Un `<details>` no puede vivir dentro de un `<p>`**: el analizador cierra el
párrafo al encontrarlo y lo escupe como hermano. Así que en el DOM real el
`<details>` colgaba de `.piece`, y **ninguna** regla `.src details.fuentes`
llegaba a aplicarse.
**Arreglo** — Emitirlo fuera del párrafo y colgar los selectores de `.piece`.

Lo general: **el CSS se escribe contra el DOM que construye el navegador, no
contra la cadena que generó el servidor.** Cuando un estilo «no se aplica» y la
regla parece correcta, mira el padre real antes de tocar la especificidad —
`<p>`, `<a>` y `<button>` no admiten anidado y el analizador reordena en
silencio. Y el corolario: **una regla que no casa con nada no avisa**; sin abrir
la página, esto se lee como un CSS impecable, y por eso llevaba semanas así.

### Lo irreversible se gasta después de la compuerta, nunca antes
_Applies to: general_

**Síntoma** — Una corrida del reportaje compró **veintiocho búsquedas de pago**
—cincuenta y seis créditos— y produjo **cero reportes**. Cada tema buscaba, le
volvían tres o cinco resultados buenos, y ahí se paraba. El parte de todos decía
`sin_hallazgos`, que es exactamente lo contrario de lo que pasó: hallazgos hubo,
lo que no hubo fue con qué leerlos.
**Causa** — La cuota diaria de Gemini estaba agotada (411 de 400) y
`quedaGemini()` solo se consultaba **dentro** del bucle de digestión. El dinero se
gastaba primero y la compuerta se miraba después.
**Arreglo** — Comprobar la cuota de digestión **antes de la primera búsqueda** del
tema, y archivar el parte como `sin_cuota_gemini`, que dice la verdad.

Lo general: la auditoría ya había movido las guardas delante de la llamada a Kimi
en el número semanal, y la lección no se llevó a este guion. **Cuando un paso caro
e irreversible depende de un recurso limitado que viene después, el orden correcto
es siempre comprobar primero y gastar después** — y cuando se arregla en un sitio,
hay que buscar la clase entera, como con [[«No pregunté» y «pregunté y no hay» piden cosas opuestas]].

Corolario del mismo día: **un tope que me inventé, además, miente sobre lo que
pasó.** `cap_tavily_mes` seguía en 600 cuando el plan da 1.000, y `cap_gemini_dia`
en 400 cuando el censo nuevo añade una llamada por tema. Un tope viejo no frena:
desvía la culpa hacia el mundo.

Y el arreglo de fondo, que llegó al cerrar la sesión: **lo que corre siempre y lo
que corre una vez no pueden compartir cuenta.** El radar lee cada quince minutos;
el reportaje y el número corren una vez por semana. Con un solo tope diario, el
primero se lo queda siempre — no por un fallo, sino por aritmética. El radar
tiene ahora su propio techo (`cap_gemini_dia_radar`, 600) por debajo del del día
(800), y la diferencia es la reserva de las tareas semanales.

### Un promedio se divide entre el tiempo, no entre los días que hubo trabajo
_Applies to: general_

**Síntoma** — El reparto apartaba **203 búsquedas semanales** para cotejo y
monitores cuando el gasto de Tavily del mes entero eran 117 créditos. La cifra
era imposible y aun así se leía como un dato.
**Causa** — Se dividía el gasto entre los días **con fila apuntada**, no entre
los transcurridos: con tres días de registro, 74 entre 3 por 7 da 172.
**Arreglo** — Dividir entre los días de calendario del periodo.

Lo general: es la misma piedra del `ritmo` del panel, que promediaba solo las
horas con actividad y anunciaba 55 elementos por hora justo después de vaciar la
cola. **Un promedio sobre «los momentos en que pasó algo» no mide un ritmo, mide
la intensidad de las rachas** — y cuando alimenta un reparto, lo que infla se lo
quita a otro: aquí se apartaba casi la mitad del cupo para un gasto que no
existe.

### Un error mío en la petición no es una caída del servicio
_Applies to: general_

**Síntoma** — El censo de GDELT no sirvió **ni un solo tema** en la primera
corrida de verdad, y el cortacircuitos lo dio por caído. Todo salió de la
reserva, más pobre, sin que el resultado pareciera roto: 237 medios es una cifra
que se lee como un éxito.
**Causa** — Dos cosas encadenadas. La fecha se enviaba como
`20260816T00000000` cuando GDELT pide catorce dígitos sin la «T», y el servicio
contestaba **200 con un texto plano** explicándolo. Mi código contó ese rechazo
como caída, sumó al contador y **se apagó solo**. El servicio estaba perfecto; la
culpa era de quien preguntaba.
**Arreglo** — Separar las dos familias. Timeout, 429 y error de red son caídas y
cuentan para el cortacircuitos. Una respuesta que dice «tu consulta está mal» no:
se registra con el texto que devolvió el servidor y no toca el contador —
reintentarla no arregla nada, pero apagar el servicio tampoco.

Lo general: **un disyuntor que no distingue «el otro se cayó» de «yo pregunté
mal» se dispara a sí mismo, y encima al bajar a la reserva tapa la prueba.**
Cuando un proveedor conteste 200 con texto en vez de JSON, léelo: casi siempre te
está diciendo exactamente qué hiciste mal.

### Un tope que me inventé yo no es el tope del proveedor
_Applies to: general_

**Síntoma** — Se estaba racionando Tavily contra un límite de 600 al mes y
midiendo el consumo con un contador propio. Al preguntarle a Tavily: el plan son
**1.000**, y lo gastado eran **117**, no los 74 que decía mi cuaderno.
**Causa** — Las dos cifras eran mías. El tope me lo inventé por prudencia y el
contador solo veía las llamadas que pasaban por mi función de apunte; las de las
pruebas no.
**Arreglo** — Preguntar al proveedor por su propio consumo (`/usage`) y repartir
sobre eso.

Lo general: **un presupuesto que se mide contra su propio apunte se pasa sin
enterarse, y se queda corto sin motivo.** Si el proveedor publica lo que llevas
gastado, esa es la cifra; la tuya es una estimación que se llama igual.

### Un índice de noticias hace Y lógico con todas las palabras
_Applies to: general_

**Síntoma** — El censo devolvía cero notas en tema tras tema. La consulta era
«Hormuz Strait traffic volume cargo».
**Causa** — Se le estaba dando a un índice de titulares la consulta escrita para
un buscador semántico. Cinco palabras exigen las cinco en el mismo titular, y
ningún titular las tiene. Con tres —«sanciones Irán Trump»— salieron 100 notas de
55 medios.
**Arreglo** — Dos consultas distintas para dos herramientas distintas: la larga
para el buscador de pago, tres palabras para el censo. Y si tres no encuentran
nada, se prueba con dos, que no cuesta.

Lo general: **una consulta no es portátil entre buscadores.** Reutilizar la del
otro es la forma barata de concluir que no hay nada.

### «No pregunté» y «pregunté y no hay» piden cosas opuestas
_Applies to: general_

**Síntoma** — Los temas cuyo censo devolvía cero salían marcados «nadie más lo
contó», que es la urgencia máxima: se les habría ido el presupuesto entero
justamente a los temas cuya comprobación había fallado.
**Causa** — La función solo recibía los resultados, no si se había llegado a
preguntar. Cero resultados y cero preguntas eran el mismo valor.
**Arreglo** — Devolver también qué se consultó, y separar los dos casos: sin
consultas es «no medido», con consultas y sin notas es «nadie fuera».

**Y hubo segunda parte, que es la que importa.** Arreglado GDELT, la reserva de
Google News seguía haciendo `if (!r.ok) return []`. Google contestó **503** a una
IP que había consultado demasiado en una tarde de pruebas, y el sistema lo leyó
como que nadie en el mundo había escrito del asunto. Peor sitio no podía tener:
la reserva es lo que se usa **cuando lo otro ya falló**, así que el fallo se
manifestaba justo cuando no quedaba nada más que mirar.

Lo general: es [[una regla que nunca se ha disparado es una regla sin probar]]
con otra cara — **una comprobación que no corrió no puede parecerse a una que
pasó**, y menos si de eso depende adónde va el dinero. Y el corolario que costó
descubrir dos veces: **arreglar el camino principal y no el de reserva es no
haberlo arreglado.** Cuando un fallo es de una clase, se busca la clase entera.

### Rigor que produce un texto ilegible es rigor mal puesto
_Applies to: LLM_

**Síntoma** — Para no mentir, la versión española dejaba las citas en inglés
dentro de la prosa. Después, en cursiva sin comillas. Las dos correctas y las dos
raras de leer.
**Causa** — Se protegía una promesa —«unas comillas son las palabras exactas»—
que en una traducción **nadie está haciendo**. La convención española ya
significa «esto dijo», no «esto sonó así»; el problema era mío, no del lector.
**Arreglo** — Traducir y entrecomillar, como cualquier periódico. Y trasladar el
verificador: en español el fusible no compara letra por letra, comprueba que no
haya más voces citadas que en el original.

Lo general: **antes de defender una invariante, comprueba que alguien la esté
leyendo como tú.** Dos soluciones rigurosas seguidas, cada vez más rebuscadas,
suelen ser la señal de que lo que falla es la premisa y no la implementación.

### Cuando una marca promete algo que no puedes cumplir, cambia la marca
_Applies to: LLM_

**Síntoma** — Para no mentir, la versión española dejaba las citas en inglés
dentro de la prosa. Rigurosa y **ilegible**: el lector no sabe si es un descuido
o una decisión.
**Causa** — Se dio por hecho que la disyuntiva era fidelidad o legibilidad, y se
eligió fidelidad. La disyuntiva era falsa.
**Arreglo** — El problema no era la traducción, era la marca: **unas comillas
prometen «palabras exactas», y una traducción no puede cumplirlo**. En cursiva y
sin comillas, el mismo texto dice «esto es lo que dijo» sin prometer literalidad
— y eso sí lo sostiene.

Lo general: cuando una convención tipográfica te obliga a elegir entre ser fiel y
ser legible, **suele ser la convención lo que está mal aplicado**, no el
contenido. Y el verificador se traslada con ella: en español el fusible ya no
compara letra por letra, comprueba que no haya comillas ni voces inventadas.

### Un modelo que razona traduciendo es dinero quemado en pensar
_Applies to: LLM · Anthropic_

**Síntoma** — Traducir 2.500 palabras costaba $0,094 y trece minutos: casi lo
mismo que ESCRIBIR el número entero, cuya entrada es doce veces mayor.
**Causa** — El razonamiento se factura como salida. Medido sobre el mismo
trabajo: Grok sin razonamiento gastó **5.004** tokens de salida, Kimi K3
**41.387**, y DeepSeek v4-flash **32.000 sin emitir una sola letra** — se los
comió pensando y devolvió el `content` vacío.
**Arreglo** — Para una tarea mecánica, la variante SIN razonamiento. Ocho veces
menos tokens por el mismo resultado.

Lo general: **el eje no es el precio por millón, es cuántos tokens gasta el
modelo en llegar a la respuesta.** Un modelo «barato» que razona de más sale más
caro que uno «caro» que va al grano — y puede no llegar nunca.

### Ningún modelo acierta siempre: verifica y pasa al siguiente
_Applies to: LLM_

**Síntoma** — Buscando el traductor que nunca tradujera una comilla, tres vueltas
de cada candidato: Grok 2/3, Haiku 2/3, Gemini 1/3. **Ninguno 3/3.**
**Causa** — Se buscaba el modelo correcto para una tarea donde el fallo es
binario y ocasional. Elegir «el mejor» seguiría dejando sin edición española una
semana de cada tres.
**Arreglo** — Una cascada verificada. El fusible da un veredicto inmediato y
gratis sobre cada intento, así que se prueba el más barato, se comprueba, y si
tocó una cita se pasa al siguiente. Con dos de cada tres por modelo, tres
intentos dan un 96% — y en la primera corrida real acertó Gemini, gratis, en
diecisiete segundos.

Lo general, y ya estaba aprendido para el número en inglés: **cuando tienes un
verificador barato, deja de elegir el mejor generador y empieza a comprobar el
resultado.** El fusible no eligió un modelo perfecto; comprueba el que hay.

### Una traducción vieja junto a un texto nuevo son dos revistas distintas
_Applies to: relational database · LLM_

**Síntoma** — Se rehace el número, la traducción falla, y la página en español
sigue sirviendo el número ANTERIOR bajo la misma fecha y el mismo enlace. Dos
revistas con contenidos que no se parecen.
**Causa** — El guardado solo escribía `body_es` si había traducción nueva. Sin
ella, la anterior se quedaba — y «se quedó lo de antes» es aquí un texto que
afirma cosas distintas de las que afirma su versión inglesa.
**Arreglo** — Si no hay traducción nueva, se BORRA la vieja. Un idioma sin
traducir se dice; un idioma con la traducción de otro número es una mentira
silenciosa.

Lo general: **cuando un campo derivado no se puede actualizar, se invalida — no
se conserva.** Conservarlo parece prudente y es lo contrario: deja una respuesta
antigua contestando una pregunta nueva.

### La cuenta informa más que la lista
_Applies to: repository / CI-CD_

**Síntoma** — Al pie de cada pieza, doce enlaces desplegados. La línea que menos
tiene que interrumpir era la que más interrumpía.
**Causa** — Se enseñaba la lista entera por transparencia, y la transparencia se
confundió con volcarlo todo a la vista.
**Arreglo** — Plegarlo y dejar fuera **la cuenta**: «12 fuentes · 4 de fuera».
Eso responde de un vistazo las dos preguntas que el lector se hace —cuánto
sostiene esto, y ¿salieron a comprobarlo?— y la lista queda a un clic.

La transparencia no es enseñarlo todo a la vez: es que nada esté escondido y lo
importante esté arriba. Un dato resumido que se puede abrir informa más que
doce datos que hay que leer.

### Marcarlo todo es no marcar nada
_Applies to: LLM_

**Síntoma** — Cada párrafo del número llevaba su etiqueta epistémica y el nombre
de quien había hablado. Leerlo era enterarse de quién dijo qué, no de qué pasó.
**Causa** — El aparato marcaba los tres estados —documentado, atribuido,
afirmado— así que TODO llevaba marca. Y cuando todo lleva marca, la marca deja
de avisar de nada: es tipografía de fondo.
**Arreglo** — Que la marca signifique **advertencia**, y el silencio, asentado.
La prosa sin marcar es lo comprobado; lo demás va señalado y con su fuente
nombrada. La consecuencia buena es que el silencio hay que ganárselo: solo se
deja sin marcar lo que el reporteo de fuera sostiene.

Lo general: **un indicador que se pone en todos los casos no es un indicador.**
La información está en el contraste, y si no hay contraste no hay información.

### Un ranking por volumen entierra justo lo que añadiste para no perderte
_Applies to: LLM · relational database_

**Síntoma** — Arturo añade dos canales mexicanos, se leen 22 episodios suyos, y
el número no cita ni uno. Los canales de IA que añadió el mismo día sí salieron.
**Causa** — Al modelo se le pasan los doce temas mayores, ordenados por número
de canales. «Mexican political power dynamics» —14 elementos— quedó en el puesto
**29**: dos canales no compiten con once. Los de IA sumaban seis y entraron.
El sistema no descartó el material: **el modelo nunca supo que ese racimo
existía**.
**Arreglo** — Reservar sitio para los temas que se cuentan en otra lengua, y
DECIRLO en la lista: «carried in es, not en». Que un asunto de la semana solo
exista en español es información sobre la semana, no fontanería.

Lo general, que es lo que vale: **cuando un ranking mide alcance propio y se usa
como si midiera importancia, entierra sistemáticamente lo que acabas de añadir
para ampliar el alcance.** El recuento de canales dice cuánto oye esta
publicación, no cuánto importa el asunto — y confundir las dos cosas convierte
cada fuente nueva en una que no se usa.

### La semana del lector, no la del servidor
_Applies to: relational database · Supabase_

**Síntoma** — Ninguno visible: el número decía «16 → 22» y nadie lo discutía.
**Causa** — Todo el reloj estaba anclado a UTC y el lector vive en Los Ángeles.
Esa ventana empezaba el SÁBADO 15 a las 17:00 hora de aquí y terminaba el
viernes 21 a las 17:00: un episodio del sábado por la tarde caía en la semana
siguiente, y el sábado que el número decía cubrir no lo cubría.
**Arreglo** — Anclar a `America/Los_Angeles`, y la aritmética en hora LOCAL
antes de convertir: `timestamptz - interval '7 days'` se resuelve en la zona de
la sesión y en un cambio de horario mueve el borde una hora.

Y el corolario que vale más que el arreglo: la ventana la calculaban CUATRO
sitios por su cuenta —el número, el reportaje, el cotejo, los monitores— más el
panel. Cuatro definiciones que podían discrepar sin que nada lo dijera. Ahora es
una función con un parámetro de referencia, y todos la llaman. **Un concepto que
aparece en cuatro archivos no está definido cuatro veces: está indefinido.**

### Una compuerta barata puesta después de la cara
_Applies to: LLM · Anthropic_

**Síntoma** — «Cut now» sobre una semana ya publicada gastaba dieciséis minutos
y una llamada entera a Kimi para acabar diciendo «no se toca».
**Causa** — «¿Ya está publicada esta semana?» se comprobaba tras escribir el
número. No depende de una sola palabra del texto: se sabía desde el principio.
**Arreglo** — Lo que se puede decidir sin el resultado se decide antes de
pagarlo. Regla general para cualquier tubería con un paso caro: **ordenar las
compuertas por precio, no por el orden en que se te ocurrieron.**

### Una función desplegada a mano es código que el siguiente despliegue borra
_Applies to: deployment / hosting · Supabase · repository / CI-CD_

**Síntoma** — Filas `skipped` con notas «filtrado: dura 1m06s…» escritas ayer por
un código que no existe en ningún sitio: ni en el repo, ni en la función
desplegada.
**Causa** — El filtro de duración de YouTube vivió solo en una versión de la
edge function desplegada directamente, sin commitear. El siguiente despliegue
desde el repo lo pisó, y desde entonces Shorts y directos entraban a Gemini como
vídeo — 4 directos, ~18 cortos pagados, un 403 en error.
**Arreglo** — Restaurarlo EN GIT. Y la regla que ya existía para el esquema
(«las migraciones aplicadas y no commiteadas dejan un esquema irreconstruible»)
se extiende al código: **nada se despliega que no esté commiteado.**

### Una regla que nunca se ha disparado es una regla sin probar
_Applies to: LLM · monitoring / health checks_

**Síntoma** — Ninguno. Ese es el síntoma.
**Causa** — La regla central del fusible —cada dorado necesita un cotejo
`documenta` detrás— llevaba muerta desde su commit: el select no traía
`claim_text`, la normalización degradaba `undefined` a un set vacío, y TODO
dorado habría levantado un fallo grave inventado. Nadie lo vio porque nunca hubo
un dorado que la ejercitara, y el propio mensaje del commit celebraba «cero
dorados — correcto».
**Arreglo** — Dos. El select trae la columna, y el fusible LANZA si le llegan
cotejos sin ella: un contrato entre guion y librería se comprueba, no se confía.
Y la regla de proceso: **toda regla nueva del fusible se estrena con un caso que
la dispare y otro que no** — se hizo aquí con los cuatro casos y uno cazó un
segundo fallo en el acto.

### Un contrato no viaja en frases para humanos
_Applies to: repository / CI-CD_

**Síntoma** — El alta rechaza-fuentes-rotas se probó en vivo y el feed roto
entró igual.
**Causa** — La primera versión decidía filtrando el AVISO con un regex de
frases («did not answer|no feed|…») y «the feed responded 404» no estaba en la
lista. El estado de salud se calculaba, se formateaba en prosa inglesa, y se
decidía sobre la prosa.
**Arreglo** — Una bandera `saludable: boolean` del clasificador al alta. La
prosa es para la persona; el contrato, para el código. (Y la prueba en vivo es
la que lo cazó: la revisión de código lo habría dado por bueno.)

### El parte mide lo que ENTRÓ, no lo que se vio
_Applies to: search / benchmarking · Tavily_

**Síntoma** — El número podía afirmar «X dice 12.000 y Y dice 9.400» sin ningún
`r` que lo sostuviera, o «reports filed from TR, MX» con los dos recortados.
**Causa** — Los hechos calculados del reportaje (choques, despachos compartidos,
países) se medían sobre TODO lo hallado, y al número solo entraban ≤3 por tema.
En una publicación cuya premisa es la procedencia, describir documentos que el
lector no puede alcanzar es la categoría más cara de mentira.
**Arreglo** — Dos medidas: la del proceso (para decidir si seguir buscando) y la
de lo que entró (para lo que el número puede citar). Solo la segunda llega al
prompt.

### Un tope que envuelve de más apaga lo que no gasta
_Applies to: monitoring / health checks_

**Síntoma** — Agotada la cuota diaria de YouTube, los podcasts y la prensa
dejaban de sondearse el resto del día — y no gastan esa cuota.
**Causa** — El gate de `cap_youtube_dia` envolvía el bucle de descubrimiento
entero en vez de la rama de YouTube.
**Arreglo** — El tope frena exactamente lo que mide. Un gate se pone alrededor
del gasto, no alrededor del trabajo.

---

## Modelos de lenguaje

### El `content` vacío de un modelo de razonamiento no es un fallo de parseo
_Applies to: LLM · Anthropic_

**Síntoma** — `Expecting value: line 1 column 1 (char 0)` al leer la respuesta.
Parece que el modelo devolvió basura.
**Causa** — Los modelos de razonamiento devuelven el pensamiento en un campo
aparte (`reasoning_content`, `completion_tokens_details.reasoning_tokens`) pero
**lo pagan del mismo `max_tokens`**. Con un presupuesto ajustado, el razonamiento
se lo come entero y `content` vuelve vacío con `finish_reason: length`. Medido:
Kimi K3 gastó 83 de 99 tokens razonando para escribir la palabra «hello»; con el
prompt real gastó 22.000 antes de emitir una sola letra de respuesta.
**Arreglo** — Presupuesto muy por encima de la salida esperada (64.000 para
5.000 de texto), y comprobar `finish_reason` antes de intentar parsear. Un
`content` vacío es un presupuesto corto, no un modelo roto.

### `fetch` de Node aborta a los 300 s esperando cabeceras
_Applies to: LLM · deployment / hosting_

**Síntoma** — `TypeError: fetch failed` con `UND_ERR_HEADERS_TIMEOUT` en
llamadas largas a un modelo. La petición nunca llega al proveedor.
**Causa** — El despachador de undici que hay debajo de `fetch` corta a los 300 s
si no ha visto cabeceras. Un modelo que razona 950 s antes de emitir nada nunca
llega.
**Arreglo** — `node:https` con `req.setTimeout()` propio. `AbortSignal.timeout`
no sirve: gobierna el total, no la espera de cabeceras.

### Elegir modelo por precio es elegir mal; el eje real es si aplana las distinciones
_Applies to: LLM · Anthropic_

**Síntoma** — Un número semanal correcto y sin errores que aun así no servía.
**Causa** — Se midieron seis modelos con el mismo material y el mismo encargo. La
prosa era aceptable en todos. La diferencia estaba en qué consideraban noticia:
el más barato tomó la tesis del material y la contó; los mejores contaron que la
tesis venía casi toda de los mismos cuatro canales. Un modelo flojo convierte
«lo afirmó sin respaldo» en «según los analistas» sin darse cuenta.
**Arreglo** — Medir sobre material propio y juzgar por la salida, no por
`benchmarks`. Y mirar el coste al final: la diferencia entre lo más caro y lo
gratis eran 32 dólares **al año**, así que el precio no debía decidir nada.

### Una regeneración parcial no debe sobrescribir a una completa
_Applies to: LLM · relational database_

**Síntoma** — Un artefacto generado apareció con tres secciones donde antes tenía
cinco, sin ningún error.
**Causa** — Se agotó la cuota diaria del modelo a mitad de generación. Dos
secciones fallaron, el resto se guardó, y el `upsert` pisó la versión buena.
«Se regeneró correctamente» y «se regeneró entero» no son lo mismo.
**Arreglo** — Comparar con lo que ya hay antes de escribir y conservar lo mejor.
Y que el mensaje de error diga «cuota agotada», no «no se pudo generar».

---

## Ingesta y cuotas

### La lista de subidas de un canal no es su lista de episodios
_Applies to: search / benchmarking_

**Síntoma** — El sistema procesaba 156 elementos al día para 19 canales, cifra
que no cuadraba con nada.
**Causa** — Una lista de subidas trae Shorts, clips promocionales y
retransmisiones mezclados y sin marcar. Medido sobre una semana: de 1.091
vídeos, **solo 324 duraban diez minutos o más**. El 70% era ruido, y el ruido
cuesta lo mismo: una llamada por elemento, dure cuarenta segundos o tres horas.
Había cuatro veces más Shorts que entrevistas, y una retransmisión de once horas
consumía 1,4 millones de tokens ella sola.
**Arreglo** — Filtrar por duración en el descubrimiento, antes de gastar nada.
Suelo de 10 minutos, techo de 3 horas.

### Un filtro que trabaja en silencio es indistinguible de un descubrimiento roto
_Applies to: search / benchmarking · LLM_

**Síntoma** — «0 nuevos» en el registro. ¿No hay nada, o algo se rompió?
**Causa** — Los filtros descartaban sin contar. La única señal era la misma que
produce un fallo total.
**Arreglo** — Contar y devolver lo descartado por motivo
(`{cortos: 200, largos: 1, directos: 2}`). Y si un tope recorta la cobertura,
decírselo también al modelo, para que el resultado no presuma de una cobertura
que no tuvo.

### Una fuente correcta y callada se lee igual que una averiada
_Applies to: repository / CI-CD · monitoring / health checks_

**Síntoma** — Se dan de alta tres podcasts y dos no traen ni un episodio. En la
lista de fuentes salen como «0 en cola, 0 esta semana», que en esa lista
significa muerta.
**Causa** — Ninguna avería: el radar solo mira siete días hacia atrás al dar de
alta una fuente, y los dos programas eran quincenales con su último episodio a
once y doce días. Correctos, vivos y silenciosos.
**Arreglo** — Decirlo **en el momento de añadirla**, que es cuando la persona
está mirando: «su último episodio es de hace 11 días, y el radar mira 7 hacia
atrás». Un aviso en un registro que nadie abre no habría servido de nada.

Es la lección del filtro silencioso otra vez, y por eso vale la pena escribirla
aparte: la primera vez fue un filtro descartando sin decirlo, esta es una
ventana. Lo que se repite no es el mecanismo, es **el hueco entre «no hay nada»
y «no se buscó»**, y cada vez aparece en un sitio distinto.

### Un título de feed trae el eslogan pegado
_Applies to: repository / CI-CD_

**Síntoma** — En la lista de fuentes: `"The Cognitive Revolution" | AI Builders,
Researchers, and Live Player Analysis`.
**Causa** — Apple y muchos feeds meten el reclamo dentro del `<title>`, porque
ahí es donde lo ve quien busca en su tienda.
**Arreglo** — Cortar por el separador, pero **solo si el título es largo** y lo
que queda delante sigue siendo un nombre. Sin esa condición se estropean los
nombres legítimos con guion: «Judge Napolitano - Judging Freedom» y «Center for
Strategic & International Studies» tienen que quedarse enteros.

Y un fallo que se descubrió al tocarlo: el título se leía con un patrón de «todo
menos `<`», y un título en CDATA empieza justo por `<`. Un podcast de Substack se
daba de alta como «untitled» y nadie lo habría notado hasta ver la lista.

### Excluir por «fue un directo» descarta casi todo lo bueno
_Applies to: search / benchmarking_

**Síntoma** — Un filtro nuevo dejó fuera 48 elementos de golpe.
**Causa** — Se usó la marca de retransmisión como señal de «no es un episodio».
Pero muchos programas se emiten en vivo y dejan la grabación, y esa grabación es
un episodio normal. **47 de los 48 descartados estaban bien**: entrevistas de 30
a 75 minutos.
**Arreglo** — Decidir por duración, que es la propiedad que importa. Y revisar
siempre una muestra de lo que un filtro nuevo tira, no solo de lo que deja pasar.

---

### YouTube sirve los subtítulos a tu ordenador y no a un servidor
_Applies to: search / benchmarking_

**Síntoma** — `yt-dlp` baja los subtítulos sin problema desde un portátil y
devuelve «Sign in to confirm you're not a bot» desde un GitHub Action.
**Causa** — YouTube distingue direcciones residenciales de centros de datos. La
misma orden, el mismo vídeo, distinto resultado según de dónde salga.
**Arreglo** — Ninguno que merezca la pena. Se puede pasar con las cookies de tu
sesión, y ahí es donde hay que pararse: automatizar el acceso con la sesión de
una persona es lo que esos términos prohíben y lo que hace que se cancelen
cuentas. Es la misma línea que con los periódicos de pago, y se traza igual.

Lo importante es que el ahorro que prometía no era dinero: los tokens de vídeo
salen del tramo gratuito y el consumo va por 84 llamadas diarias de 500. Era
holgura y velocidad. **Medir el ahorro antes de perseguirlo habría evitado
construirlo**: cuatro veces menos de algo que sobra no es una mejora, es una
optimización de lo que no aprieta.

El camino queda montado y apagado de hecho: si algún día se ejecuta desde una
máquina con dirección residencial, funciona sin tocar nada.

## Supabase

### Un índice parcial no puede arbitrar un `ON CONFLICT`
_Applies to: Supabase (phd-kb) · relational database_

**Síntoma** — El descubrimiento decía «0 nuevos» durante días con la cola llena.
**Causa** — Postgres rechaza un índice único **parcial** como árbitro de
`ON CONFLICT` (error 42P10). El `upsert` fallaba en cada pasada. Y el error no se
miraba, así que el fallo se presentaba como un resultado normal.
**Arreglo** — Índice único completo para lo que arbitre un `ON CONFLICT`, y
comprobar el `error` de todo `upsert`. Un `upsert` cuyo error no se lee es un
`upsert` que puede llevar semanas sin escribir.

### Los 150 s de una edge function deciden el modelo, no al revés
_Applies to: Supabase (phd-kb) · deployment / hosting · LLM_

**Síntoma** — La generación funcionaba solo con el modelo más flojo.
**Causa** — El techo duro de la función no daba para nada mejor. Medido sobre la
misma tarea: 45 s el más rápido, 104, 169, 170, 326, y 952 el que mejor escribía.
Solo cabía el peor, y eso estaba eligiendo el modelo en silencio.
**Arreglo** — Trabajo largo a un runner sin ese techo (GitHub Actions da seis
horas). La edge function se queda para lo que responde en segundos.

### Una fila que se marca «en curso» necesita quién la rescate
_Applies to: Supabase (phd-kb) · relational database_

**Síntoma** — Un elemento llevaba nueve minutos «procesando» en un sistema donde
nada dura más de 150 s.
**Causa** — El corte por tiempo de una edge function es duro, no una petición
amable: el proceso muere sin poder revertir la marca. El bucle solo recoge lo
«pendiente», así que esa fila no vuelve a mirarse jamás.
**Arreglo** — Al empezar cada pasada, devolver a «pendiente» lo que lleve
demasiado en curso. Y mirar la marca de **inicio del proceso**, no la de creación
de la fila: usar la segunda reinicia trabajo que está yendo bien ahora mismo.

---

## Vercel y Astro

### `redirects` en la configuración pierde contra la normalización de barra final
_Applies to: Vercel · deployment / hosting · static site generation_

**Síntoma** — Rutas retiradas daban 404 en producción pese a tener su redirección
declarada, y el build no avisaba de nada.
**Causa** — El sitio sirve todo con barra final. Astro genera la regla **sin**
ella (`^/admin/inbox$`), y Vercel normaliza a barra final **antes** de mirar las
redirecciones. Resultado medido: `/admin/inbox` → 308 → `/admin/inbox/` → 404.
El marcador guardado daba 404 igual, solo que con un salto de por medio.
**Arreglo** — Una página real que devuelve `Astro.redirect()`. Respeta la
convención del sitio porque es una ruta del sitio. Y comprobar las redirecciones
**en producción**, no en el build: aquí el build estaba contento.

---

## Credenciales

### Una clave nueva no separa la cuota; hay que separar la cuenta
_Applies to: 1Password · credential management · LLM_

**Síntoma** — Se creó una clave propia para un proyecto y el límite seguía siendo
compartido.
**Causa** — Los límites de concurrencia y de gasto cuelgan de la **organización**,
no de la clave. Una segunda clave dentro de la misma cuenta comparte el tope de
una petición simultánea: un trabajo de 16 minutos bloquea al otro proyecto entero
durante 16 minutos.
**Arreglo** — Cuenta separada, con otro correo. Y **comprobarlo**: pedir el id de
organización y confirmar que difiere. Que la clave responda no prueba nada.

### El campo de 1Password no siempre se llama igual
_Applies to: 1Password · credential management_

**Síntoma** — 401 del proveedor con una clave recién copiada. Parece una clave
revocada.
**Causa** — Unos items guardan el secreto en `credential` y otros en `api-key`.
`op item get --fields credential` sobre el item equivocado devuelve **vacío**, sin
error, y la petición sale con la cabecera de autorización en blanco.
**Arreglo** — Convención por proyecto (aquí, siempre `credential`), y ante un 401
mirar los campos del item antes de sospechar del proveedor.

---

## Reutilizar lo de la cartera

### Umbrella enruta por capacidad DECLARADA: lo que no declaras, no te llega
_Applies to: GitHub · repository / CI-CD_

**Síntoma** — Se construyó un vigilante de salud del sistema desde cero. Thesis ya
tenía uno mejor: `phd-agents/system_review`, con seis bloques, su checklist en un
documento aparte como fuente de verdad, y una tabla de modos de fallo conocidos.
**Causa** — El informe de Umbrella sí dice «esto ya está resuelto en otro
proyecto», pero solo para las capacidades que el proyecto declara. Glossa nunca
declaró vigilancia ni salud del sistema, así que nada de eso se enrutó — y el
bloque de Glossa recibía sesenta lecciones sobre Vercel y Supabase y ninguna
sobre monitorización.
**Arreglo** — Declarar la capacidad ANTES de construirla, no después. Y cuando se
empieza una capacidad entera nueva, mirar los nombres de los agentes de los otros
proyectos directamente: la lista de directorios de `phd-agents/` decía
`workflow_failure_monitor` y `system_review` a la vista, y aun así se construyó de
nuevo.

### Una regla que solo mira `failure` no ve un trabajo muerto por tiempo
_Applies to: GitHub · repository / CI-CD_

**Síntoma** — Un vigilante en verde sobre un sistema parado.
**Causa** — Un paso que agota su `timeout-minutes` acaba en `cancelled`, no en
`failure`. Y un trabajo que dejó de programarse no produce ninguna corrida que
mirar, así que una regla que examina «las últimas N corridas» no ve nada raro:
no hay nada.
**Arreglo** — Tres reglas, no una: conclusión mala incluye `cancelled`,
`timed_out` y `startup_failure`; avisar de un trabajo que lleva más de su cadencia
sin correr; y comprobar `state !== 'active'`, porque GitHub apaga los horarios de
un repo inactivo. Las tres están en el checklist de thesis
(`phd-agents/docs/REVISION-SISTEMA.md`), que ya las había pagado.

### Un vigilante con falsas alarmas es un vigilante que se ignora
_Applies to: GitHub · repository / CI-CD_

**Síntoma** — El día que se añadieron tres relojes nuevos, el panel abrió con tres
alarmas de «no ha corrido nunca».
**Causa** — Eran ciertas y eran inútiles: los tres se habían creado dos horas
antes y su turno no había llegado.
**Arreglo** — No exigirle a un trabajo haber corrido antes de que pase una
cadencia entera desde que existe. Es la misma lección que el fusible: acusar mal
es peor que no acusar, porque lo que se rompe es la confianza en el aviso, y
entonces ya no protege de nada.

## Salir a buscar

### Una etiqueta de tema no es una consulta de búsqueda
_Applies to: search / benchmarking · Tavily · LLM_

**Síntoma** — Se sale a buscar «Security dynamics in the Middle East» y vuelve
teletipo genérico, o nada.
**Causa** — Las etiquetas las produce un clasificador leyendo comentario
político, así que salen abstractas por construcción: «U.S. strategy and
hegemony», «Ideological discourse and political rhetoric». Son buenas para
agrupar y **inservibles para buscar**: no llevan un nombre propio, ni una cifra,
ni una fecha, que es lo único que hace funcionar una búsqueda de noticias.
**Arreglo** — La consulta se construye de lo CONCRETO —las tesis y las
afirmaciones comprobables de los elementos del tema—, no de la etiqueta. Y la
propone un modelo barato, porque el ángulo que hace falta («¿qué habría escrito
un reportero en ese país?») es justo lo que una palabra clave no sabe producir.
El código luego la constriñe: si el tema toca un país no anglófono y todas las
consultas volvieron en inglés, sintetiza una — aceptar el juego entero en inglés
es no haber salido.

### Digerir un reporte con el prompt de un episodio le fabrica una voz
_Applies to: LLM · Anthropic_

**Síntoma** — El reporte de una agencia acaba en el material con una tesis en
forma «Reuters argues that…», indistinguible de un programa de opinión.
**Causa** — El prompt del análisis pide `thesis`, `framing` y `speakers` porque
está hecho para analistas con posición. Aplicado a un despacho, **inventa la
posición**: es el aplanamiento que la publicación existe para negar, reproducido
un piso más abajo.
**Arreglo** — Un prompt distinto que no puede producir una voz: qué ocurrió,
quién habló para el acta, qué cifras se publicaron y quién las publicó, qué dice
el propio reporte que sigue sin saberse. Sin `thesis` y sin `framing`. **La forma
del objeto es la distinción**, antes de que ninguna regla posterior tenga que
defenderla — porque una distinción destruida en el punto de entrada no la
recupera ningún prompt de después.

### El presupuesto de búsqueda se ajusta solo mirando si los medios divergen
_Applies to: search / benchmarking · Tavily_

**Síntoma** — Un número fijo de búsquedas por tema gasta igual en el asunto donde
todos repiten un despacho de agencia que en el que cada país cuenta distinto.
**Causa** — El valor de una búsqueda más no es constante: depende de si lo que ya
volvió converge o no.
**Arreglo** — Se busca por rondas de dos y después de cada una se mide, gratis y
mecánicamente: cuántos RELATOS distintos hay tras colapsar casi-duplicados y
despachos compartidos, y si dos medios publican cifras distintas para lo mismo.
Se para cuando la ronda no aportó ningún relato nuevo, cuando ya hay cupo, o
cuando todos repiten uno solo. La forma que sale es la correcta: **se gasta más
donde la primera pasada volvió pobre y menos donde volvió rica.**

Y una corrección que costó una prueba: la dispersión sola no vale. Con una
etiqueta abstracta da 1 siempre —seis historias distintas, no seis versiones de
un hecho— y habría mandado buscar el máximo cada vez. Sirve para el caso
contrario, que también existe.

### Pagar una búsqueda y luego descubrir que no cabe
_Applies to: search / benchmarking · Tavily_

**Síntoma** — Una ronda gasta dos búsquedas, devuelve cinco resultados buenos, no
usa ninguno, y el parte lo archiva como «sin hallazgos».
**Causa** — El corte por cupo estaba DENTRO del bucle que digiere, o sea después
de haber pagado. Y el motivo de parada se dedujo de «no entró nada nuevo», que
era cierto y decía lo contrario de lo que pasó.
**Arreglo** — Toda compuerta de gasto se comprueba antes de gastar, y el motivo
de parada se registra explícito (`cupo`, `convergen`, `sin_hallazgos`,
`tope_semana`), nunca se deduce. Un parte que dice «no había nada» cuando lo que
pasó es «había de sobra» es peor que no tener parte.

### Un tope que cuenta mal no es un tope
_Applies to: search / benchmarking · Tavily_

**Síntoma** — La cuota real del proveedor se agota mucho antes de que el tope
propio diga nada.
**Causa** — Una búsqueda `advanced` de Tavily cuesta **dos** créditos y el
contador apuntaba uno, justo en las búsquedas más caras. El tope medía la mitad
de lo que se gastaba.
**Arreglo** — Apuntar `advanced ? 2 : 1`. Y arreglarlo **antes** de subir el
tope: subir un límite que no sabes leer no es subirlo.

Junto a esto, el otro fallo del mismo contador: `uso()` se lee una vez al
arrancar y no se vuelve a leer, mientras `apuntar()` escribe en la base. Una
corrida de veinte búsquedas pasaba la comprobación veinte veces aunque hubiera
reventado el tope en la tercera. Hay que sumar también en la copia local.

### Buscar fuera y encontrarse a uno mismo
_Applies to: search / benchmarking · Tavily_

**Síntoma** — «Salir a buscar» devuelve la transcripción del mismo episodio que
motivó la búsqueda.
**Causa** — Excluir `youtube.com` no basta. Hay sitios que viven de transcribir
programas: dos de los cuatro primeros hallazgos de búsqueda del proyecto fueron
transcripciones de `singjupost.com` de las mismas entrevistas que ya publican los
canales seguidos.
**Arreglo** — Dos capas. El código excluye los dominios de las fuentes seguidas,
las plataformas y los sitios de transcripción. Y el prompt descarta lo que sea
una entrevista, una columna de opinión o un comunicado reproducido entero —
porque la lista de dominios siempre irá por detrás, y un programa disfrazado de
reporteo es peor que no encontrar nada.

---

## El panel

### Un número que suma tres cosas distintas no informa de ninguna
_Applies to: monitoring / health checks_

**Síntoma** — Arturo mira el panel y pregunta qué significa «446 picked up this
week».
**Causa** — Sumaba lo ya leído, lo que esperaba en cola y 155 elementos
descartados por duración. Tres estados distintos en una cifra. Al lado, «225 read
in total» contaba desde el principio de los tiempos y «78 topics alive» eran
todos los temas que han existido — de los que 75 eran de esa misma semana, así
que ni siquiera distinguía.
**Arreglo** — Cada número contesta **una** pregunta, y todos miran la ventana que
va a usar la acción que se decide con ellos. «81 por leer» no dice si esperar;
«81 · ~7 h», calculado del ritmo real de las últimas seis horas, sí.

Y la ventana se calcula en un solo sitio (`glossa_semana_actual()`) que usan el
panel y el guion. Si cada uno la calculara por su cuenta, el panel diría una cosa
y la revista traería otra — peor que no tener números.

### Una ventana relativa a «hoy» multiplica filas en vez de actualizarlas
_Applies to: relational database · Supabase_

**Síntoma** — Aparecen revistas guardadas con fechas que no son las de ninguna
semana: `2026-08-15`, `2026-08-17`.
**Causa** — La ventana era «los últimos siete días desde hoy». La llave de la
tabla es la semana, así que cortar el martes escribía `2026-08-18` en vez de
actualizar la fila de la semana. Cada corte a mano creaba una revista suelta.
**Arreglo** — Anclar al domingo: el corte del domingo cierra la semana anterior;
cualquier otro día cubre de ese domingo hasta hoy y pisa **la misma fila**.

Con eso hace falta distinguirlos, o la compuerta que conserva «el número con más
piezas» dejaría que un corte parcial le ganara al oficial. Una columna `parcial`,
y la comparación solo entre cortes del mismo tipo.

### `ON DELETE CASCADE` detrás de un botón que dice «remove»
_Applies to: relational database · Supabase_

**Síntoma** — Ninguno todavía, y ese es el problema.
**Causa** — La clave ajena de los episodios es `ON DELETE CASCADE`. Quitar una
fuente del panel borra sus episodios **y el análisis de cada uno**, que es trabajo
ya pagado y no vuelve. El aviso decía «Episodes already read go with it» sin
decir cuántos.
**Arreglo** — El aviso trae la cifra. Perder cero y perder cuarenta y uno no son
la misma decisión, y un aviso que no la distingue se acepta sin leer.

---

## Publicar

### Todo lo que se genera necesita un lector nombrado, y comprobado
_Applies to: GitHub · repository / CI-CD_

**Síntoma** — Un pipeline nocturno correcto que no servía para nada.
**Causa** — Los dossieres se diseñaron sin nadie que los abriera. Se habrían
generado cada noche dando la falsa impresión de que el sistema funcionaba.
**Arreglo** — Antes de construir lo que produce algo, nombrar quién lo lee y por
dónde llega. Aquí eso obligó a construir el panel; sin él, la salida no existía.
Es el `STANDARD-PUBLISHED-OUTPUT` de la cartera, aprendido de nuevo por las malas.

### Las migraciones aplicadas y no commiteadas dejan un esquema irreconstruible
_Applies to: Supabase (phd-kb) · GitHub · relational database_

**Síntoma** — El historial saltaba de la 0009 a la 0016.
**Causa** — Seis migraciones se aplicaron a producción desde una sesión y nunca
llegaron al repo. El esquema vivía solo dentro del proveedor.
**Arreglo** — Se recuperaron con
`select statements[1] from supabase_migrations.schema_migrations`, que guarda el
SQL aplicado. Y la regla: aplicar y commitear son el mismo paso, no dos.

## Lo que enseñó cerrar el ciclo de fuentes y pulir el panel (2026-08-24)

### Un contador que enseña «usados» se lee como «quedan»
_Applies to: design system, general_

**Síntoma** — La línea de gasto decía `tavily 117/1000` y Arturo preguntó,
alarmado, si de verdad quedaban ~120 créditos para todo el mes. Quedaban 883:
había leído lo gastado como lo restante.
**Causa** — Un contador rodante sin verbo. `117/1000` no dice si el 117 va
subiendo o bajando, y el lector completa con el sentido que más le preocupa.
**Regla** — Toda cifra de cupo lleva el verbo al lado (`117 used of 1000`,
`883 left`) o va en una tabla con columnas nombradas y el total a la derecha.
Y el mismo dato no se enseña dos veces con formatos distintos: la segunda
versión es donde nace la lectura equivocada.

### Si lo decide el sistema, el panel no enseña mandos
_Applies to: design system, general_

Los mandos numéricos del reportaje (temas, techo, cupo) y la tabla de reparto
se quitaron a petición del único usuario: «si eso lo decide el agente o el
comité, yo no tengo nada que opinar o mover ahí». Un control que el usuario no
puede accionar con criterio no es transparencia, es ruido que desplaza a lo que
sí decide. Los ajustes siguen en `glossa_radar_settings` para operarlos por SQL.
La misma regla puso el veto como único mando del vivero de fuentes: el sistema
propone y el comité decide; la persona conserva exactamente un botón, el de parar.

### El vigilante que solo anota entrena a ignorar avisos
_Applies to: monitoring_

**Síntoma** — El mismo elemento en `error` aparecía en el panel cada noche,
idéntico, hasta que el aviso se volvió mobiliario.
**Regla** — Detectar sin resolver solo vale para lo que una persona debe
decidir. Lo pasajero se recupera solo (ya se hacía), y lo irrecuperable que
lleva 48 h se ARCHIVA con su motivo (`skipped`), no se re-anota. Un aviso que
nunca cambia no es un aviso.

### Una cola que lista trabajo hecho se lee como atasco
_Applies to: general_

**Síntoma** — «¿Por qué hay 41 en la cola? ¿No debieron limpiarse?» Eran
reportajes y hallazgos ya digeridos, listados por ser recientes.
**Causa** — La vista mezclaba «lo que espera» con «lo que las máquinas
añadieron hace poco», y para el lector una cola solo significa lo primero.
**Regla** — Una lista llamada cola enseña pendiente/roto, más lo que EL USUARIO
metió hace poco (para ver en qué acabó). Lo que las máquinas ya despacharon no
se disfraza de trabajo por hacer.

### El directorio de fuentes crece por expediente, no por fama (D-024)
_Applies to: LLM, monitoring_

Arquitectura del ciclo, para reutilizar: las menciones que el análisis ya
detectaba (¿a quién cita esta voz como SU fuente?) dejan de tirarse y forman un
grafo de citas; el reportaje anota qué medios entregan texto útil; con umbrales
de independencia (citas de fuentes DISTINTAS, no menciones totales) se forman
expedientes; un comité de modelos que NO analizan vota altas a prueba y
veredictos con el historial de verificación; el material a prueba entra
etiquetado y no corrobora. Los frenos son estructurales: altas por semana
(cuota) y tope por tema (cámara de eco). La persona no aprueba: veta.

## Lo que enseñó el día de los pódcast y los departamentos (2026-08-25)

### El mensaje de error que mentía tapó el fallo durante días
_Applies to: general, monitoring_

**Síntoma** — Un pódcast entero llevaba días sin leerse. El registro decía «la
página devolvió 73 caracteres — probablemente se dibuja con JavaScript».
**Causa** — No era JavaScript. La página abre con un `<article>` decorativo de 73
caracteres y el extractor se quedaba con **el primero** que encontraba; la
transcripción —204.592 caracteres— venía después, en otro bloque.
**Por qué costó tanto** — El diagnóstico era plausible y estaba escrito por el
propio código, así que nadie lo puso en duda. Un mensaje de error que AFIRMA una
causa («se dibuja con JavaScript») en vez de describir el hecho («no encontré
texto») convierte una hipótesis en una conclusión y cierra la investigación.
**Regla** — Los mensajes de error describen lo observado, no lo inferido. Y al
extraer contenido, se prueban todos los candidatos y gana el mayor, nunca el
primero.

### Antes de decir «no existe», haber buscado de verdad
_Applies to: general_

El panel afirmaba «FT publishes no feed» de tres periódicos que sí lo publican:
la lista de rutas tenía seis entradas y sus feeds estaban en la séptima. Dos
lecciones: una lista de rutas conocidas envejece y hay que probarla contra
sitios reales; y el texto debe decir «no encontré» —lo único que se sabe— en vez
de «no existe», que es una afirmación sobre el mundo.

### Dos señales independientes, o no se funde nada
_Applies to: LLM, general_

Al agrupar temas duplicados, el solapamiento de material solo daba dos
resultados: con umbral bajo fundía cosas distintas que se hablan a la vez
(«ciberespionaje» dentro de «fricción EE.UU.-Irán»), y con umbral alto no fundía
nada. La salida fue exigir DOS señales que fallan de formas distintas: compartir
la mayoría del material Y una palabra con contenido en la etiqueta. Es la regla
editorial de la casa —coincidir no es corroborar— aplicada a la maquinaria.

### Un ensayo en seco no debe dejar rastro
_Applies to: monitoring, general_

`WEEKLY_DRY` no escribía número pero sí escribía su progreso, así que el panel
mostró media hora una barra al 30 % de un corte que nadie pidió. En un sistema
donde el estado ES la interfaz, el modo de prueba tiene que ser mudo: si no
escribe el trabajo, tampoco escribe su rastro.

### El 429 que no se arregla esperando
_Applies to: LLM_

Una corrida reintentó 26 minutos contra «your account is suspended due to
insufficient balance». Un 429 son dos cosas —«vas muy rápido» y «no tienes
saldo»— y solo la primera se cura esperando. Se distinguen por el cuerpo de la
respuesta; la segunda debe fallar al primer intento y decir qué hacer.

### La misma fuente por dos puertas se lee dos veces
_Applies to: general_

Un pódcast seguido por su distribuidor (Megaphone) y por su web son dos URLs y
una sola fuente: darlas de alta ambas mete cada episodio dos veces en la salida,
con identificadores distintos, y nada lo delata salvo leerlo repetido. Al dar de
alta hay que comparar por NOMBRE, no por URL, y ofrecer sustituir en vez de
duplicar — sin cambiarlo por detrás, que sería dar de alta algo distinto de lo
que se pidió.

### El escaparate no es la fuente
_Applies to: general_

Apple y los distribuidores de audio publican el enclosure y las notas; el sitio
del propio programa publica la transcripción. Medido en el mismo episodio: 3.610
caracteres contra 262.149. Cuando algo se puede seguir por varias superficies,
la que hay que seguir es la que más TEXTO da, y merece la pena resolverla
automáticamente al dar de alta.

## Que una fuente conteste no es que sirva

`https://www.elfinanciero.com.mx/opinion/raymundo-riva-palacio/rss` devuelve
200, con RSS bien formado y cien entradas. No es el feed del columnista: es el
del diario entero. Un descubridor que se conforme con «responde y es RSS» da de
alta «Riva Palacio» y entrega el periódico completo, y nada lo delata salvo leer
lo que llega.

La comprobación que falta es de CONTENIDO, no de forma: se exige que la mayoría
de las entradas lleven la firma o el tramo de ruta que se pidió. Con eso, el que
sirve resulta ser otro —`/arc/outboundfeeds/rss/category/<ruta>/`, el patrón de
Arc, que usan El Financiero y media prensa hispana.

_Applies to:_ cualquier proyecto que descubra feeds, endpoints o superficies por
tanteo de rutas. La respuesta 200 responde «existe», nunca «es lo que buscabas».

## Un trozo de 120 KB no alcanza a leer una sola entrada

El chequeo de feeds descargaba 120 KB y buscaba pares `<item>…</item>`. The
Cognitive Revolution publica el transcript entero: un episodio pasa de 120 KB,
el `</item>` quedaba fuera del trozo y el feed se leía como VACÍO — sin fechas,
sin aviso de silencio, sin muestra que enseñar. El feed más rico del catálogo
era justo el que parecía muerto.

Se corta por el COMIENZO de cada entrada, que no depende de que el cierre entre
en el trozo descargado.

_Applies to:_ todo parseo por límite de bytes. El caso que rompe no es el
documento raro, es el más completo.

## Elegir por el usuario la superficie es decidir el resultado

Un programa vive en cuatro sitios a la vez —web con transcripts, feed de audio,
canal de YouTube, Substack— y no dan lo mismo: el transcript se lee entero y
gratis, el audio hay que escucharlo y se paga. Quedarse con la primera puerta
que conteste y callar las otras tomaba en silencio la decisión más cara del
alta. Se enseñan todas, con la evidencia de cada una, y se marcan las que valgan.

_Applies to:_ cualquier alta que resuelva un identificador a un recurso cuando
hay más de un camino. Enseñar las opciones cuesta unas peticiones; equivocarse
de camino cuesta el contenido.

## Una regla escrita en un solo sitio es una regla que no rige

La edición española debía poner el equivalente inglés de las cifras grandes
—«130 mil millones (130 billion)»— y llevaba semanas escrito. En la skill. Que
es lo que gobierna cuando un humano escribe a mano, no lo que leen los dos
guiones que escriben solos cada semana. Nunca se aplicó, y nadie podía verlo
salvo leyendo el resultado.

Lo mismo con la voz: se puso primero en el guion de la pieza y no en el del
número; luego en la prosa y no en el titular ni en el resumen de portada, que
son lo único que se ve fuera del artículo. Cada vez, la regla parecía puesta.

Cuando un sistema tiene varias superficies que producen lo mismo, una regla se
escribe en TODAS a la vez o no se ha escrito. Y conviene una lista de cuáles
son, porque de memoria siempre falta una.

_Applies to:_ cualquier repo con más de un generador —prompts, plantillas,
guiones— produciendo la misma clase de salida.

## Un prompt es una petición; la garantía es código

«¿Y si creo otro, lo hará bien?» La respuesta honesta era «probablemente», y
probablemente no basta cuando la regla define el producto.

La regla de voz pasó al contrato que ya validaba el slug: si el texto vuelve
rompiéndola, se reintenta UNA vez diciendo exactamente qué rompió, y si insiste
la pieza muere con el motivo escrito donde el humano lo ve. Probado contra texto
real —el que había fallado y el que estaba bien— antes de darlo por bueno.

_Applies to:_ todo lo que un modelo produzca contra un contrato. La comprobación
mecánica cuesta una tarde y convierte «suele obedecer» en «no publica si no».

## El escaparate también es prosa

La pieza pasó el contrato de voz a la primera —veinte marcas, ni una frase
hablando del texto— y salió con «Raymundo Riva Palacio argues that…» en el dek y
en el resumen de portada. El filtro miraba el cuerpo; el dek y la portada no son
cuerpo, y son lo ÚNICO que se ve fuera del artículo: en la portada, en la
tarjeta de compartir, en el buscador.

_Applies to:_ cualquier regla de estilo o de exactitud aplicada al contenido.
Los metadatos —título, resumen, texto alternativo, vista previa— se ven más que
el contenido y suelen quedar fuera del filtro.

## Las vistas previas se cachean por URL, no por contenido

Se rediseñó la tarjeta de compartir, la nueva quedó guardada en la misma
dirección, y al compartir seguía saliendo la vieja. El fichero era el correcto;
lo que no cambiaba era la URL, que es lo único que WhatsApp, X y los demás
miran. Un enlace ya compartido conserva su vista previa vieja en esa
conversación para siempre.

La URL lleva ahora la versión del diseño. Y el `cache-control` estaba mal
escrito —«31536000» sin `max-age=`—, así que además no se cacheaba nada.

_Applies to:_ og:image, miniaturas, cualquier recurso que un tercero cachee.
Versiona la URL o no has publicado nada.

## El dato estaba, y el código lo tiraba

Una columna firmada se publicó como «columna anónima, autor y medio no
identificados». La firma venía en el feed, en `dc:creator`. El lector de feeds
no lo miraba: sacaba el autor del TÍTULO, que sirve para el invitado de un
podcast y para nada más. Toda la prensa entraba sin firma.

Y quien escribía la pieza tampoco recibía la URL ni el nombre de la fuente
seguida, que estaban en la base a un JOIN de distancia. Con eso, «anónima» era
una inferencia razonable sobre datos incompletos.

_Applies to:_ cualquier tubería donde un extremo infiere lo que el otro ya sabía.
Antes de pedirle a un modelo que deduzca algo, comprueba si el dato viaja.

## «Sin clasificar» no es una categoría

El panel agrupaba por sector y ponía en «Other» lo que aún no tenía ninguno. Seis
temas de México aparecieron ahí, y la lectura natural fue que el clasificador se
equivocaba. No se equivocaba: no había llegado a ellos —corría cada cuatro horas
y el radar crea temas a todas horas—.

Juntar «ninguno» con «desconocido» convierte una espera en un error aparente, y
manda a investigar donde no hay nada roto.

_Applies to:_ cualquier interfaz que agrupe por un campo que se rellena tarde.

## Cancelar no es gratis

Cancelé una corrida creyendo que era un duplicado de la que acababa de lanzar.
Era la pieza que el usuario había pegado un minuto antes, sobre otro asunto. La
coincidencia de hora bastó para convencerme, y no comprobé el identificador del
elemento, que estaba a una consulta.

_Applies to:_ toda acción destructiva sobre trabajo en curso. La regla barata es
mirar QUÉ se cancela, no cuándo empezó.
