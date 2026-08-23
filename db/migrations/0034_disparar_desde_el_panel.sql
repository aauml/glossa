-- 0034 — un solo disparador para los trabajos que se piden a mano.
--
-- `glossa_weekly_dispatch` hace esto mismo para un workflow concreto. Copiarla
-- por cada trabajo nuevo significa repetir el mismo bloque de cabeceras y el
-- mismo error de GitHub cada vez, así que se generaliza.
--
-- CON LISTA BLANCA. Una función que dispare cualquier workflow por nombre es
-- una función que, si alguna vez llega hasta ella un nombre venido de fuera,
-- lanza lo que le digan. Los tres que se piden a mano se nombran aquí.
create or replace function public.glossa_dispatch(workflow text, entradas jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net', 'extensions'
as $$
declare
  pat text;
begin
  if workflow not in ('glossa-cola.yml', 'glossa-reportaje.yml', 'glossa-cotejo.yml') then
    raise exception 'glossa_dispatch: % no está en la lista', workflow;
  end if;

  select decrypted_secret into pat
    from vault.decrypted_secrets where name = 'github_dispatch_pat' limit 1;
  if pat is null then
    raise exception 'glossa_dispatch: falta github_dispatch_pat en el Vault';
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/aauml/glossa/actions/workflows/' || workflow || '/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || pat,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      -- GitHub rechaza las peticiones sin User-Agent con un 403 que no explica
      -- por qué. No es opcional.
      'User-Agent', 'glossa-dispatch',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main', 'inputs', entradas),
    timeout_milliseconds := 8000
  );
end;
$$;

comment on function public.glossa_dispatch is
  'Lanza uno de los trabajos que se piden a mano desde el panel. Lista blanca a proposito: el nombre del workflow no puede venir de fuera.';

revoke all on function public.glossa_dispatch(text, jsonb) from public, anon, authenticated;
grant execute on function public.glossa_dispatch(text, jsonb) to postgres, service_role;

-- ── Cuánto se lleva por delante un «remove» ──────────────────────────────
-- La clave ajena es ON DELETE CASCADE: quitar una fuente borra TODOS sus
-- episodios y el análisis de cada uno, que es trabajo ya pagado y no vuelve. El
-- aviso decía «Episodes already read go with it» sin decir cuántos, y no es lo
-- mismo perder cero que perder cuarenta y uno.
drop function if exists public.glossa_radar_fuentes_panel();

create function public.glossa_radar_fuentes_panel()
returns table (
  id uuid, kind text, name text, feed_url text, active boolean, notes text,
  last_checked_at timestamptz, pendientes bigint, procesados_7d bigint,
  leidos_total bigint, ultimo_item_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select s.id, s.kind, s.name, s.feed_url, s.active, s.notes, s.last_checked_at,
         count(*) filter (where i.state in ('pending', 'running'))                     as pendientes,
         count(*) filter (where i.state = 'digested'
                            and i.digested_at >= now() - interval '7 days')            as procesados_7d,
         count(*) filter (where i.state = 'digested')                                  as leidos_total,
         max(i.published_at)                                                            as ultimo_item_at
    from public.glossa_radar_sources s
    left join public.glossa_radar_items i on i.source_id = s.id
   group by s.id
   order by s.active desc, s.kind, lower(s.name);
$$;

revoke all on function public.glossa_radar_fuentes_panel() from public, anon, authenticated;
grant execute on function public.glossa_radar_fuentes_panel() to service_role;
