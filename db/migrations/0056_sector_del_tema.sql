-- 0056 · Cada tema, en su sector.
--
-- 196 temas en una sola lista mezclan la guerra de Ucrania con la liga de
-- fútbol americano y la dermatología. Agrupados por sector, el ruido colapsa
-- bajo un encabezado que se ignora de un vistazo y lo que interesa queda junto.
--
-- El sector NO lo elige el clasificador que crea los temas —ese trabaja episodio
-- a episodio y no ve el conjunto—: lo asigna una pasada aparte contra una lista
-- CERRADA. Cerrada a propósito: dejar que un modelo invente categorías produce
-- treinta sectores con un tema cada uno, que es la lista original con más pasos.
alter table public.glossa_radar_topics
  add column if not exists sector text;

comment on column public.glossa_radar_topics.sector is
  'Sector al que pertenece el tema, de una lista cerrada. Lo asigna scripts/sectores_from_supabase.mjs sobre los que aun no lo tienen; sirve para agrupar la lista del panel, no cambia como se clasifica el material.';

create index if not exists glossa_radar_topics_sector on public.glossa_radar_topics (sector);
