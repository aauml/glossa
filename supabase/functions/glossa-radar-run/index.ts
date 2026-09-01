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
import { parsearFeed, partirInvitado, idDeCanal, episodiosYouTube, textoDePagina, buscarEnYouTube, cribarPorSeccion, uriDeVideo } from '../_shared/feeds.ts';
import type { Filtrado } from '../_shared/feeds.ts';
import { gemini, geminiJson, geminiTokens, MODELO_DIGEST, VIDEO_FPS } from '../_shared/gemini.ts';
import { promptDigest, promptTemas } from '../_shared/prompts.ts';
import { ajustes, uso, apuntar, cabe } from '../_shared/presupuesto.ts';

const PRESUPUESTO_MS = 120_000;   // de los 150 s disponibles; el resto es margen
const BACKFILL_DIAS  = 7;         // al dar de alta una fuente, no procesar su archivo

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!  /* SB_SECRET_KEY: lo fija legacy-keys-retire.yml antes de revocar la inyectada legacy (plan de rotación 2026-08-23) */);

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
  // La copia local del contador tiene que contar TODO lo que gasta la pasada:
  // solo sumaba el digest, y `asignarTemas` —que también paga una llamada— no
  // tocaba `gasto`, así que el tope se medía contra un número corto.
  const gastaGeminiLocal = () => {
    gasto.gemini = { ...(gasto.gemini ?? { proveedor: 'gemini', hoy: 0, semana: 0, mes: 0, coste_mes: 0 }),
                     hoy: Number(gasto.gemini?.hoy ?? 0) + 1 };
  };
  const claveGemini = () => ajus.cap_gemini_dia_radar ? 'cap_gemini_dia_radar' : 'cap_gemini_dia';

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
        let filtradas: Filtrado[] = [];
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

        // La criba por secciones, para las dos ramas. YouTube ya venía filtrado
        // por duración; esto es lo mismo para la prensa, y lo apartado se une a
        // `filtradas` para que salga por el camino que ya existía: `skipped` con
        // su motivo, no un silencio.
        const criba = cribarPorSeccion(entradas, src);
        entradas = criba.entradas;
        if (criba.filtrados.length) filtradas = [...filtradas, ...criba.filtrados];

        const filas = entradas
          .filter(e => new Date(e.published_at) >= corte)
          .map(e => ({
            source_id: src.id, origin: 'feed', external_id: e.external_id, url: e.url,
            title: e.title, author: e.autor ?? partirInvitado(e.title), published_at: e.published_at,
            // Lo que el feed ya traía escrito. Al digerir, si la página del
            // episodio da algo mejor (una transcripción), lo pisa; si no da
            // nada —Megaphone y sus páginas de JavaScript—, esto evita que el
            // episodio se salte por falta de texto.
            ...(e.texto ? { body_text: e.texto.slice(0, 200_000) } : {}),
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
            title: e.title, author: e.autor ?? partirInvitado(e.title), published_at: e.published_at,
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
      // También esto es Gemini y también respeta el tope: clasificaba hasta
      // cinco huérfanos por pasada SIN mirar presupuesto, así que el gate del
      // digest se saltaba por la puerta de al lado.
      if (!cabe(gasto, ajus, 'gemini', claveGemini())) {
        if (!agotado.includes('gemini')) agotado.push('gemini');
        break;
      }
      try { await asignarTemas(sb, h.id, h.digest); gastaGeminiLocal(); (log.clasificados ||= []).push(h.id); }
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
  // `name` no estaba, y `buscarEnYouTube` lo recibe como `programa`: llegaba
  // vacío en TODAS las llamadas, así que la escalera buscaba con el titular
  // pelado y no podía comprobar de quién era el vídeo que encontraba.
  const CAMPOS = 'id,title,author,url,body_text,origin,source_id,glossa_radar_sources(kind,name)';
  const { data: ven } = await sb.rpc('glossa_semana_actual');
  const v = ven?.[0];
  let pend: any[] = [];
  if (v) {
    // Las piezas sueltas (origin='pieza') no son de este bucle: las digiere su
    // propio workflow al momento de pegarse (0047). Leerlas aquí también sería
    // pagar dos veces el mismo episodio.
    const { data: dentro } = await sb.from('glossa_radar_items')
      .select(CAMPOS).eq('state', 'pending').neq('origin', 'pieza')
      .gte('published_at', v.desde).lt('published_at', v.hasta)
      .order('published_at', { ascending: true }).limit(8);
    pend = dentro ?? [];
  }
  if (pend.length < 8) {
    const { data: resto } = await sb.from('glossa_radar_items')
      .select(CAMPOS).eq('state', 'pending').neq('origin', 'pieza')
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
    // El radar tiene su PROPIO techo, más bajo que el del día, y no es un
    // detalle: el 2026-08-23 se comió la cuota entera —411 de 400— y el
    // reportaje del sábado llegó a las búsquedas sin nada con que digerirlas.
    // Compró veintiocho, gastó cincuenta y seis créditos y no produjo un solo
    // reporte.
    //
    // El radar lee sin parar y las tareas del fin de semana corren una vez: si
    // comparten cuenta, el que corre siempre se la queda siempre. La diferencia
    // entre los dos topes es la reserva de las que corren una vez.
    if (!cabe(gasto, ajus, 'gemini', claveGemini())) {
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
    // Se busca la página incluso teniendo texto del feed: las notas del feed
    // son el suelo y la transcripción de la página es el techo. Solo se cambia
    // si la página trae claramente MÁS.
    if (!/(?:youtube\.com|youtu\.be)\//.test(String(item.url)) &&
        (!item.body_text || String(item.body_text).length < 6000)) {
      const texto = await textoDePagina(String(item.url));
      if (texto.length >= 400 && texto.length > String(item.body_text ?? '').length) {
        item.body_text = texto.slice(0, 200_000);
        await sb.from('glossa_radar_items').update({ body_text: item.body_text }).eq('id', item.id);
      } else if (!item.body_text) {
        // Antes de rendirse: el mismo episodio en YouTube, que Gemini sí sabe
        // escuchar. Es el único camino que queda cuando el programa no publica
        // transcripción, y convierte un episodio saltado en uno leído entero.
        const key = Deno.env.get('GLOSSA_YOUTUBE_KEY');
        const video = (key && cabe(gasto, ajus, 'youtube', 'cap_youtube_dia'))
          ? await buscarEnYouTube(String(item.title), item.glossa_radar_sources?.name ?? '', key)
          : null;
        if (video?.videoId) {
          await apuntar(sb, 'youtube', 100);   // lo que cuesta una búsqueda
          item.url = `https://www.youtube.com/watch?v=${video.videoId}`;
          await sb.from('glossa_radar_items').update({
            url: item.url,
            note: `sin transcripción; se analiza el vídeo hallado en YouTube: «${video.titulo.slice(0, 80)}» (${video.canal})`,
          }).eq('id', item.id);
          (log.hallados_en_youtube ||= []).push(String(item.title).slice(0, 50));
        } else {
          await sb.from('glossa_radar_items').update({
            state: 'skipped', digested_at: new Date().toISOString(),
            error: `sin texto: la página no dio nada y tampoco hay vídeo de este episodio en YouTube`,
          }).eq('id', item.id);
          saltados.push(String(item.title).slice(0, 50));
          continue;
        }
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
            fileData: { fileUri: uriDeVideo(String(item.url)) },
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
      gastaGeminiLocal();

      if (digest.skip) {
        await sb.from('glossa_radar_items').update({ state: 'skipped', digested_at: new Date().toISOString() }).eq('id', item.id);
        continue;
      }
      await sb.from('glossa_radar_items').update({
        state: 'digested', digest, lang: digest.lang ?? null,
        tokens_used: geminiTokens(resp), digested_at: new Date().toISOString(), error: null,
      }).eq('id', item.id);

      // El grafo de citas (0044). Las menciones ya venían en el digest y se
      // tiraban; guardarlas cuesta un insert y es de lo que nacen los candidatos
      // a fuente nueva. Si falla no rompe la pasada: el episodio ya quedó
      // digerido y las menciones de la semana que viene volverán a traerlo.
      const menciones = (digest.mentions ?? [])
        .filter((m: any) => m?.name && String(m.name).trim().length > 2)
        .slice(0, 5)
        .map((m: any) => ({
          item_id: item.id,
          citado: String(m.name).slice(0, 200),
          clave: claveDeNombre(String(m.name)),
          tipo: ['persona', 'medio', 'institucion', 'obra'].includes(m.kind) ? m.kind : 'persona',
          contexto: m.for ? String(m.for).slice(0, 300) : null,
        }))
        .filter((m: any) => m.clave.length > 2);
      if (menciones.length) {
        await sb.from('glossa_radar_menciones')
          .upsert(menciones, { onConflict: 'item_id,clave', ignoreDuplicates: true });
      }

      // Ya se reservó hueco arriba; y si aun así no llega, la próxima pasada lo
      // recoge en el paso 2, que ahora sí se ejecuta.
      if (queda() > 10_000) { await asignarTemas(sb, item.id, digest); gastaGeminiLocal(); }
      hechos.push(String(item.title).slice(0, 60));
    } catch (e) {
      // Tres desenlaces, no dos.
      //
      // Capacidad del tramo gratuito (429, 503): vuelve a la cola. El episodio no
      // tiene la culpa y en la siguiente pasada probablemente entre.
      //
      // Sin acceso (403): el vídeo es privado, de miembros o está restringido por
      // región. Eso NO se arregla reintentando y no es una avería del sistema:
      // se salta con su motivo. Antes se quedaba en `error` para siempre,
      // inflando el contador del panel con algo que nadie podía arreglar.
      const capacidad = /high demand|overloaded|429|503/i.test(String(e));
      const sinAcceso = /403|PERMISSION_DENIED/i.test(String(e));
      await sb.from('glossa_radar_items').update({
        state: capacidad ? 'pending' : sinAcceso ? 'skipped' : 'error',
        error: sinAcceso
          ? 'sin acceso: YouTube no deja analizar este vídeo (restringido, privado o solo para miembros)'
          : String(e).slice(0, 500),
        ...(sinAcceso ? { digested_at: new Date().toISOString() } : {}),
      }).eq('id', item.id);
      fallos.push(`${String(item.title).slice(0, 40)}: ${String(e).slice(0, 80)}`);
    }
  }

  if (agotado.length) log.presupuesto_agotado = agotado;
  log.digeridos = hechos;
  if (saltados.length) log.sin_texto = saltados;
  if (fallos.length) log.fallos = fallos;
  log.ms = Date.now() - t0;

  // La respuesta la recibe pg_net, que NO la lee (0016): este registro se
  // perdía entero — «hoy no se descubrió nada» y «se agotó la cuota» eran
  // invisibles. Desde la 0066 cada pasada deja su resumen en una tabla que
  // leen el vigilante (latido del radar) y el panel. Si el insert falla, la
  // pasada no falla: el registro es memoria, no compuerta.
  try {
    await sb.from('glossa_radar_runs').insert({ resumen: log });
    await sb.from('glossa_radar_runs').delete()
      .lt('ran_at', new Date(Date.now() - 14 * 864e5).toISOString());
  } catch (e) { console.error(`glossa_radar_runs: ${String(e).slice(0, 120)}`); }

  return new Response(JSON.stringify(log), { headers: CORS });
});

/**
 * El nombre, normalizado para agrupar: minúsculas, sin acentos, sin títulos de
 * cortesía ni puntuación. "Prof. Michael Hudson" y "michael hudson" deben caer
 * en la misma clave; la fusión más fina la hace el consejo al leer.
 */
function claveDeNombre(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(prof|dr|mr|mrs|ms|sir|the)\.?\s+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .slice(0, 120);
}

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
