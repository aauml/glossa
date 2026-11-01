# Glosas semanales por canal

Una segunda salida optativa del radar. En **Feed → Following → YouTube**, Arturo
puede activar `weekly on` en cada canal. El número general sigue funcionando.

El domingo, después de cerrar la semana de Los Ángeles, el workflow
`glossa-channel-weekly.yml` toma **solo los videos analizados de ese canal**.
El modelo recibe sus resúmenes estructurados, escribe una lectura en español y
la página pública muestra los enlaces a todos los videos incluidos. Si no hay
videos analizados, no genera nada. El mismo canal y semana no se cobran dos
veces aunque haya una ejecución anterior en curso o fallida.

## Costo y compuertas

El panel muestra la **estimación** de los últimos siete días al activar y
mientras el canal está seleccionado. Es una previsión, no una factura. El
workflow vuelve a estimar con el material exacto de la semana cerrada y aplica
un techo conservador por bytes antes de llamar al modelo. El límite inicial es
**USD 0,75 por canal y semana**, configurable con
`CHANNEL_WEEKLY_MAX_USD` o `cap_glosa_canal_usd`. Registra el costo real que
devuelve la API. El escritor inicial es `deepseek-v4-pro`; la tarifa está en
`src/lib/presupuesto.js`.

La publicación se bloquea si el modelo trunca la respuesta, falta estructura,
una sección cita un identificador ajeno al canal o aparecen citas directas que
el digest no puede verificar. El texto se identifica como generado por IA y
no atribuye una tesis humana a Arturo. Un fallo queda visible en **Articles →
Channel Glossas** y no crea una página pública. Un fallo no se reintenta
automáticamente: una llamada pudo haberse cobrado antes de perder el recibo.

## Orden de despliegue

1. Aplicar `db/migrations/0067_channel_weeklies.sql`.
2. Desplegar `glossa-admin` con la nueva operación de activación y estimación.
3. Desplegar el sitio. Ningún canal está marcado de entrada.
4. Activar el workflow y marcar uno o dos canales desde el panel para el piloto.

La URL del archivo es `/channels/`; cada lectura vive en
`/channels/<source_key>/<week_start>/`. Si se retira un canal del radar, el
archivo publicado conserva su URL y su lista de videos.
