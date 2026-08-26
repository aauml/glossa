-- 0058 · El tema dice cuándo nació, para poder marcar lo nuevo.
--
-- El panel no podía distinguir un tema que lleva tres semanas de uno que apareció
-- esta mañana: la lista se veía igual y lo nuevo se perdía entre lo viejo.
drop function if exists public.glossa_radar_temas_propuestos(int);

create or replace function public.glossa_radar_temas_propuestos(dias int default 21)
returns table (
  topic_id uuid, slug text, label text, description text, fijo boolean,
  elementos bigint, canales bigint, semanas bigint, ultimo timestamptz, creado timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select t.id, t.slug, t.label, t.description, t.fijo,
         count(distinct it.item_id)                                   as elementos,
         count(distinct i.source_id)                                  as canales,
         count(distinct date_trunc('week', i.published_at))           as semanas,
         max(i.published_at)                                          as ultimo,
         t.first_seen_at                                              as creado
    from public.glossa_radar_topics t
    join public.glossa_radar_item_topics it on it.topic_id = t.id
    join public.glossa_radar_items i on i.id = it.item_id
   where t.merged_into is null
     and i.published_at > now() - make_interval(days => dias)
     and i.origin <> 'pieza'
   group by t.id
   order by t.fijo desc, count(distinct i.source_id) desc, count(distinct it.item_id) desc;
$$;

revoke all on function public.glossa_radar_temas_propuestos(int) from public;
grant execute on function public.glossa_radar_temas_propuestos(int) to service_role;
