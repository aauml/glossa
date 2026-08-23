-- 0033 — que los números de arriba contesten una pregunta cada uno.
--
-- Los que había no servían para decidir nada:
--
--   «446 picked up this week»  sumaba lo leído, lo que espera y 155 descartados
--                              por duración. Tres cosas distintas en un número.
--   «225 read in total»        desde el principio de los tiempos.
--   «78 topics alive»          todos los temas que han existido — y 75 de los 78
--                              eran de esta semana, así que ni distinguía.
--
-- Los nuevos miran EXACTAMENTE la misma ventana que usará el corte. Si miraran
-- otra, el panel diría una cosa y la revista traería otra, que es peor que no
-- tener números.

-- ── Un corte a mitad de semana no es el número de la semana ──────────────
alter table public.glossa_radar_weekly
  add column if not exists parcial boolean not null default false;

comment on column public.glossa_radar_weekly.parcial is
  'true = corte hecho a mano con la semana todavia abierta. El corte del domingo cierra la semana y sustituye al parcial aunque traiga menos piezas.';

-- ── La ventana, en un solo sitio ─────────────────────────────────────────
-- Réplica exacta de lo que hace `weekly_from_supabase.mjs`: domingo, la semana
-- que acaba de cerrarse; cualquier otro día, de este domingo hasta el final de
-- hoy. Vive aquí para que el panel y el guion no puedan discrepar en silencio.
create or replace function public.glossa_semana_actual()
returns table (desde timestamptz, hasta timestamptz, parcial boolean)
language sql
stable
as $$
  select case when dow = 0 then hoy - interval '7 days' else hoy - (dow || ' days')::interval end,
         case when dow = 0 then hoy else hoy + interval '1 day' end,
         dow <> 0
    from (select date_trunc('day', now() at time zone 'utc') at time zone 'utc' as hoy,
                 extract(dow from now() at time zone 'utc')::int as dow) t;
$$;

create or replace function public.glossa_radar_estado()
returns jsonb
language sql
security definer
set search_path to 'public'
as $$
  with s as (select * from public.glossa_semana_actual()),
  -- El ritmo real de lectura de las últimas seis horas. Es lo que convierte
  -- «83 por leer» en «~8 h», que es la cifra con la que de verdad se decide si
  -- cortar ya o esperar.
  ritmo as (
    select coalesce(round(avg(n)), 0)::int as por_hora
      from (select count(*) as n from public.glossa_radar_items
             where digested_at > now() - interval '6 hours'
             group by date_trunc('hour', digested_at)) x
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
    'ritmo',     (select por_hora from ritmo),
    'fuentes',   (select count(*) from public.glossa_radar_sources where active),
    -- Calladas: activas y sin traer nada en dos semanas. No es un error por sí
    -- solo —hay programas quincenales— pero es lo único de esta pantalla que
    -- puede significar «algo se rompió y nadie lo dijo».
    'calladas',  (select count(*) from public.glossa_radar_sources f
                   where f.active and f.feed_url is not null
                     and not exists (select 1 from public.glossa_radar_items i
                                      where i.source_id = f.id
                                        and i.created_at > now() - interval '14 days')),
    'con_error', (select count(*) from public.glossa_radar_items where state = 'error')
  );
$$;

revoke all on function public.glossa_semana_actual() from public, anon, authenticated;
revoke all on function public.glossa_radar_estado() from public, anon, authenticated;
grant execute on function public.glossa_semana_actual() to service_role;
grant execute on function public.glossa_radar_estado() to service_role;
