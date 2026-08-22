// glossa-weekly-run — arma el número de la semana.
//
// Reúne lo que el radar acumuló, agrupado por tema, y produce una sección por
// tema: en qué coinciden las voces, dónde se contradicen, qué es nuevo respecto
// al número anterior, y qué no está diciendo nadie.
//
// Queda en BORRADOR. Solo sale solo si el interruptor `auto_publish` del panel
// está encendido, y ese interruptor está pensado para decidirse viendo el primer
// número, no antes.
//
// Las secciones son texto, no vídeo: cada una cuesta segundos, no un minuto. Por
// eso caben varias en el presupuesto de una edge function.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { CORS, requireToken } from '../_shared/auth.ts';
import { gemini, geminiJson, geminiTokens } from '../_shared/gemini.ts';
import { promptSeccion, promptIntro } from '../_shared/prompts.ts';

// El análisis comparativo pide más criterio que transcribir, así que usa el
// mejor modelo del tramo gratuito (20 llamadas/día, suficiente: un número
// semanal gasta una por tema).
const MODELO = 'gemini-3-flash-preview';
const PRESUPUESTO_MS = 120_000;

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

/** Lunes de la semana que contiene una fecha. */
function lunes(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dia = (x.getUTCDay() + 6) % 7;         // 0 = lunes
  x.setUTCDate(x.getUTCDate() - dia);
  return x;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* pg_cron puede llamar sin cuerpo */ }
  const auth = requireToken(req, CORS, b?.token);
  if (!auth.ok) return auth.response;

  const t0 = Date.now();
  const queda = () => PRESUPUESTO_MS - (Date.now() - t0);
  const sb = db();

  // Por defecto, la semana que acaba de cerrarse. `semana` permite rehacer otra.
  const ref = b.semana ? new Date(String(b.semana)) : new Date(Date.now() - 864e5);
  const desde = lunes(ref);
  const hasta = new Date(desde); hasta.setUTCDate(hasta.getUTCDate() + 7);

  const { data: temas, error: eTemas } = await sb.rpc('glossa_radar_temas_semana', {
    desde: desde.toISOString(), hasta: hasta.toISOString(),
  });
  if (eTemas) return new Response(JSON.stringify({ error: eTemas.message }), { status: 500, headers: CORS });
  if (!temas?.length) {
    return new Response(JSON.stringify({
      week_start: desde.toISOString().slice(0, 10),
      vacio: 'ningún tema reunió material suficiente esta semana',
    }), { headers: CORS });
  }

  // El número anterior, para poder decir qué cambió en cada tema.
  const { data: prev } = await sb.from('glossa_radar_weekly')
    .select('id,body').lt('week_start', desde.toISOString().slice(0, 10))
    .order('week_start', { ascending: false }).limit(1).maybeSingle();
  const seccionesPrev: Record<string, unknown> =
    Object.fromEntries(((prev?.body as any)?.sections ?? []).map((s: any) => [s.topic, s]));

  const secciones: any[] = [];
  let tokens = 0;
  const saltados: string[] = [];

  for (const t of temas) {
    // Una sección a medias es peor que una sección de menos.
    if (queda() < 25_000) { saltados.push(t.label); continue; }

    const { data: enlaces } = await sb.from('glossa_radar_item_topics')
      .select('item_id').eq('topic_id', t.topic_id);
    const { data: items } = await sb.from('glossa_radar_items')
      .select('title,author,url,published_at,digest')
      .in('id', (enlaces ?? []).map(e => e.item_id))
      .eq('state', 'digested')
      .gte('published_at', desde.toISOString()).lt('published_at', hasta.toISOString());
    if (!items?.length) continue;

    // Al modelo solo le va el análisis, nunca el texto pegado: ese es material
    // privado y no debe acabar en algo que se publique.
    const material = items.map(i => ({
      who: i.author, when: String(i.published_at).slice(0, 10), ...(i.digest as any),
    }));

    try {
      const resp = await gemini(MODELO, {
        contents: [{ parts: [{ text: promptSeccion(t, material, seccionesPrev[t.label] ?? null) }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
      });
      tokens += geminiTokens(resp);
      secciones.push({
        topic: t.label, topic_id: t.topic_id,
        n_items: t.n_items, n_voces: t.n_voces,
        ...geminiJson(resp),
        items: items.map(i => ({ title: i.title, who: i.author, url: i.url })),
      });
    } catch (e) {
      saltados.push(`${t.label}: ${String(e).slice(0, 70)}`);
    }
  }

  if (!secciones.length) {
    const cuota = saltados.some(x => /429|quota|RESOURCE_EXHAUSTED/i.test(x));
    return new Response(JSON.stringify({
      error: cuota
        ? `Cuota diaria agotada: ${MODELO} da 20 llamadas al día en el tramo gratuito y cada sección gasta una. Vuelve a intentarlo mañana, o rehaz el número menos veces.`
        : 'no se pudo armar ninguna sección',
      saltados,
    }), { status: cuota ? 429 : 500, headers: CORS });
  }

  let intro: any = {};
  let introError: string | undefined;
  if (queda() > 15_000) {
    try {
      const resp = await gemini(MODELO, {
        contents: [{ parts: [{ text: promptIntro(secciones.map(s => ({ tema: s.topic, summary: s.summary }))) }] }],
        // 4096 como las secciones. Con 1024 la respuesta salía cortada a media
        // frase ("Unterminated string in JSON"): el modelo gasta parte del
        // presupuesto en razonar, así que el texto pedido no es la única cuenta.
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
      });
      tokens += geminiTokens(resp);
      intro = geminiJson(resp);
    } catch (e) {
      // El número vale sin entrada —las secciones son lo importante— pero el
      // fallo NO se traga: un `catch` mudo aquí produjo un número sin entrada
      // que parecía correcto, y nadie se enteró hasta mirar el JSON a mano.
      introError = String(e).slice(0, 200);
    }
  } else {
    introError = 'sin presupuesto de tiempo para la entrada';
  }

  const fila = {
    week_start: desde.toISOString().slice(0, 10),
    week_end: new Date(hasta.getTime() - 864e5).toISOString().slice(0, 10),
    body: { ...intro, sections: secciones },
    state: 'borrador',
    item_count: secciones.reduce((n, s) => n + Number(s.n_items || 0), 0),
    topic_count: secciones.length,
    previous_id: prev?.id ?? null,
    tokens_used: tokens,
    generated_at: new Date().toISOString(),
  };

  // Un número por semana: rehacerlo actualiza el mismo en vez de acumular
  // borradores. PERO nunca a peor.
  //
  // Pasó de verdad: al agotarse la cuota diaria del modelo, dos secciones de
  // cinco fallaron y el número de 3 secciones sobrescribió al de 5 que ya
  // estaba bien. Una reconstrucción parcial no debe destruir una completa —
  // "se regeneró correctamente" y "se regeneró entero" no son lo mismo.
  const { data: actual } = await sb.from('glossa_radar_weekly')
    .select('id,topic_count').eq('week_start', fila.week_start).maybeSingle();

  if (actual && actual.topic_count > secciones.length) {
    return new Response(JSON.stringify({
      conservado: true,
      motivo: `el número existente tiene ${actual.topic_count} secciones y esta pasada solo pudo armar ${secciones.length}; se deja el bueno`,
      saltados,
    }), { headers: CORS });
  }

  const { data, error } = await sb.from('glossa_radar_weekly')
    .upsert(fila, { onConflict: 'week_start' }).select('id,week_start,topic_count,item_count').single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: CORS });

  return new Response(JSON.stringify({
    ...data,
    sin_entrada: introError,
    saltados: saltados.length ? saltados : undefined,
    ms: Date.now() - t0,
  }), { headers: CORS });
});
