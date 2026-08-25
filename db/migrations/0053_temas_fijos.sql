-- 0053 · Los temas que Arturo fija, elegidos de lo que el clasificador ya produjo.
--
-- Escribir un tema a mano no sirve: el texto tecleado no coincide con ninguna
-- etiqueta del clasificador, así que el tema nacería vacío y no atraería nada.
-- Fijando uno de los que YA existen, el material entra desde el primer minuto.
alter table public.glossa_radar_topics
  add column if not exists fijo boolean not null default false,
  add column if not exists fijado_at timestamptz;

comment on column public.glossa_radar_topics.fijo is
  'Tema declarado por Arturo: tiene seccion fija en el numero, aunque una semana no traiga nada (y entonces la seccion lo dice). Elegido de la lista de propuestas, nunca tecleado.';

create index if not exists glossa_radar_topics_fijos on public.glossa_radar_topics (fijo) where fijo;

-- Las propuestas, con la evidencia que permite decidir: cuantos elementos, y
-- sobre todo CUANTOS CANALES distintos — un tema con 74 elementos y 2 canales
-- no es un tema, es un canal. Y cuantas semanas seguidas aparece, que separa
-- un asunto permanente de la noticia de una tarde.
create or replace function public.glossa_radar_temas_propuestos(dias int default 21)
returns table (
  topic_id uuid, slug text, label text, description text, fijo boolean,
  elementos bigint, canales bigint, semanas bigint, ultimo timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select t.id, t.slug, t.label, t.description, t.fijo,
         count(distinct it.item_id)                                   as elementos,
         count(distinct i.source_id)                                  as canales,
         count(distinct date_trunc('week', i.published_at))           as semanas,
         max(i.published_at)                                          as ultimo
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
