/**
 * Radar de Glossa — configuración.
 *
 * Vive en Apps Script (cuenta de Google de Arturo), no en GitHub Actions: los
 * workers del repo son para publicar, y saturarlos con un proceso diario sería
 * arriesgar lo que ya funciona.
 *
 * Los secretos van en Script Properties (Configuración del proyecto →
 * Propiedades del script), nunca en el código:
 *   GEMINI_API_KEY         · AI Studio, tramo gratuito
 *   SUPABASE_URL           · https://wtwuvrtmadnlezkbesqp.supabase.co
 *   SUPABASE_SERVICE_KEY   · campo `secret-key` del item de Supabase en 1Password
 */

const CFG = {
  // Modelos. La etapa 1 (escuchar) es trabajo mecánico y va en el modelo con más
  // cuota diaria; la etapa 2 (cruzar fuentes) pide criterio y va en el mejor
  // disponible en el tramo gratuito. Los Pro están a 0 y no son opción.
  MODEL_DIGEST:  'gemini-3.1-flash-lite',
  MODEL_DOSSIER: 'gemini-3-flash-preview',

  // Un fotograma cada 10 s. Medido: 332.772 tokens por defecto contra 126.375
  // así, y el tope del tramo gratuito son 250.000 por minuto. Por debajo de esto
  // ya no se ahorra: lo que queda es el audio, que es irreducible.
  VIDEO_FPS: 0.1,

  // Apps Script corta a los 6 minutos. Medido: 26 s por episodio (no los 2,5 min
  // que estimé a ojo), y cada uno gasta 2 llamadas —resumen y temas—. Seis por
  // ejecución son ~3 min: deja la mitad del margen por si un episodio se atasca.
  ITEMS_PER_RUN: 6,

  // El tramo gratuito devuelve "high demand" con cierta frecuencia. No es un
  // error del episodio: es capacidad. Se reintenta con espera creciente.
  RETRIES: 3,
  RETRY_BASE_MS: 4000,

  // Un tema necesita material de más de una fuente antes de merecer un dossier;
  // con una sola voz no hay nada que cruzar.
  DOSSIER_MIN_ITEMS: 3,
  DOSSIER_MIN_SOURCES: 2,
  DOSSIER_WINDOW_DAYS: 14,

  // Episodios más viejos que esto no se procesan al dar de alta una fuente,
  // para no gastar la cuota del primer día en el archivo histórico del canal.
  BACKFILL_DAYS: 7,
};

function prop_(name) {
  const v = PropertiesService.getScriptProperties().getProperty(name);
  if (!v) throw new Error(`Falta la propiedad de script: ${name}`);
  return v;
}
