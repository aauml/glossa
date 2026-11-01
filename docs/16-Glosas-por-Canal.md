# Glosas semanales por canal

Una segunda salida optativa del radar. En **Feed → Following → YouTube**, Arturo
puede pulsar **Cut now** para generar una glosa en ese momento, activar
**Weekly: on** para que se repita cada domingo, o usar ambos. El número general
sigue funcionando independientemente.

Cada corte toma **solo los videos ya analizados de ese canal desde el corte
anterior**. El primero empieza al inicio de la semana de Glossa. La selección
se fija al pulsar el botón, así que un video analizado después entra en el
siguiente corte aunque se publicara antes. El domingo, después de cerrar la
semana de Los Ángeles, `glossa-channel-weekly.yml` toma lo que quede por cortar.
El modelo recibe sus resúmenes estructurados, escribe una lectura en español y
la página pública muestra los enlaces a todos los videos incluidos. Si no hay
videos nuevos analizados, no genera nada. Dos ejecuciones concurrentes que
arrancan en el mismo punto no vuelven a llamar al modelo.

## Costo y compuertas

El panel muestra la **estimación del próximo corte** antes de generarlo. Es una
previsión, no una factura. El workflow vuelve a estimar con el material exacto y aplica
un techo conservador por bytes antes de llamar al modelo. El límite inicial es
**USD 0,75 por corte**, configurable con
`CHANNEL_WEEKLY_MAX_USD` o `cap_glosa_canal_usd`. Registra el costo real que
devuelve la API. El escritor inicial es `gpt-6-luna` con razonamiento `high`;
la tarifa está en
`src/lib/presupuesto.js`.

La publicación se bloquea si el modelo trunca la respuesta, falta estructura,
una sección cita un identificador ajeno al canal o aparecen citas directas que
el digest no puede verificar. También exige que cada video de la semana esté
referenciado al menos una vez. El texto se identifica como generado por IA y
no atribuye una tesis humana a Arturo. Un fallo queda visible en **Articles →
Channel Glossas** y no crea una página pública. Un fallo no se reintenta
automáticamente: una llamada pudo haberse cobrado antes de perder el recibo.
El panel ofrece **Retry** para relanzar ese mismo corte tras avisar que podría
volver a cobrarse. Los cortes posteriores no consumen sus videos.

La elección del modelo proviene de una [prueba comparativa](17-Comparativa-Modelos-Canal.md)
con material real de tres canales. El estimado del panel usa el máximo de salida
configurado, por lo que suele superar el costo real.

## Orden de despliegue

1. Aplicar `db/migrations/0067_channel_weeklies.sql`.
2. Desplegar `glossa-admin` con la nueva operación de activación y estimación.
3. Desplegar el sitio. Ningún canal está marcado de entrada.
4. Activar el workflow y probar **Cut now** con un canal. Después, marcar
   **Weekly: on** en uno o dos canales para el piloto.

La URL del archivo es `/channels/`; cada lectura vive en
`/channels/<source_key>/<cut_id>/`. Si se retira un canal del radar, el
archivo publicado conserva su URL y su lista de videos.
