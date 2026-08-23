-- 0029 — contar temas es trabajo de SQL, y el número nunca los había visto.
--
-- Dos arreglos que van juntos porque leen la misma tabla.
--
-- El primero es un fallo silencioso ya escrito en el código. El guion semanal
-- pedía `glossa_radar_item_topics?select=…&limit=5000` SIN filtro de fecha: eso
-- es la tabla global de enlaces, no la de la semana. Mientras cupiera en 5.000
-- filas funcionaba por accidente; al pasarse, el ranking del material empieza a
-- ordenarse con un mapa truncado y produce un número mal armado sin un solo
-- error en el registro. Contar en SQL quita el límite y el accidente.
--
-- El segundo es más raro: al modelo se le pide «merge the raw topics into 4-5
-- pieces» y no se le pasa ni un tema. `glossa_radar_temas_semana` existe desde
-- la 0014 y su único lector es `glossa-weekly-run`, la vía de las ocho casillas
-- que el guion semanal sustituyó. Es decir: la función que dice en qué se agrupó
-- la semana lleva desde entonces contestándole solo a un camino retirado,
-- mientras el número que sí se publica agrupa a ciegas.

-- ── El peso de cada elemento, contado donde se cuenta ─────────────────────
-- Un elemento vale por los temas donde es CENTRAL. Es lo que la clasificación
-- decidió leyendo el contenido, y es mejor señal que la fecha.
create or replace function public.glossa_radar_pesos(desde timestamptz, hasta timestamptz)
returns table (item_id uuid, peso bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select it.item_id,
         sum(case when it.relevance = 'central' then 3 else 1 end)::bigint
    from public.glossa_radar_item_topics it
    join public.glossa_radar_items i on i.id = it.item_id
   where i.published_at >= desde and i.published_at < hasta
   group by it.item_id;
$$;

comment on function public.glossa_radar_pesos is
  'Radar: peso de cada elemento de la ventana, por los temas donde es central. Sustituye a un select con limit 5000 sin filtro de fecha, que se degradaba en silencio al crecer la tabla.';

-- ── En qué se agrupó la semana ────────────────────────────────────────────
-- Superconjunto de la de la 0014: mismas cuatro primeras columnas y el mismo
-- umbral de dos elementos, para que `glossa-weekly-run` siga funcionando. Hay
-- que soltarla y rehacerla porque `create or replace` no puede añadir columnas.
--
-- `n_voces` se conserva tal cual —voces distintas, no fuentes—: es la señal que
-- ya sabía que un canal de entrevistas con diez invitados no es una sola voz.
--
-- Lo nuevo separa coro de reportaje, y lo separa por `origin`, NO por si hay
-- `source_id`. Se probó al revés y daba cero siempre: un hallazgo de búsqueda sí
-- lleva `source_id` —apunta a la fuente-tema que lo encontró—, así que
-- `source_id is null` no distingue nada. Lo que dice qué es cada cosa es el
-- dato, no la unión.
--
-- El orden es lo que decide a qué temas se sale a buscar, y por eso NO ordena
-- solo por canales: un tema con 0 canales y 5 medios es algo que ningún canal
-- seguido mencionó, y es justo lo que hay que poder ver. Ordenar por canales lo
-- enterraría.
drop function if exists public.glossa_radar_temas_semana(timestamptz, timestamptz);

create function public.glossa_radar_temas_semana(desde timestamptz, hasta timestamptz)
returns table (
  topic_id uuid, label text, n_items bigint, n_voces bigint,
  slug text, description text,
  n_central bigint, n_canales bigint, n_medios bigint, n_dias bigint,
  ultimo timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.label,
         count(distinct i.id)                                          as n_items,
         count(distinct v.voz)                                         as n_voces,
         t.slug, t.description,
         count(distinct i.id) filter (where it.relevance = 'central')  as n_central,
         count(distinct i.source_id) filter (where i.origin = 'feed')  as n_canales,
         count(distinct i.author) filter (where i.origin <> 'feed')    as n_medios,
         count(distinct (i.published_at at time zone 'utc')::date)     as n_dias,
         max(i.published_at)                                           as ultimo
    from public.glossa_radar_topics t
    join public.glossa_radar_item_topics it on it.topic_id = t.id
    join public.glossa_radar_items i on i.id = it.item_id
    left join lateral jsonb_array_elements_text(
           coalesce(i.digest->'speakers', '[]'::jsonb)) as v(voz) on true
   where t.merged_into is null
     and i.state = 'digested'
     and i.published_at >= desde and i.published_at < hasta
   group by t.id
  having count(distinct i.id) >= 2
   order by (count(distinct i.source_id) filter (where i.origin = 'feed') * 2
           + count(distinct i.author) filter (where i.origin <> 'feed')
           + count(distinct i.id) filter (where it.relevance = 'central')) desc,
            count(distinct i.id) desc;
$$;

comment on function public.glossa_radar_temas_semana is
  'Radar: en que se agrupo la semana. Separa canales seguidos de medios de fuera para que un tema que ningun canal toco pueda subir igual. Superconjunto de la version 0014; las cuatro primeras columnas no cambian.';

revoke all on function public.glossa_radar_pesos(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.glossa_radar_temas_semana(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.glossa_radar_pesos(timestamptz, timestamptz) to service_role;
grant execute on function public.glossa_radar_temas_semana(timestamptz, timestamptz) to service_role;
