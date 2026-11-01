-- Una lectura semanal por canal elegido. El radar conserva su número general.
alter table public.glossa_radar_sources
  add column if not exists weekly_gloss_enabled boolean not null default false;

create table if not exists public.glossa_channel_weeklies (
  id uuid primary key default gen_random_uuid(),
  source_key uuid not null, -- identidad estable aunque se quite el canal del radar
  source_id uuid references public.glossa_radar_sources(id) on delete set null,
  source_name text not null,
  week_start date not null,
  week_end date not null,
  state text not null check (state in ('running', 'publicado', 'error')),
  body jsonb,
  items jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  model text,
  estimated_cost_usd numeric(10, 4),
  actual_cost_usd numeric(10, 4),
  error text,
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (source_key, week_start),
  check (state <> 'publicado' or (body is not null and published_at is not null))
);
create index if not exists glossa_channel_weeklies_public_idx
  on public.glossa_channel_weeklies (week_start desc) where state = 'publicado';

alter table public.glossa_channel_weeklies enable row level security;
revoke all on public.glossa_channel_weeklies from anon, authenticated;
grant select on public.glossa_channel_weeklies to anon;
grant all on public.glossa_channel_weeklies to service_role;
create policy glossa_channel_weeklies_public on public.glossa_channel_weeklies
  for select to anon using (state = 'publicado');
create policy glossa_channel_weeklies_service on public.glossa_channel_weeklies
  for all to service_role using (true) with check (true);

comment on table public.glossa_channel_weeklies is
  'Glosas semanales automáticas por canal YouTube elegido; solo las publicadas son visibles por anon.';

notify pgrst, 'reload schema';
