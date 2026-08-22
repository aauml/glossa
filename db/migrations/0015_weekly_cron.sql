-- 0015 — recuperada de la base el 2026-08-22.
--
-- Esta migración se aplicó en producción pero nunca llegó al repo: el
-- historial saltaba de la 0009 a la 0016, así que el esquema no se podía
-- reconstruir desde aquí. El SQL es el que Supabase guardó al aplicarla.

-- Glossa · migración 0015 — el reloj del número semanal
--
-- Lunes a las 08:00 UTC. La semana que cubre es la que acaba de cerrarse, así
-- que se arma cuando ya no puede entrar material nuevo en ella.
--
-- Deja el número en BORRADOR. No sale solo salvo que el interruptor
-- `auto_publish` del panel esté encendido — y ese interruptor está pensado para
-- decidirse viendo el primer número, no antes.

create or replace function public.glossa_weekly_tick()
  returns void
  language plpgsql
  security definer
  set search_path to 'public','vault','net','extensions'
as $function$
declare
  tok text;
begin
  select decrypted_secret into tok
    from vault.decrypted_secrets where name = 'glossa_radar_token' limit 1;

  if tok is null then
    raise warning 'glossa_weekly_tick: falta glossa_radar_token en el Vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://wtwuvrtmadnlezkbesqp.supabase.co/functions/v1/glossa-weekly-run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-glossa-token', tok),
    body := '{}'::jsonb,
    -- pg_net no espera: armar el número tarda ~60 s por su cuenta.
    timeout_milliseconds := 5000
  );
end;
$function$;

comment on function public.glossa_weekly_tick is
  'Radar: arma el numero de la semana que acaba de cerrarse. La llama pg_cron los lunes.';

revoke all on function public.glossa_weekly_tick() from public, anon, authenticated;

select cron.unschedule('glossa-weekly') where exists (
  select 1 from cron.job where jobname = 'glossa-weekly');

select cron.schedule('glossa-weekly', '0 8 * * 1', 'select public.glossa_weekly_tick()');
