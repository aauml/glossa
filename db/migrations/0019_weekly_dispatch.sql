-- 0019 — el botón «Rebuild» del panel dispara el Action.
--
-- Antes llamaba a `glossa-weekly-run`, que escribe con Gemini dentro de una edge
-- function. Eso ya no es lo que queremos: el número lo escribe Kimi desde un
-- GitHub Action, porque tarda unos 16 minutos y aquí el techo son 150 segundos.
-- Si el botón siguiera apuntando a la edge function, rehacer un número lo
-- devolvería al formato viejo sin avisar.
--
-- Mismo patrón que `glossa_publish_dispatch`: el PAT vive en el Vault y sale de
-- ahí sólo dentro de esta función. Nadie más lo ve.

create or replace function public.glossa_weekly_dispatch(semana date default null)
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net', 'extensions'
as $function$
declare
  pat text;
begin
  select decrypted_secret into pat
    from vault.decrypted_secrets where name = 'github_dispatch_pat' limit 1;

  if pat is null then
    raise exception 'glossa_weekly_dispatch: falta github_dispatch_pat en el Vault';
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/aauml/glossa/actions/workflows/glossa-weekly.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || pat,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      -- GitHub rechaza las peticiones sin User-Agent con un 403 que no explica
      -- por qué. No es opcional.
      'User-Agent', 'glossa-weekly-dispatch',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', case when semana is null then '{}'::jsonb
                     else jsonb_build_object('week_end', semana::text) end
    ),
    timeout_milliseconds := 8000
  );
end;
$function$;

revoke all on function public.glossa_weekly_dispatch(date) from public;
grant execute on function public.glossa_weekly_dispatch(date) to postgres, service_role;

comment on function public.glossa_weekly_dispatch(date) is
  'Lanza el workflow que escribe el número semanal. El resultado no vuelve por '
  'aquí: aparece en glossa_radar_weekly cuando el Action termina, ~15 min despues.';
