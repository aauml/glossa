-- 0020 — un solo sitio para alimentar el sistema.
--
-- El panel tenía tres pestañas y dos formularios de cuatro y cinco campos. Para
-- dar de alta un canal había que saber de antemano de qué tipo era y cómo se
-- llamaba. Ahora hay una caja: se pega un enlace, un texto o un tema, y el
-- servidor decide qué era y lo enseña antes de escribir nada.
--
-- Esta migración solo ensancha lo que bloqueaba eso, y añade las dos consultas
-- que el panel necesita para no hacer N+1.

-- ── Tipos nuevos de fuente ────────────────────────────────────────────────
-- `tema` y `persona` no se sondean por feed sino por búsqueda (paso 3). Se
-- añaden aquí porque la caja ya sabe reconocerlos y tiene que poder guardarlos.
alter table public.glossa_radar_sources drop constraint glossa_radar_sources_kind_check;
alter table public.glossa_radar_sources add constraint glossa_radar_sources_kind_check
  check (kind in ('youtube', 'podcast', 'rss', 'tema', 'persona'));

-- Un tema no tiene feed. La unicidad pasa a un índice parcial: dos temas pueden
-- tener feed_url nulo, pero dos feeds no pueden compartir URL.
alter table public.glossa_radar_sources alter column feed_url drop not null;
alter table public.glossa_radar_sources drop constraint glossa_radar_sources_feed_url_key;
create unique index glossa_radar_sources_feed_uniq
  on public.glossa_radar_sources (feed_url) where feed_url is not null;
-- Y sin feed, lo que identifica a una fuente es su nombre.
create unique index glossa_radar_sources_nombre_uniq
  on public.glossa_radar_sources (lower(name)) where feed_url is null;

-- ── Origen nuevo de elemento ──────────────────────────────────────────────
alter table public.glossa_radar_items drop constraint glossa_radar_items_origin_check;
alter table public.glossa_radar_items add constraint glossa_radar_items_origin_check
  check (origin in ('feed', 'pegado', 'busqueda'));

-- ── Las fuentes, con su cola ──────────────────────────────────────────────
-- `pendientes` es lo que Arturo pidió ver, y no necesita ningún reinicio: es un
-- recuento vivo de lo que falta por procesar, así que baja solo según el radar
-- trabaja. `procesados_7d` es el compañero que hace falta para leerlo — «3 en
-- cola, 11 esta semana» dice que la fuente está viva; «0 y 0» dice que está
-- muerta aunque el último chequeo fuera hace dos horas.
create or replace function public.glossa_radar_fuentes_panel()
returns table (
  id uuid, kind text, name text, feed_url text, active boolean, notes text,
  last_checked_at timestamptz, pendientes bigint, procesados_7d bigint,
  ultimo_item_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select s.id, s.kind, s.name, s.feed_url, s.active, s.notes, s.last_checked_at,
         count(*) filter (where i.state in ('pending', 'running'))                     as pendientes,
         count(*) filter (where i.state = 'digested'
                            and i.digested_at >= now() - interval '7 days')            as procesados_7d,
         max(i.published_at)                                                            as ultimo_item_at
    from public.glossa_radar_sources s
    left join public.glossa_radar_items i on i.source_id = s.id
   group by s.id
   order by s.active desc, s.kind, lower(s.name);
$$;

-- ── El estado, contado en SQL ─────────────────────────────────────────────
-- La operación `status` traía todas las filas de items para contarlas en
-- JavaScript. A 125 por semana da igual; a los dos años no. Se cuenta aquí.
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
                 where published_at >= now() - interval '7 days')
  );
$$;

revoke all on function public.glossa_radar_fuentes_panel() from public;
revoke all on function public.glossa_radar_estado() from public;
grant execute on function public.glossa_radar_fuentes_panel() to service_role;
grant execute on function public.glossa_radar_estado() to service_role;
