-- 0049 · Una pieza que falla se reintenta sola — y el reintento tiene memoria.
--
-- Lo pedido, literal: «debe asegurarse que se complete y no solo poner el
-- error; debe ser autocorregible». Tres piezas:
--
--   1. `retries` en la cola de publicación: el vigilante reintenta UNA vez por
--      su cuenta; a la segunda el fallo es determinista y reintentar en bucle
--      solo quemaría corridas — ahí queda el error (ya con su motivo real,
--      desde este mismo cambio en glossa-publish.yml) y el botón Retry del
--      panel para cuando el arreglo esté hecho.
--   2. `glossa_publish_relanzar(req)`: relanza el workflow de publicación para
--      una fila concreta. El PAT vive en el Vault, como en los otros dispatch.
--   3. El retry del panel usa las dos según dónde murió: si hay MDX guardado,
--      relanza solo la publicación (gratis); si murió antes, relanza la
--      producción entera (glossa_pieza_dispatch, 0047).

alter table public.glossa_publish_requests
  add column if not exists retries int not null default 0;

comment on column public.glossa_publish_requests.retries is
  'Reintentos ya consumidos. El vigilante reintenta solo cuando retries=0; a '
  'partir de ahí el fallo se considera determinista y espera un arreglo humano.';

create or replace function public.glossa_publish_relanzar(req uuid)
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
    raise exception 'glossa_publish_relanzar: falta github_dispatch_pat en el Vault';
  end if;

  update public.glossa_publish_requests
     set state = 'queued', error = null, done_at = null, retries = retries + 1
   where id = req;

  perform net.http_post(
    url := 'https://api.github.com/repos/aauml/glossa/actions/workflows/glossa-publish.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || pat,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'glossa-publish-retry',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('id', req::text)),
    timeout_milliseconds := 8000
  );
end;
$function$;

revoke all on function public.glossa_publish_relanzar(uuid) from public;
grant execute on function public.glossa_publish_relanzar(uuid) to postgres, service_role;
