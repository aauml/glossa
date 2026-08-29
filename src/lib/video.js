/**
 * La URL de un vídeo, en la forma que Gemini sabe abrir.
 *
 * Gemini acepta un `fileUri` de YouTube, pero rechaza con «400 INVALID_ARGUMENT»
 * el que lleva marca de tiempo — `...&t=3s`—, que es EXACTAMENTE lo que produce
 * el botón de compartir del móvil cuando se comparte «en el minuto actual». Y
 * pegar desde el móvil es el camino normal de este proyecto, no un caso raro.
 *
 * Medido contra la API el 2026-08-29, sobre el mismo vídeo:
 *
 *   m.youtube.com/watch?v=…&t=3s     → 400   ← la que se quedó atascada seis horas
 *   www.youtube.com/watch?v=…&t=3s   → 400
 *   m.youtube.com/watch?v=…          → 200
 *   youtu.be/…?si=…                  → 200   (el `si` del botón Compartir no estorba)
 *
 * Así que el subdominio móvil no era el problema y la marca de tiempo sí. Aun
 * así se normaliza a la forma canónica y no se quita sólo la `t`: eso arregla el
 * caso conocido, y esto arregla la clase — cualquier parámetro que YouTube
 * invente mañana desaparece por construcción.
 *
 * Lo que NO es de YouTube se devuelve tal cual: Gemini sólo sabe abrir YouTube y
 * el resto ya se baja como texto antes de llegar aquí.
 *
 * OJO: hay una copia de esto en `supabase/functions/_shared/feeds.ts`, porque el
 * radar corre en Deno y no puede importar de `src/lib/`. Si cambia una, cambia
 * la otra.
 */
export function uriDeVideo(url) {
  const t = String(url ?? '');
  const m = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(t);
  return m ? `https://www.youtube.com/watch?v=${m[1]}` : t;
}
