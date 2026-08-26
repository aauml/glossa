-- 0054 · Fijar un tema absorbe a los que ya eran el mismo tema.
--
-- El clasificador crea variantes del mismo asunto: «U.S.-Iran geopolitical
-- friction» y «Security dynamics in the Middle East» caen sobre los mismos
-- episodios. Fijar los dos daría dos secciones alimentadas por el mismo
-- material. Y el número EXCLUYE los temas fundidos sin heredar su material, así
-- que fundir a secas perdería episodios: hay que mudar los enlaces.
--
-- La señal no es el parecido de los nombres —esas dos etiquetas no comparten ni
-- una palabra— sino el SOLAPAMIENTO REAL: qué proporción de los episodios de un
-- tema están también en el otro. Es lo que el propio clasificador hizo, leído
-- del revés.
alter table public.glossa_radar_item_topics
  add column if not exists via_fusion uuid;

comment on column public.glossa_radar_item_topics.via_fusion is
  'Si este enlace lo creo una fusion, de que tema venia. Permite deshacerla exacta: se borran solo los enlaces que la fusion anadio.';

-- Qué se parece a este tema, con la cifra que lo justifica.
create or replace function public.glossa_radar_temas_parecidos(destino uuid, umbral numeric default 0.6)
returns table (topic_id uuid, label text, suyos bigint, comunes bigint, solape numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  with dest as (
    select item_id from public.glossa_radar_item_topics where topic_id = destino
  ),
  otros as (
    select t.id, t.label,
           count(*)                                                        as suyos,
           count(*) filter (where it.item_id in (select item_id from dest)) as comunes
      from public.glossa_radar_topics t
      join public.glossa_radar_item_topics it on it.topic_id = t.id
     where t.id <> destino and t.merged_into is null and not t.fijo
     group by t.id
  )
  select id, label, suyos, comunes,
         round(comunes::numeric / nullif(suyos, 0), 2) as solape
    from otros
   where suyos >= 3 and comunes::numeric / nullif(suyos, 0) >= umbral
   order by comunes desc;
$$;

-- Fundir: el tema fijado absorbe a los suyos y HEREDA su material.
create or replace function public.glossa_radar_fundir_en(destino uuid, umbral numeric default 0.6)
returns table (label text, solape numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  t record;
begin
  for t in select * from public.glossa_radar_temas_parecidos(destino, umbral) loop
    -- El material del absorbido pasa al que sobrevive. `via_fusion` deja dicho
    -- de dónde vino cada enlace, que es lo que permite deshacerlo exacto.
    insert into public.glossa_radar_item_topics (item_id, topic_id, relevance, via_fusion)
    select it.item_id, destino, it.relevance, t.topic_id
      from public.glossa_radar_item_topics it
     where it.topic_id = t.topic_id
    on conflict (item_id, topic_id) do nothing;

    update public.glossa_radar_topics set merged_into = destino where id = t.topic_id;
    label := t.label; solape := t.solape;
    return next;
  end loop;
end;
$$;

-- Deshacer: soltar un tema devuelve a los absorbidos su vida propia.
create or replace function public.glossa_radar_desfundir(destino uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  with vueltos as (
    update public.glossa_radar_topics set merged_into = null
     where merged_into = destino returning id
  )
  delete from public.glossa_radar_item_topics
   where topic_id = destino and via_fusion in (select id from vueltos);
$$;

revoke all on function public.glossa_radar_temas_parecidos(uuid, numeric) from public;
revoke all on function public.glossa_radar_fundir_en(uuid, numeric) from public;
revoke all on function public.glossa_radar_desfundir(uuid) from public;
grant execute on function public.glossa_radar_temas_parecidos(uuid, numeric) to service_role;
grant execute on function public.glossa_radar_fundir_en(uuid, numeric) to service_role;
grant execute on function public.glossa_radar_desfundir(uuid) to service_role;
