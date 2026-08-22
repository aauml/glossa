-- 0011 — recuperada de la base el 2026-08-22.
--
-- Esta migración se aplicó en producción pero nunca llegó al repo: el
-- historial saltaba de la 0009 a la 0016, así que el esquema no se podía
-- reconstruir desde aquí. El SQL es el que Supabase guardó al aplicarla.

-- Glossa · migración 0011 — rescate de huérfanos y el reloj del radar

-- Episodios analizados que se quedaron sin clasificar porque el presupuesto de
-- tiempo se agotó justo después de digerirlos. El bucle normal solo mira los que
-- están 'pending', así que sin esto no volverían a tocarse nunca: quedarían
-- analizados pero invisibles para los dossiers, y nada lo delataría.
create or replace function public.glossa_radar_sin_temas(limite int default 3)
  returns table (id uuid, digest jsonb)
  language sql
  security definer
  set search_path to 'public'
as $$
  select i.id, i.digest
  from public.glossa_radar_items i
  where i.state = 'digested'
    and i.digest is not null
    and not exists (select 1 from public.glossa_radar_item_topics it where it.item_id = i.id)
  order by i.published_at desc
  limit limite;
$$;

comment on function public.glossa_radar_sin_temas is
  'Radar: episodios digeridos que quedaron sin tema por agotarse el presupuesto de tiempo. Los rescata la siguiente pasada.';

-- Solo el worker (service_role) la llama; no se expone a anon.
revoke all on function public.glossa_radar_sin_temas(int) from public, anon, authenticated;
grant execute on function public.glossa_radar_sin_temas(int) to service_role;
