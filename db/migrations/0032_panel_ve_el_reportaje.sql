-- 0032 — que se vea en el panel cuánto se salió a buscar.
--
-- `STANDARD-PUBLISHED-OUTPUT`: lo que se produce necesita un lector nombrado, y
-- el lector del reportaje es Arturo en `/admin`. Sin esta cifra, la etapa podría
-- estar buscando cada viernes sin que nada de eso llegara al número y no habría
-- forma de notarlo desde fuera —que es exactamente el fallo que el estándar
-- describe—.
create or replace function public.glossa_radar_estado()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'sources', (select jsonb_build_object(
                  'total', count(*), 'active', count(*) filter (where active))
                  from public.glossa_radar_sources),
    'items',   (select coalesce(jsonb_object_agg(state, n), '{}'::jsonb)
                  from (select state, count(*) as n
                          from public.glossa_radar_items group by state) t),
    'topics',  (select count(*) from public.glossa_radar_topics where merged_into is null),
    'semana',  (select count(*) from public.glossa_radar_items
                 where published_at >= now() - interval '7 days'),
    -- Lo que se salió a buscar esta semana, y sobre cuántos asuntos se buscó
    -- SIN encontrar nada. La segunda cifra no está en `items` por definición:
    -- una ausencia no tiene fila.
    'reportaje', (select count(*) from public.glossa_radar_items
                   where origin = 'reportaje'
                     and published_at >= now() - interval '7 days'),
    'buscados',  (select count(*) from public.glossa_radar_reportajes
                   where created_at >= now() - interval '7 days'),
    'sin_nada',  (select count(*) from public.glossa_radar_reportajes
                   where created_at >= now() - interval '7 days' and entran = 0)
  );
$$;

revoke all on function public.glossa_radar_estado() from public, anon, authenticated;
grant execute on function public.glossa_radar_estado() to service_role;
