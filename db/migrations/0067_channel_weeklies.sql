-- Cortes manuales o semanales por canal elegido. El radar conserva su número general.
alter table public.glossa_radar_sources
  add column if not exists weekly_gloss_enabled boolean not null default false;

create table if not exists public.glossa_channel_weeklies (
  id uuid primary key default gen_random_uuid(),
  source_key uuid not null, -- identidad estable aunque se quite el canal del radar
  source_id uuid references public.glossa_radar_sources(id) on delete set null,
  source_name text not null,
  cut_start timestamptz not null,
  cut_end timestamptz not null,
  mode text not null check (mode in ('manual', 'weekly')),
  state text not null check (state in ('queued', 'running', 'publicado', 'error')),
  item_ids jsonb not null default '[]'::jsonb,
  body jsonb,
  items jsonb not null default '[]'::jsonb,
  item_count integer not null default 0,
  model text,
  estimated_cost_usd numeric(10, 4),
  actual_cost_usd numeric(10, 4),
  error text,
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (source_key, cut_start),
  check (cut_start < cut_end),
  check (state <> 'publicado' or (body is not null and published_at is not null))
);
create index if not exists glossa_channel_weeklies_public_idx
  on public.glossa_channel_weeklies (cut_end desc) where state = 'publicado';
create index if not exists glossa_channel_weeklies_source_idx
  on public.glossa_channel_weeklies (source_key, cut_end desc);

alter table public.glossa_channel_weeklies enable row level security;
revoke all on public.glossa_channel_weeklies from anon, authenticated;
grant select on public.glossa_channel_weeklies to anon;
grant all on public.glossa_channel_weeklies to service_role;
create policy glossa_channel_weeklies_public on public.glossa_channel_weeklies
  for select to anon using (state = 'publicado');
create policy glossa_channel_weeklies_service on public.glossa_channel_weeklies
  for all to service_role using (true) with check (true);

comment on table public.glossa_channel_weeklies is
  'Cortes manuales y semanales por canal YouTube; solo los publicados son visibles por anon.';

-- El token de GitHub permanece en Vault. El panel solo puede pedir este workflow
-- con un UUID de corte que ya existe, nunca elegir una URL o workflow arbitrario.
create or replace function public.glossa_channel_cut_dispatch(cut_id uuid)
returns void language plpgsql security definer
set search_path to 'public', 'vault', 'net', 'extensions'
as $$
declare pat text;
begin
  if not exists (select 1 from public.glossa_channel_weeklies
                 where id = cut_id and state = 'queued') then
    raise exception 'corte no encontrado o ya iniciado';
  end if;
  select decrypted_secret into pat from vault.decrypted_secrets
    where name = 'github_dispatch_pat' limit 1;
  if pat is null then raise exception 'falta github_dispatch_pat en Vault'; end if;
  perform net.http_post(
    url := 'https://api.github.com/repos/aauml/glossa/actions/workflows/glossa-channel-weekly.yml/dispatches',
    headers := jsonb_build_object('Authorization', 'Bearer ' || pat,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'glossa-channel-cut', 'Content-Type', 'application/json'),
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('cut_id', cut_id::text)),
    timeout_milliseconds := 8000
  );
end;
$$;
revoke all on function public.glossa_channel_cut_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.glossa_channel_cut_dispatch(uuid) to service_role;

notify pgrst, 'reload schema';
