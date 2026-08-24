-- 0047 · Pegar una pieza suelta la produce en el momento.
--
-- La 0045 creó `origin='pieza'` y lo dejó en la cola del radar: se digería
-- cuando le tocara y ahí se quedaba. Arturo lo dijo claro: «debería producirla
-- en ese momento, no ponerla en queue, porque no sé cuándo la gestionaría».
--
-- Mismo patrón que glossa_weekly_dispatch: el PAT vive en el Vault y solo sale
-- dentro de esta función. glossa-admin la llama al insertar el elemento; el
-- workflow glossa-pieza.yml hace el resto (digest -> contexto -> Kimi -> MDX ->
-- cola de publicación).

create or replace function public.glossa_pieza_dispatch(item uuid)
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
    raise exception 'glossa_pieza_dispatch: falta github_dispatch_pat en el Vault';
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/aauml/glossa/actions/workflows/glossa-pieza.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || pat,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'glossa-pieza-dispatch',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', jsonb_build_object('item_id', item::text)
    ),
    timeout_milliseconds := 8000
  );
end;
$function$;

revoke all on function public.glossa_pieza_dispatch(uuid) from public;
grant execute on function public.glossa_pieza_dispatch(uuid) to postgres, service_role;

comment on function public.glossa_pieza_dispatch(uuid) is
  'Lanza el workflow que convierte un elemento pegado en una pieza publicada. '
  'El resultado no vuelve por aquí: aparece en glossa_publish_requests y en la '
  'colección cuando el Action termina, ~10-20 min después.';
