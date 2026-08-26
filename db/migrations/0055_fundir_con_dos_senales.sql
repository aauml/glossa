drop function if exists public.glossa_radar_temas_parecidos(uuid, numeric);

create or replace function public.glossa_radar_temas_parecidos(destino uuid, umbral numeric default 0.6)
returns table (topic_id uuid, label text, suyos bigint, comunes bigint, solape numeric, palabra text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with vacias as (
    select unnest(array['the','and','for','with','from','global','world','international',
                        'political','politics','policy','strategic','strategy','security',
                        'dynamics','debates','critical','perspectives','conflict','crisis',
                        'crises','markets','market','national','military','foreign','affairs',
                        'discourse','narrative','control','power','regional','domestic']) as w
  ),
  fichas as (
    select t.id,
           array(select w from unnest(
                   regexp_split_to_array(lower(regexp_replace(t.label, '[^a-zA-Z ]', ' ', 'g')), '\s+')) w
                  where length(w) >= 4 and w not in (select w from vacias)) as palabras
      from public.glossa_radar_topics t
  ),
  suyas as (select palabras from fichas where id = destino),
  dest as (select item_id from public.glossa_radar_item_topics where topic_id = destino),
  otros as (
    select t.id, t.label,
           count(*)                                                        as suyos,
           count(*) filter (where it.item_id in (select item_id from dest)) as comunes
      from public.glossa_radar_topics t
      join public.glossa_radar_item_topics it on it.topic_id = t.id
     where t.id <> destino and t.merged_into is null and not t.fijo
     group by t.id
  )
  select o.id, o.label, o.suyos, o.comunes,
         round(o.comunes::numeric / nullif(o.suyos, 0), 2) as solape,
         (select w from unnest(fo.palabras) as w where w = any(sy.palabras) limit 1) as palabra
    from otros o
    join fichas fo on fo.id = o.id
   cross join suyas sy
   where o.suyos >= 3
     and o.comunes::numeric / nullif(o.suyos, 0) >= umbral
     and fo.palabras && sy.palabras
   order by o.comunes desc;
$$;

revoke all on function public.glossa_radar_temas_parecidos(uuid, numeric) from public;
grant execute on function public.glossa_radar_temas_parecidos(uuid, numeric) to service_role;
