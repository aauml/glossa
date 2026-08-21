-- Glossa · migración 0009 — bandeja de entrada y ajustes del radar
--
-- Hasta ahora el radar solo comía de feeds. La bandeja permite pegar a mano un
-- artículo que se está leyendo (NYT, WSJ, lo que sea) para que entre en la misma
-- cola y acabe cruzándose con el resto del material del tema.
--
-- Frontera importante: `body_text` es MATERIAL DE TRABAJO PRIVADO. Son artículos
-- leídos con suscripciones personales; se usan para analizar y citar corto, y no
-- se republican nunca. El número semanal lleva el análisis, no el texto.

-- Un pegado no viene de ninguna fuente.
alter table public.glossa_radar_items alter column source_id drop not null;

alter table public.glossa_radar_items
  add column if not exists origin text not null default 'feed'
    check (origin in ('feed', 'pegado')),
  -- Texto del artículo pegado. Nunca sale publicado.
  add column if not exists body_text text,
  -- Por qué interesa: la nota de Arturo al pegarlo. Es señal editorial, no ruido.
  add column if not exists note text;

-- `external_id` era único por fuente; con source_id nulo esa restricción no
-- distingue los pegados entre sí, así que se sustituye por un índice parcial.
alter table public.glossa_radar_items drop constraint if exists glossa_radar_items_source_id_external_id_key;
create unique index if not exists glossa_radar_items_feed_uniq
  on public.glossa_radar_items (source_id, external_id) where source_id is not null;
create unique index if not exists glossa_radar_items_pegado_uniq
  on public.glossa_radar_items (external_id) where source_id is null;

create index if not exists glossa_radar_items_origin_idx on public.glossa_radar_items (origin, state);

comment on column public.glossa_radar_items.body_text is
  'Texto pegado a mano. PRIVADO: material de trabajo, nunca se republica. Puede venir de una suscripción personal.';

-- Ajustes del radar. Empieza por el interruptor de publicación automática, que
-- se decide viendo el primer número y no antes.
create table if not exists public.glossa_radar_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.glossa_radar_settings is 'Radar: ajustes que Arturo cambia desde el panel. Clave/valor para no migrar por cada interruptor nuevo.';

insert into public.glossa_radar_settings (key, value) values
  ('auto_publish',  'false'::jsonb),
  ('weekly_day',    '"sunday"'::jsonb)
on conflict (key) do nothing;

alter table public.glossa_radar_settings enable row level security;
grant all on public.glossa_radar_settings to service_role;
drop policy if exists glossa_radar_set_service on public.glossa_radar_settings;
create policy glossa_radar_set_service on public.glossa_radar_settings
  for all to service_role using (true) with check (true);
