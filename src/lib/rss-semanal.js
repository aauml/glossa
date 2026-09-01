// Los números del semanal, como entradas de RSS. Compartido por los dos feeds.
//
// Se lee con la llave pública, igual que las páginas del semanal: la política
// de la migración 0018 solo deja ver lo publicado. Si falta la configuración o
// la base no contesta, se devuelve vacío y el feed degrada a los artículos del
// repo — un feed más pobre es mejor que un feed caído.

export async function semanalesRss(lang) {
  const URL_SB = import.meta.env.SUPABASE_URL || process.env.SUPABASE_URL;
  const ANON = import.meta.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!URL_SB || !ANON) {
    console.error('[rss] falta SUPABASE_URL o SUPABASE_ANON_KEY: el feed sale sin los semanales');
    return [];
  }
  try {
    const r = await fetch(
      `${URL_SB.replace(/\/$/, '')}/rest/v1/glossa_radar_weekly` +
      `?select=week_start,body,body_es,published_at&state=eq.publicado&order=week_start.desc&limit=200`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) {
      console.error(`[rss] la base respondió ${r.status}: el feed sale sin los semanales`);
      return [];
    }
    const filas = await r.json();
    return filas.map(w => {
      // El español solo si existe la edición española; un número sin traducir
      // no aparece en el feed ES en inglés, que sería anunciar lo que no hay.
      const cuerpo = lang === 'es' ? w.body_es : w.body;
      if (!cuerpo?.headline) return null;
      return {
        title: `${lang === 'es' ? 'Semanal' : 'Weekly'} · ${cuerpo.headline}`,
        description: cuerpo.standfirst ?? '',
        pubDate: new Date(w.published_at ?? `${w.week_start}T12:00:00Z`),
        link: lang === 'es' ? `/es/weekly/${w.week_start}/` : `/weekly/${w.week_start}/`,
      };
    }).filter(Boolean);
  } catch (e) {
    console.error(`[rss] no se pudo leer el semanal (${String(e).slice(0, 80)}): el feed sale sin él`);
    return [];
  }
}
