/**
 * El radar. Tres funciones, cada una con su disparador.
 *
 *   descubrir()  — cada mañana. Lee los RSS y encola lo nuevo. Barato.
 *   digerir()    — cada 15 min. Escucha 2 episodios y guarda su resumen.
 *   dossiers()   — a diario. Reconstruye los temas con material nuevo.
 *
 * Se separan porque Apps Script corta a los 6 minutos: escuchar un episodio
 * tarda ~2,5, así que el trabajo pesado va en tandas pequeñas y frecuentes.
 */

// ── 1. Descubrir ──────────────────────────────────────────────────────────
function descubrir() {
  const fuentes = sbSelect('glossa_radar_sources', 'active=eq.true&select=*');
  const corte = new Date(Date.now() - CFG.BACKFILL_DAYS * 864e5);
  let nuevos = 0;

  fuentes.forEach(src => {
    try {
      const items = readSource_(src)
        .filter(i => new Date(i.published_at) >= corte)
        .map(i => {
          const g = splitGuest_(i.title);
          return { source_id: src.id, external_id: i.external_id, url: i.url,
                   title: i.title, author: g.author, published_at: i.published_at };
        });
      if (items.length) nuevos += (sbUpsertIgnore('glossa_radar_items', items) || []).length;
      sbUpdate('glossa_radar_sources', `id=eq.${src.id}`, { last_checked_at: new Date().toISOString() });
    } catch (e) {
      console.error(`fuente ${src.name}: ${e}`);   // una fuente rota no para el resto
    }
  });
  console.log(`descubrir: ${nuevos} episodios nuevos de ${fuentes.length} fuentes`);
}

// ── 2. Digerir ────────────────────────────────────────────────────────────
function digerir() {
  const pend = sbSelect('glossa_radar_items',
    `state=eq.pending&order=published_at.desc&limit=${CFG.ITEMS_PER_RUN}` +
    '&select=*,glossa_radar_sources(kind,name)');
  if (!pend.length) { console.log('digerir: nada pendiente'); return; }

  pend.forEach(item => {
    const kind = item.glossa_radar_sources.kind;
    try {
      sbUpdate('glossa_radar_items', `id=eq.${item.id}`, { state: 'running' });

      const resp = gemini_(CFG.MODEL_DIGEST, {
        contents: [{ parts: [{ text: promptDigest_(item) }, mediaPart_(item, kind)] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
      });
      const digest = geminiJson_(resp);

      if (digest.skip) {
        sbUpdate('glossa_radar_items', `id=eq.${item.id}`,
          { state: 'skipped', digested_at: new Date().toISOString() });
        return;
      }

      sbUpdate('glossa_radar_items', `id=eq.${item.id}`, {
        state: 'digested', digest: digest, lang: digest.lang || null,
        tokens_used: geminiTokens_(resp), digested_at: new Date().toISOString(), error: null,
      });
      asignarTemas_(item.id, digest);
      console.log(`digerido: ${item.title.slice(0, 60)}`);
    } catch (e) {
      // Vuelve a 'pending' si fue capacidad: el episodio no tiene la culpa.
      const capacidad = /high demand|overloaded|429|503/i.test(String(e));
      sbUpdate('glossa_radar_items', `id=eq.${item.id}`,
        { state: capacidad ? 'pending' : 'error', error: String(e).slice(0, 500) });
      console.error(`${item.title.slice(0, 40)}: ${e}`);
    }
  });
}

/** Encaja el material en la lista de temas, que crece sola. */
function asignarTemas_(itemId, digest) {
  const existentes = sbSelect('glossa_radar_topics', 'merged_into=is.null&select=id,slug,label,description');
  const resp = gemini_(CFG.MODEL_DIGEST, {
    contents: [{ parts: [{ text: promptTopics_(digest, existentes) }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
  });
  const r = geminiJson_(resp);
  const porSlug = {}; existentes.forEach(t => porSlug[t.slug] = t.id);
  const enlaces = [];

  (r.new || []).forEach(t => {
    if (porSlug[t.slug]) { enlaces.push({ item_id: itemId, topic_id: porSlug[t.slug], relevance: t.relevance }); return; }
    const creado = sbInsert('glossa_radar_topics',
      [{ slug: t.slug, label: t.label, description: t.description }])[0];
    porSlug[t.slug] = creado.id;
    enlaces.push({ item_id: itemId, topic_id: creado.id, relevance: t.relevance });
  });
  (r.assign || []).forEach(a => {
    if (porSlug[a.slug]) enlaces.push({ item_id: itemId, topic_id: porSlug[a.slug], relevance: a.relevance });
  });

  if (enlaces.length) {
    sbUpsertIgnore('glossa_radar_item_topics', enlaces);
    const ids = [...new Set(enlaces.map(e => e.topic_id))];
    sbUpdate('glossa_radar_topics', `id=in.(${ids.join(',')})`, { last_seen_at: new Date().toISOString() });
  }
}

// ── 3. Dossiers ───────────────────────────────────────────────────────────
function dossiers() {
  const desde = new Date(Date.now() - CFG.DOSSIER_WINDOW_DAYS * 864e5).toISOString();
  const temas = sbSelect('glossa_radar_topics', `merged_into=is.null&last_seen_at=gte.${desde}&select=*`);

  temas.forEach(topic => {
    try {
      const enlaces = sbSelect('glossa_radar_item_topics',
        `topic_id=eq.${topic.id}&select=item_id,relevance`);
      if (enlaces.length < CFG.DOSSIER_MIN_ITEMS) return;

      const items = sbSelect('glossa_radar_items',
        `id=in.(${enlaces.map(e => e.item_id).join(',')})&state=eq.digested` +
        `&published_at=gte.${desde}&select=id,title,author,url,published_at,digest,source_id`);
      if (items.length < CFG.DOSSIER_MIN_ITEMS) return;
      // Con una sola fuente no hay nada que cruzar: sería un resumen, no un dossier.
      const fuentes = new Set(items.map(i => i.source_id));
      if (fuentes.size < CFG.DOSSIER_MIN_SOURCES) return;

      const prev = sbSelect('glossa_radar_dossiers',
        `topic_id=eq.${topic.id}&order=created_at.desc&limit=1&select=id,body,covers_to`)[0];
      // Si no ha entrado material nuevo desde el último, no se rehace.
      if (prev && !items.some(i => i.published_at > prev.covers_to)) return;

      const material = items.map(i => ({
        who: i.author, title: i.title, when: i.published_at.slice(0, 10), ...i.digest,
      }));
      const resp = gemini_(CFG.MODEL_DOSSIER, {
        contents: [{ parts: [{ text: promptDossier_(topic, material, prev && prev.body) }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8192 },
      });

      const fechas = items.map(i => i.published_at).sort();
      sbInsert('glossa_radar_dossiers', [{
        topic_id: topic.id, body: geminiJson_(resp),
        covers_from: fechas[0], covers_to: fechas[fechas.length - 1],
        item_count: items.length, source_count: fuentes.size,
        previous_id: prev ? prev.id : null, tokens_used: geminiTokens_(resp),
      }]);
      console.log(`dossier: ${topic.label} (${items.length} piezas, ${fuentes.size} fuentes)`);
    } catch (e) {
      console.error(`dossier ${topic.label}: ${e}`);
    }
  });
}
