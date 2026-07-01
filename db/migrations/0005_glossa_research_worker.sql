-- Glossa · migración 0005 — Fase 2: worker de research (Supabase -> GitHub Action)
-- Aplicada a Supabase project phd-kb (wtwuvrtmadnlezkbesqp) el 2026-06-30.
-- El chat encola una solicitud de research; un GitHub Action corre la búsqueda pesada
-- (KB semantic-search + OpenAlex + Tavily-si-hay-clave) y escribe un dossier de vuelta.
-- Mismo patrón que glossa_publish_requests / glossa_publish_dispatch.

create table if not exists public.glossa_research_requests (
  id uuid primary key default gen_random_uuid(),
  seed_id uuid references public.glossa_seeds(id),
  query text not null,                    -- pregunta / tema / tesis a investigar
  track text not null default 'general',  -- general|thesis|ai-policy|finance|geopolitics
  context text,                           -- notas de la conversación (opcional)
  state text not null default 'queued',   -- queued -> running -> done | error
  dossier jsonb,                          -- resultado: fuentes rankeadas con citas
  error text,
  requested_by text not null default 'chat',
  requested_at timestamptz not null default now(),
  done_at timestamptz
);
comment on table public.glossa_research_requests is 'Glossa Fase 2: cola de research desde chat. Un GitHub Action (glossa-research.yml) drena state=queued, corre KB+OpenAlex+Tavily y escribe el dossier de vuelta.';

create index if not exists glossa_research_state_idx on public.glossa_research_requests(state);

alter table public.glossa_research_requests enable row level security;
grant select, insert, update on public.glossa_research_requests to anon, authenticated;
grant all                    on public.glossa_research_requests to service_role;

create policy glossa_res_service_all on public.glossa_research_requests for all    to service_role using (true) with check (true);
create policy glossa_res_anon_insert on public.glossa_research_requests for insert  to anon          with check (true);
create policy glossa_res_anon_select on public.glossa_research_requests for select  to anon          using (true);
create policy glossa_res_anon_update on public.glossa_research_requests for update  to anon          using (true) with check (true);
create policy glossa_res_auth_insert on public.glossa_research_requests for insert  to authenticated with check (true);
create policy glossa_res_auth_select on public.glossa_research_requests for select  to authenticated using (true);
create policy glossa_res_auth_update on public.glossa_research_requests for update  to authenticated using (true) with check (true);

-- Trigger: al encolar (state='queued') dispara repository_dispatch a aauml/glossa (event glossa_research).
create or replace function public.glossa_research_dispatch()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public','vault','net','extensions'
as $function$
declare
  tok text;
begin
  if new.state = 'queued' then
    select decrypted_secret into tok
      from vault.decrypted_secrets
     where name = 'github_dispatch_pat'
     limit 1;

    if tok is not null then
      perform net.http_post(
        url := 'https://api.github.com/repos/aauml/glossa/dispatches',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || tok,
          'Accept', 'application/vnd.github+json',
          'User-Agent', 'supabase-glossa',
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'event_type', 'glossa_research',
          'client_payload', jsonb_build_object('id', new.id::text)
        )
      );
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists glossa_research_dispatch_trg on public.glossa_research_requests;
create trigger glossa_research_dispatch_trg
  after insert on public.glossa_research_requests
  for each row execute function public.glossa_research_dispatch();
