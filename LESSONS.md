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
