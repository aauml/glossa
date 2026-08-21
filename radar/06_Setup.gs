/**
 * Instalación y utilidades. Se ejecutan a mano desde el editor de Apps Script.
 *
 * Orden la primera vez:
 *   1. Configuración del proyecto → Propiedades del script: GEMINI_API_KEY,
 *      SUPABASE_URL, SUPABASE_SERVICE_KEY.
 *   2. comprobar()      — verifica que las tres llaves funcionan.
 *   3. anadirFuentes()  — da de alta el canal de Diesen.
 *   4. instalar()       — crea los tres disparadores.
 */

function comprobar() {
  const n = sbSelect('glossa_radar_sources', 'select=id').length;
  console.log(`Supabase OK · ${n} fuentes dadas de alta`);
  const r = gemini_(CFG.MODEL_DIGEST, {
    contents: [{ parts: [{ text: 'Responde solo: ok' }] }],
    generationConfig: { maxOutputTokens: 10 },
  });
  console.log(`Gemini OK · ${CFG.MODEL_DIGEST} responde`);
  return true;
}

function anadirFuentes() {
  const fuentes = [
    { kind: 'youtube', name: 'Glenn Diesen',
      feed_url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCZFCDIHTe9HGxtIuVDpBz7g',
      homepage: 'https://www.youtube.com/@GDiesen1',
      notes: 'Entrevistas largas, ~10/semana, invitados de una misma escuela realista/crítica. ' +
             'Que varios coincidan no es corroboración independiente.' },
    // Añadir aquí: una línea por canal o podcast. Los podcasts usan kind:'podcast'
    // y su RSS con <enclosure> de audio.
  ];
  const r = sbUpsertIgnore('glossa_radar_sources', fuentes);
  console.log(`${(r || []).length} fuentes añadidas (las repetidas se ignoran)`);
}

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('descubrir').timeBased().everyDays(1).atHour(5).create();
  ScriptApp.newTrigger('digerir').timeBased().everyMinutes(15).create();
  ScriptApp.newTrigger('dossiers').timeBased().everyDays(1).atHour(7).create();
  console.log('Disparadores instalados: descubrir 5:00 · digerir cada 15 min · dossiers 7:00');
}

function detener() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log('Disparadores eliminados. Nada seguirá corriendo.');
}

/** Cómo va la cosa. Ejecútalo cuando quieras ver el estado. */
function estado() {
  const items = sbSelect('glossa_radar_items', 'select=state');
  const cuenta = {};
  items.forEach(i => cuenta[i.state] = (cuenta[i.state] || 0) + 1);
  const temas = sbSelect('glossa_radar_topics', 'merged_into=is.null&select=id');
  const dos = sbSelect('glossa_radar_dossiers', 'select=id,topic_id,item_count,created_at&order=created_at.desc&limit=10');
  console.log(`episodios: ${JSON.stringify(cuenta)}`);
  console.log(`temas vivos: ${temas.length} · dossiers: ${dos.length}`);
  dos.forEach(d => console.log(`  ${d.created_at.slice(0, 10)} · ${d.item_count} piezas`));
}

/**
 * Funde dos temas duplicados. El modelo creará "Irán" y "Guerra de Irán" tarde o
 * temprano; esto los une sin perder las asignaciones ya hechas.
 *   fundirTemas('guerra-de-iran', 'iran')   ← el primero se absorbe en el segundo
 */
function fundirTemas(slugOrigen, slugDestino) {
  const [o] = sbSelect('glossa_radar_topics', `slug=eq.${slugOrigen}&select=id`);
  const [d] = sbSelect('glossa_radar_topics', `slug=eq.${slugDestino}&select=id`);
  if (!o || !d) throw new Error('slug no encontrado');
  const enlaces = sbSelect('glossa_radar_item_topics', `topic_id=eq.${o.id}&select=item_id,relevance`);
  if (enlaces.length) {
    sbUpsertIgnore('glossa_radar_item_topics',
      enlaces.map(e => ({ item_id: e.item_id, topic_id: d.id, relevance: e.relevance })));
  }
  sbUpdate('glossa_radar_topics', `id=eq.${o.id}`, { merged_into: d.id });
  console.log(`${slugOrigen} → ${slugDestino} (${enlaces.length} asignaciones movidas)`);
}
