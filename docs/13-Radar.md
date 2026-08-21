# 13 · Radar

Lee muchos canales y podcasts para no tener que verlos. Escucha cada episodio,
saca un resumen estructurado y agrupa los resúmenes **por tema**. La unidad de
salida es el tema, no el canal: se pregunta "¿qué pasó con Irán?" y hay material
al día con lo que dijo cada fuente y dónde chocan.

**No publica nada.** Es material de lectura privado. Una pieza de Glossa nace
cuando Arturo le pone su tesis; entonces sigue el camino normal de publicación.

## Dónde vive cada cosa

| Pieza | Dónde | Coste |
|---|---|---|
| El reloj | `pg_cron` en la propia base, cada 15 min | — |
| El trabajo | edge function `glossa-radar-run` | — |
| Escuchar y clasificar | Gemini API, tramo gratuito | $0 |
| Los datos | tablas `glossa_radar_*` | ya existían |
| Poner y quitar fuentes | `glossa-panel.ademas.ai`, tras Cloudflare Access | $0 |

El reloj está en la base a propósito. `pg_cron` y `pg_net` ya estaban instalados
y ya son el par que dispara los workers de publicación; meter Apps Script, un
cron de Vercel o un Worker habría añadido un cuarto runtime con sus propios
secretos y sus propios límites. **Hubo una versión en Apps Script** (retirada el
2026-08-21, recuperable del historial): funcionaba, pero dejó de tener sentido en
cuanto el panel existió.

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
