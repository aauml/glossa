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
