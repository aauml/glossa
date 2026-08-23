// glossa-radar-run — el radar: descubre episodios nuevos y los digiere.
//
// Dónde vive el reloj: en la propia base. `pg_cron` llama a esta función con
// `pg_net`, el mismo par que ya dispara los workers de publicación. No hace
// falta Apps Script, ni un cron de Vercel, ni un Worker: el reloj está junto a
// los datos y no hay un cuarto sitio que mantener.
//
// Presupuesto de tiempo: una edge function tiene 150 s de reloj. Cada episodio
// tarda ~26 s medidos, así que se procesan tandas cortas y se para con margen;
// lo que quede sigue en cola para la siguiente pasada.
//
// Nada de aquí se publica. Es material de lectura privado.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS, requireToken } from '../_shared/auth.ts';
import { parsearFeed, partirInvitado, idDeCanal, episodiosYouTube, textoDePagina } from '../_shared/feeds.ts';
import { gemini, geminiJson, geminiTokens, MODELO_DIGEST, VIDEO_FPS } from '../_shared/gemini.ts';
import { promptDigest, promptTemas } from '../_shared/prompts.ts';
import { ajustes, uso, apuntar, cabe } from '../_shared/presupuesto.ts';

const PRESUPUESTO_MS = 120_000;   // de los 150 s disponibles; el resto es margen
const BACKFILL_DIAS  = 7;         // al dar de alta una fuente, no procesar su archivo

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* pg_cron puede llamar sin cuerpo */ }
  const auth = requireToken(req, CORS, b?.token);
  if (!auth.ok) return auth.response;

  const t0 = Date.now();
  const queda = () => PRESUPUESTO_MS - (Date.now() - t0);
  const sb = db();
  const log: Record<string, any> = {};

  // Los topes se leen una vez por pasada. Alcanzar uno no es un error: se salta
  // el trabajo y se dice en el registro. El elemento no tiene la culpa y mañana
  // entrará sin problema, así que nunca se le pone `state='error'`.
  const ajus = await ajustes(sb);
  // Lo que el consejo haya corregido. Vacío = como siempre.
  const calibracion = String(ajus.prompt_calibracion_digest ?? '');
  const gasto = await uso(sb);
  const agotado: string[] = [];

  // ── 0. Rescatar los atascados ───────────────────────────────────────────
  // Una pasada marca 'running' antes de llamar a Gemini. Si la función muere
  // ahí —el reloj de 150 s es un corte duro, no una petición amable— la fila se
  // queda en 'running' para siempre y nadie la vuelve a mirar, porque el bucle
  // solo recoge 'pending'. Pasó de verdad con un episodio, a los 9 minutos de
  // haber empezado. Ninguna pasada legítima dura más de 150 s, así que un
  // `started_at` de hace más de 5 minutos es una pasada muerta.
  //
  // Se mira `started_at`, NO `created_at`: el segundo es cuándo se descubrió el
  // episodio, y usarlo reiniciaría un episodio viejo que se está procesando bien
  // ahora mismo.
  const { data: zombis } = await sb.from('glossa_radar_items')
    .update({ state: 'pending' })
    .eq('state', 'running')
    .lt('started_at', new Date(Date.now() - 5 * 60_000).toISOString())
    .select('id');
  if (zombis?.length) log.rescatados_atascados = zombis.length;

  // ── 1. Descubrir ────────────────────────────────────────────────────────
  // El tope de YouTube frena SOLO a YouTube. Antes envolvía el bucle entero:
  // agotada esa cuota, los podcasts y la prensa —que no gastan ni una unidad—
  // dejaban de sondearse el resto del día, y el único rastro era una línea en
  // una respuesta que no lee nadie.
  const sinYoutube = !cabe(gasto, ajus, 'youtube', 'cap_youtube_dia');
  if (sinYoutube) agotado.push('youtube');
  if (b.skip_discover !== true) {
    const { data: fuentes } = await sb.from('glossa_radar_sources').select('*').eq('active', true);
    const corte = new Date(Date.now() - BACKFILL_DIAS * 864e5);
    let nuevos = 0;
    let erroresFuente: string[] | undefined;
    for (const src of fuentes ?? []) {
      // Un tema o una persona no tienen feed: los sondea `monitores`, no el
      // radar. Aquí siempre acababan en `fetch(null)` — un error silencioso que,
      // con el contador de salud nuevo, habría ido sumando fallos hasta que el
      // vigilante los pausara por una avería que no existe.
      if (!src.feed_url) continue;
      try {
        // YouTube va por su API oficial desde que el RSS dejó de responder;
        // podcasts y prensa siguen por RSS, que en su caso sí funciona.
        let entradas;
        let filtradas: { external_id: string; url: string; title: string; published_at: string; motivo: string }[] = [];
        if (src.kind === 'youtube' && sinYoutube) continue;
        if (src.kind === 'youtube') {
          const canal = idDeCanal(src.feed_url);
          if (!canal) throw new Error('no se reconoce el id del canal en la URL guardada');
          const res = await episodiosYouTube(canal, Deno.env.get('GLOSSA_YOUTUBE_KEY')!);
          entradas = res.entradas;
          filtradas = res.filtrados;
        } else {
          const r = await fetch(src.feed_url, { signal: AbortSignal.timeout(15_000) });
          if (!r.ok) throw new Error(`feed ${r.status}`);
          entradas = parsearFeed(await r.text(), src.kind);
        }
        const filas = entradas
          .filter(e => new Date(e.published_at) >= corte)
          .map(e => ({
            source_id: src.id, origin: 'feed', external_id: e.external_id, url: e.url,
            title: e.title, author: partirInvitado(e.title), published_at: e.published_at,
          }));
        if (filas.length) {
          // Árbitro: `external_id`, con índice único COMPLETO (migración 0010).
          // Con los índices parciales de la 0009 esto devolvía 42P10 y, como el
          // error no se miraba, el descubrimiento fallaba en silencio: "0 nuevos"
          // sin nada que explicara por qué.
          const { data, error } = await sb.from('glossa_radar_items')
            .upsert(filas, { onConflict: 'external_id', ignoreDuplicates: true }).select('id');
          if (error) throw new Error(`upsert: ${error.message}`);
          nuevos += data?.length ?? 0;
        }
        // Lo filtrado se escribe como `skipped` CON SU NOTA. Callarlo dejaría el
        // descubrimiento indistinguible de uno roto, y además cada pasada lo
        // redescubriría y volvería a preguntar por su duración.
        const paraSaltar = filtradas
          .filter(e => new Date(e.published_at) >= corte)
          .map(e => ({
            source_id: src.id, origin: 'feed', external_id: e.external_id, url: e.url,
            title: e.title, author: partirInvitado(e.title), published_at: e.published_at,
            state: 'skipped', error: e.motivo, digested_at: new Date().toISOString(),
          }));
        if (paraSaltar.length) {
          await sb.from('glossa_radar_items')
            .upsert(paraSaltar, { onConflict: 'external_id', ignoreDuplicates: true });
        }
        // Las columnas de salud existen desde la 0022 y el camino de feeds no
        // las tocaba: una fuente rota tardaba CATORCE días en distinguirse de
        // una callada. Con esto, seis horas.
        await sb.from('glossa_radar_sources').update({
          last_checked_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          consecutive_failures: 0,
        }).eq('id', src.id);
        // Dos unidades por canal: la lista de subidas y las duraciones.
        if (src.kind === 'youtube') await apuntar(sb, 'youtube', 2);
      } catch (e) {
        // Una fuente rota no debe parar al resto, pero tampoco desaparecer: se
        // devuelve en la respuesta para que se vea desde el panel.
        (erroresFuente ||= []).push(`${src.name}: ${String(e).slice(0, 120)}`);
        await sb.from('glossa_radar_sources').update({
          last_checked_at: new Date().toISOString(),
          consecutive_failures: Number(src.consecutive_failures ?? 0) + 1,
        }).eq('id', src.id);
      }
    }
    log.descubiertos = nuevos;
    if (erroresFuente?.length) log.fuentes_con_error = erroresFuente;
  }

  // ── 2. Clasificar lo que quedó sin tema ─────────────────────────────────
  // Va ANTES de digerir, y el orden es el arreglo. Al final del bucle, digerir
  // se comía los 120 s enteros y la clasificación no llegaba nunca: cada pasada
  // dejaba un episodio más analizado pero sin tema, invisible para los dossiers.
  // Se veía en los números — los huérfanos subían de 1 a 2 en vez de bajar.
  // Clasificar es texto y cuesta segundos; digerir cuesta casi un minuto. El
  // barato primero.
  const fallos: string[] = [];
  {
    const { data: huerfanos } = await sb.rpc('glossa_radar_sin_temas', { limite: 5 });
    for (const h of huerfanos ?? []) {
      if (queda() < 20_000) break;
      try { await asignarTemas(sb, h.id, h.digest); (log.clasificados ||= []).push(h.id); }
      catch (e) { fallos.push(`temas ${h.id}: ${String(e).slice(0, 80)}`); }
    }
  }

  // ── 3. Digerir ──────────────────────────────────────────────────────────
  // La ventana de la semana PRIMERO, y dentro de ella lo más viejo primero.
  //
  // Antes era «lo más nuevo primero, sin ventana», y el domingo eso invertía
  // las prioridades: lo publicado hoy —que pertenece al número de la semana QUE
  // VIENE— se leía antes que el atraso de la semana que cierra a las 10:00. El
  // guion de la cola, que mide por ventana, veía su contador quieto y concluía
  // «roto» tras pagar seis lecturas de material del número equivocado. La
  // ventana la da `glossa_semana_actual()`: una definición, tres consumidores.
  const CAMPOS = 'id,title,author,url,body_text,origin,source_id,glossa_radar_sources(kind)';
  const { data: ven } = await sb.rpc('glossa_semana_actual');
  const v = ven?.[0];
  let pend: any[] = [];
  if (v) {
    const { data: dentro } = await sb.from('glossa_radar_items')
      .select(CAMPOS).eq('state', 'pending')
      .gte('published_at', v.desde).lt('published_at', v.hasta)
      .order('published_at', { ascending: true }).limit(8);
    pend = dentro ?? [];
  }
  if (pend.length < 8) {
    const { data: resto } = await sb.from('glossa_radar_items')
      .select(CAMPOS).eq('state', 'pending')
      .order('published_at', { ascending: false }).limit(8);
    const ya = new Set(pend.map((x: any) => x.id));
    for (const r of resto ?? []) if (!ya.has(r.id) && pend.length < 8) pend.push(r);
  }

  const hechos: string[] = [];
  const saltados: string[] = [];
  for (const item of pend) {
    // Un episodio tarda ~26 s; si no cabe entero, mejor dejarlo en cola que
    // cortarlo a la mitad y dejar la fila en 'running' para siempre.
    // 35 s para el resumen + 15 s para clasificarlo acto seguido. Si no caben
    // los dos, no se empieza: un episodio sin clasificar es trabajo perdido.
    if (queda() < 50_000) break;
    if (!cabe(gasto, ajus, 'gemini', 'cap_gemini_dia')) {
      if (!agotado.includes('gemini')) agotado.push('gemini');
      break;   // lo pendiente sigue pendiente, que es lo que ya pasa cuando no cabe en el tiempo
    }
    // Si HAY texto, se usa el texto. El origen no decide esto.
    //
    // Antes preguntaba por `origin === 'pegado'`, y al añadir las fuentes por
    // búsqueda quedaron seis elementos con su artículo entero guardado —hasta
    // 85.000 caracteres— a los que se les mandaba la URL a Gemini como si fueran
    // un vídeo. Gemini solo sabe abrir YouTube, así que devolvía «400
    // INVALID_ARGUMENT» y ahí se quedaban. Es el mismo fallo que ya costó el
    // artículo del NYT, cometido otra vez por preguntar por la etiqueta en vez de
    // por el dato.
    // Si no hay texto y NO es YouTube, se baja la página antes de nada. Gemini
    // solo sabe abrir URLs de YouTube: a cualquier otra —el MP3 de un podcast,
    // un artículo— le devuelve «400 INVALID_ARGUMENT». Por eso no se había
    // digerido ni un solo podcast desde que existe el radar: los dos únicos
    // elementos que llegaron murieron los dos con ese 400.
    //
    // La transcripción vive en la página del episodio, no en el feed. Cuando la
    // página no da nada —renderizada por JavaScript— el elemento se SALTA con
    // su motivo, que es distinto de fallar: no hay nada que leer ahí.
    if (!item.body_text && !/(?:youtube\.com|youtu\.be)\//.test(String(item.url))) {
      const texto = await textoDePagina(String(item.url));
      if (texto.length >= 400) {
        item.body_text = texto.slice(0, 200_000);
        await sb.from('glossa_radar_items').update({ body_text: item.body_text }).eq('id', item.id);
      } else {
        await sb.from('glossa_radar_items').update({
          state: 'skipped', digested_at: new Date().toISOString(),
          error: `sin texto: la página del episodio devolvió ${texto.length} caracteres — probablemente se dibuja con JavaScript`,
        }).eq('id', item.id);
        saltados.push(String(item.title).slice(0, 50));
        continue;
      }
    }

    const esTexto = !!item.body_text;
    try {
      // Reclamo CONDICIONAL. El cron dispara cada 15 min y la cola puede estar
      // llamando a la vez: dos pasadas seleccionaban los mismos ocho y ambas
      // pagaban a Gemini por los mismos episodios. Si otro ya lo marcó
      // `running`, este update no devuelve fila y se pasa al siguiente.
      const { data: mio } = await sb.from('glossa_radar_items')
        .update({ state: 'running', started_at: new Date().toISOString() })
        .eq('id', item.id).eq('state', 'pending').select('id');
      if (!mio?.length) continue;

      const parte = esTexto
        ? { text: `CONTENIDO:\n${String(item.body_text).slice(0, 200_000)}` }
        : {
            fileData: { fileUri: item.url },
            // Solo el vídeo se muestrea: el audio de un podcast no tiene fotogramas.
            //
            // Se mira la URL del ELEMENTO, no el `kind` de su fuente. Un enlace de
            // YouTube pegado a mano no tiene fuente —`source_id` es null— así que la
            // unión no devolvía nada, no se fijaba `fps`, y el vídeo entraba a
            // resolución completa: 332.772 tokens medidos contra un tope de 250.000
            // por minuto. Fallaba, se leía como falta de capacidad y volvía a la cola
            // para siempre. Con una sola caja de entrada eso pasa de raro a habitual.
            ...(/(?:youtube\.com|youtu\.be)\//.test(String(item.url)) ? { videoMetadata: { fps: VIDEO_FPS } } : {}),
          };

      const resp = await gemini(MODELO_DIGEST, {
        contents: [{ parts: [{ text: promptDigest(item as any, esTexto, calibracion) }, parte] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
      });
      const digest = geminiJson(resp);
      await apuntar(sb, 'gemini', 1, geminiTokens(resp));
      gasto.gemini = { ...(gasto.gemini ?? { proveedor: 'gemini', hoy: 0, semana: 0, mes: 0, coste_mes: 0 }),
                       hoy: Number(gasto.gemini?.hoy ?? 0) + 1 };

      if (digest.skip) {
        await sb.from('glossa_radar_items').update({ state: 'skipped', digested_at: new Date().toISOString() }).eq('id', item.id);
        continue;
      }
      await sb.from('glossa_radar_items').update({
        state: 'digested', digest, lang: digest.lang ?? null,
        tokens_used: geminiTokens(resp), digested_at: new Date().toISOString(), error: null,
      }).eq('id', item.id);

      // Ya se reservó hueco arriba; y si aun así no llega, la próxima pasada lo
      // recoge en el paso 2, que ahora sí se ejecuta.
      if (queda() > 10_000) await asignarTemas(sb, item.id, digest);
      hechos.push(String(item.title).slice(0, 60));
    } catch (e) {
      // Si fue capacidad del tramo gratuito, vuelve a la cola: el episodio no
      // tiene la culpa y en la siguiente pasada probablemente entre.
      const capacidad = /high demand|overloaded|429|503/i.test(String(e));
      await sb.from('glossa_radar_items')
        .update({ state: capacidad ? 'pending' : 'error', error: String(e).slice(0, 500) }).eq('id', item.id);
      fallos.push(`${String(item.title).slice(0, 40)}: ${String(e).slice(0, 80)}`);
    }
  }

  if (agotado.length) log.presupuesto_agotado = agotado;
  log.digeridos = hechos;
  if (saltados.length) log.sin_texto = saltados;
  if (fallos.length) log.fallos = fallos;
  log.ms = Date.now() - t0;
  return new Response(JSON.stringify(log), { headers: CORS });
});

/** Encaja el material en la lista de temas, que crece sola. */
async function asignarTemas(sb: any, itemId: string, digest: any) {
  const { data: existentes } = await sb.from('glossa_radar_topics')
    .select('id,slug,label,description').is('merged_into', null);

  const resp = await gemini(MODELO_DIGEST, {
    contents: [{ parts: [{ text: promptTemas(digest, existentes ?? []) }] }],
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1024 },
  });
  const r = geminiJson(resp);
  await apuntar(sb, 'gemini', 1, geminiTokens(resp));

  const porSlug: Record<string, string> = {};
  for (const t of existentes ?? []) porSlug[t.slug] = t.id;
  const enlaces: any[] = [];

  for (const t of r.new ?? []) {
    if (!porSlug[t.slug]) {
      const { data, error } = await sb.from('glossa_radar_topics')
        .insert({ slug: t.slug, label: t.label, description: t.description }).select('id').single();
      // Sin esto, un tema que no se puede crear deja el episodio sin clasificar
      // y el rescate lo reintenta en bucle, cada vez, sin decir por qué.
      if (error) throw new Error(`tema ${t.slug}: ${error.message}`);
      if (data) porSlug[t.slug] = data.id;
    }
    if (porSlug[t.slug]) enlaces.push({ item_id: itemId, topic_id: porSlug[t.slug], relevance: t.relevance });
  }
  for (const a of r.assign ?? []) {
    if (porSlug[a.slug]) enlaces.push({ item_id: itemId, topic_id: porSlug[a.slug], relevance: a.relevance });
  }

  if (enlaces.length) {
    await sb.from('glossa_radar_item_topics').upsert(enlaces, { onConflict: 'item_id,topic_id', ignoreDuplicates: true });
    const ids = [...new Set(enlaces.map(e => e.topic_id))];
    await sb.from('glossa_radar_topics').update({ last_seen_at: new Date().toISOString() }).in('id', ids);
  }
}
