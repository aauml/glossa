-- 0035 — tres cifras del panel que mentían justo cuando importaban.
--
-- `ritmo` promediaba solo las horas CON actividad: tras un empujón de cola que
-- leyera 55 en una hora y cinco horas de silencio, decía «55/h» — y la línea del
-- corte convertía eso en «~2 h» para una espera real de nueve. La cifra existe
-- para decidir si cortar ya o esperar; ahora divide entre las seis horas fijas,
-- y no cuenta los reportajes (los escribe un guion en bloque, no son lectura).
--
-- `calladas` señalaba a una fuente añadida ayer: un quincenal recién dado de
-- alta contaba como «callada 2 semanas» desde el minuto uno. Es la única cifra
-- de esa pantalla que significa «investiga», y estaba envenenada de fábrica.
--
-- Y la 0033 pisó `buscados`/`sin_nada` — lo que la 0032 existía para exponer:
-- sobre cuántos asuntos se salió a buscar y en cuántos no había nada. Vuelven.
create or replace function public.glossa_radar_estado()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  with s as (select * from public.glossa_semana_actual()),
  ritmo as (
    select (count(*) / 6.0)::numeric(10,1) as por_hora
      from public.glossa_radar_items
     where digested_at > now() - interval '6 hours'
       and state = 'digested' and origin <> 'reportaje'
  )
  select jsonb_build_object(
    'desde',   (select desde from s),
    'hasta',   (select hasta from s),
    'parcial', (select parcial from s),
    'por_leer',  (select count(*) from public.glossa_radar_items i, s
                   where i.state = 'pending'
                     and i.published_at >= s.desde and i.published_at < s.hasta),
    'listos',    (select count(*) from public.glossa_radar_items i, s
                   where i.state = 'digested'
                     and i.published_at >= s.desde and i.published_at < s.hasta),
    'reportaje', (select count(*) from public.glossa_radar_items i, s
                   where i.state = 'digested' and i.origin = 'reportaje'
                     and i.published_at >= s.desde and i.published_at < s.hasta),
    'buscados',  (select count(*) from public.glossa_radar_reportajes r, s
                   where r.week_start >= s.desde::date - 7),
    'sin_nada',  (select count(*) from public.glossa_radar_reportajes r, s
                   where r.week_start >= s.desde::date - 7 and r.entran = 0),
    'ritmo',     (select por_hora from ritmo),
    'fuentes',   (select count(*) from public.glossa_radar_sources where active),
    'calladas',  (select count(*) from public.glossa_radar_sources f
                   where f.active and f.feed_url is not null
                     and f.created_at < now() - interval '14 days'
                     and not exists (select 1 from public.glossa_radar_items i
                                      where i.source_id = f.id
                                        and i.created_at > now() - interval '14 days')),
    'con_error', (select count(*) from public.glossa_radar_items where state = 'error')
  );
$$;

revoke all on function public.glossa_radar_estado() from public, anon, authenticated;
grant execute on function public.glossa_radar_estado() to service_role;

-- La función de la semana, con el search_path fijado como todas sus hermanas.
alter function public.glossa_semana_actual() set search_path to 'public';
