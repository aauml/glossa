-- 0010 — recuperada de la base el 2026-08-22.
--
-- Esta migración se aplicó en producción pero nunca llegó al repo: el
-- historial saltaba de la 0009 a la 0016, así que el esquema no se podía
-- reconstruir desde aquí. El SQL es el que Supabase guardó al aplicarla.

-- Glossa · migración 0010 — un destino de ON CONFLICT que Postgres pueda usar
--
-- La 0009 sustituyó la restricción única (source_id, external_id) por dos índices
-- PARCIALES, para admitir filas pegadas sin fuente. Correcto para la unicidad,
-- roto para el upsert: Postgres no acepta un índice parcial como árbitro de
-- ON CONFLICT, y devuelve 42P10. El descubrimiento fallaba en silencio.
--
-- Se unifica en un único índice completo sobre external_id. Vale porque un
-- external_id ya es único de por sí: un videoId de YouTube, un guid de podcast o
-- una URL no se repiten entre fuentes. Y al no ser parcial, sirve de árbitro
-- tanto para las filas de feed como para las pegadas a mano.

drop index if exists public.glossa_radar_items_feed_uniq;
drop index if exists public.glossa_radar_items_pegado_uniq;

create unique index if not exists glossa_radar_items_external_uniq
  on public.glossa_radar_items (external_id);

comment on index public.glossa_radar_items_external_uniq is
  'Arbitro de ON CONFLICT del radar. NO convertir en parcial: un indice parcial no sirve como destino de ON CONFLICT (42P10) y el descubrimiento falla en silencio.';
