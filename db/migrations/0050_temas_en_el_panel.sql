-- 0050 · Cuántos temas lleva el número, y las piezas sueltas fuera de la cuenta.
--
-- El panel decía cuántos elementos hay listos pero no en cuántos ASUNTOS se
-- agrupan, que es la cifra que dice qué tamaño tendrá el número: 55 elementos
-- pueden ser cuatro temas o veintinueve, y eso cambia la decisión de cortar.
--
-- Y de paso una cuenta que había quedado mal desde la 0045: `listos` y
-- `por_leer` contaban también las piezas sueltas (origin='pieza'), que el
-- número nunca lee. La cifra prometía material que no iba a entrar.
create or replace function public.glossa_radar_estado()
returns jsonb
language sql
security definer
set search_path to 'public'
as $function$
  with s as (select * from public.glossa_semana_en_curso()),
  ritmo as (
    select (count(*) / 6.0)::numeric(10,1) as por_hora
      from public.glossa_radar_items
     where digested_at > now() - interval '6 hours'
       and state = 'digested' and origin <> 'reportaje'
  )
  select jsonb_build_object(
    'desde',   (select desde from s),
    'hasta',   (select hasta from s),
    'por_leer',  (select count(*) from public.glossa_radar_items i, s
                   where i.state = 'pending' and i.origin <> 'pieza'
                     and i.published_at >= s.desde and i.published_at < s.hasta),
    'listos',    (select count(*) from public.glossa_radar_items i, s
                   where i.state = 'digested' and i.origin <> 'pieza'
                     and i.published_at >= s.desde and i.published_at < s.hasta),
    -- En cuántos asuntos se agrupa lo que ya está leído: son las secciones que
    -- tendría el número si se cortara ahora.
    'temas',     (select count(distinct t.topic_id)
                    from public.glossa_radar_item_topics t
                    join public.glossa_radar_items i on i.id = t.item_id, s
                   where i.state = 'digested' and i.origin <> 'pieza'
                     and i.published_at >= s.desde and i.published_at < s.hasta),
    'reportaje', (select count(*) from public.glossa_radar_items i, s
                   where i.state = 'digested' and i.origin = 'reportaje'
                     and i.published_at >= s.desde and i.published_at < s.hasta),
    'rezagados', (select count(*) from public.glossa_radar_items i, s
                   where i.state = 'digested' and i.entregado_en is null
                     and i.origin <> 'pieza'
                     and i.published_at < s.desde
                     and i.published_at >= s.desde - interval '21 days'),
    'ultimo', (select jsonb_build_object(
                 'semana', w.week_start, 'estado', w.state,
                 'titular', w.body->>'headline',
                 'espanol', w.body_es is not null,
                 'fusible_ok', coalesce((w.fuse->>'ok')::boolean, false))
                 from public.glossa_radar_weekly w
                where not w.parcial order by w.week_start desc limit 1),
    'buscados',  (select count(*) from public.glossa_radar_reportajes r, s
                   where r.week_start >= (s.desde at time zone 'America/Los_Angeles')::date),
    'sin_nada',  (select count(*) from public.glossa_radar_reportajes r, s
                   where r.week_start >= (s.desde at time zone 'America/Los_Angeles')::date and r.entran = 0),
    'ritmo',     (select por_hora from ritmo),
    'fuentes',   (select count(*) from public.glossa_radar_sources where active),
    'calladas',  (select count(*) from public.glossa_radar_sources f
                   where f.active and f.feed_url is not null
                     and f.created_at < now() - interval '14 days'
                     and not exists (select 1 from public.glossa_radar_items i
                                      where i.source_id = f.id
                                        and i.created_at > now() - interval '14 days')),
    'con_error', (select count(*) from public.glossa_radar_items
                   where state = 'error' and origin <> 'pieza')
  );
$function$;

revoke all on function public.glossa_radar_estado() from public, anon, authenticated;
grant execute on function public.glossa_radar_estado() to service_role;
