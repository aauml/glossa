# Radar

Lee muchos canales y podcasts para no tener que verlos. Escucha cada episodio,
saca un resumen estructurado, y agrupa los resúmenes **por tema**. La unidad de
salida es el tema, no el canal: se pregunta "¿qué pasó con Irán?" y hay un
dossier al día con lo que dijo cada fuente y dónde chocan.

**No publica nada.** Es material de lectura privado. Una pieza de Glossa nace
cuando Arturo le pone su tesis a un dossier; entonces sigue el camino normal.

## Dónde corre

Apps Script, en la cuenta de Google de Arturo. No usa GitHub Actions: los
workers del repo son para publicar, y meterles un proceso diario sería arriesgar
lo que ya funciona.

| Pieza | Quién | Coste |
|---|---|---|
| Escuchar y resumir | Gemini API, tramo gratuito | $0 |
| Cruzar por tema | Gemini API, tramo gratuito | $0 |
| Guardar | Supabase (`glossa_radar_*`) | ya existía |
| El reloj | Apps Script | $0 |
| Escribir la pieza | Claude en el chat, cuando Arturo la pide | suscripción |

## Los números, medidos

Un episodio de una hora de YouTube:

| Muestreo | Tokens |
|---|---|
| Por defecto (1 fps) | 332.772 — **no cabe** en los 250.000/min del tramo gratuito |
| 0,1 fps (el que se usa) | 126.375 — cabe con margen |
| 0,05 fps | 114.873 — ya no baja: lo que queda es el audio |

Techos: Gemini permite ~500 episodios/día; Apps Script, ~35/día (90 min diarios
de disparadores a ~2,5 min por episodio). **Ese es el límite real: unos 25-35
canales.** Con Diesen solo (11/semana) se usa el 4%.

## Instalar

1. [script.google.com](https://script.google.com) → proyecto nuevo → pega los `.gs` de esta carpeta.
2. Configuración del proyecto → Propiedades del script:
   `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
3. Ejecuta `comprobar()`, luego `anadirFuentes()`, luego `instalar()`.
4. `estado()` cuando quieras ver cómo va. `detener()` lo para todo.

## Añadir fuentes

Una línea en `anadirFuentes()`. YouTube usa el RSS del canal; los podcasts, su
RSS con `<enclosure>` de audio. La prensa escrita entra igual (`kind: 'rss'`) y
es ~60 veces más barata, pero solo con titular y sumario de sus feeds públicos:
**los artículos completos de suscripción no se descargan automáticamente.** Para
esos, se pegan a mano cuando interesen.

## Lo que el radar no hace

- **No guarda transcripciones.** Guarda análisis y citas cortas con su minuto,
  que es lo que hace falta para escribir y para volver a la fuente.
- **No promedia posiciones.** Si las fuentes discrepan, el desacuerdo es el
  hallazgo, no un problema que resolver.
- **No confunde coincidir con corroborar.** Que tres invitados del mismo canal
  digan lo mismo mide alineación, no confirmación. Los dossiers lo marcan
  explícitamente (`independent: false`), porque lo contrario es fabricar
  confianza falsa — justo lo que Glossa dice no hacer.
