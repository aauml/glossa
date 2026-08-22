-- 0012 — recuperada de la base el 2026-08-22.
--
-- Esta migración se aplicó en producción pero nunca llegó al repo: el
-- historial saltaba de la 0009 a la 0016, así que el esquema no se podía
-- reconstruir desde aquí. El SQL es el que Supabase guardó al aplicarla.

-- Glossa · migración 0012 — el reloj del radar vive en la base
--
-- Por qué aquí y no en otro sitio: `pg_cron` y `pg_net` ya estaban instalados y
-- ya son el par que dispara los workers de publicación. Poner el reloj en Apps
-- Script, en un cron de Vercel o en un Worker habría añadido un cuarto runtime
-- que mantener, con sus propios secretos y sus propios límites. Aquí el reloj
-- está junto a los datos.
--
-- Cada 15 minutos. La pasada procesa lo que quepa en su presupuesto de tiempo
-- (~2 episodios) y deja el resto en cola. Cuando no hay nada pendiente no gasta
-- ninguna llamada a Gemini, así que la frecuencia alta no cuesta nada: solo hace
-- que la cola se drene rápido cuando entra material.
--
-- Ojo con la cuota si se añaden muchas fuentes: el tramo gratuito da 500
-- llamadas/día y cada episodio gasta 2 (resumen + temas). Con ~1,6 episodios
-- diarios de un canal se usan 3; con 30 canales habría que espaciar el cron.

create or replace function public.glossa_radar_tick()
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
    raise warning 'glossa_radar_tick: falta glossa_radar_token en el Vault';
    return;
  end if;

  perform net.http_post(
    url := 'https://wtwuvrtmadnlezkbesqp.supabase.co/functions/v1/glossa-radar-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-glossa-token', tok
    ),
    body := '{}'::jsonb,
    -- pg_net no espera la respuesta; la función corre hasta 150 s por su cuenta.
    timeout_milliseconds := 5000
  );
end;
$function$;

comment on function public.glossa_radar_tick is
  'Radar: una pasada. La llama pg_cron cada 15 min. Lee el token del Vault, igual que glossa_publish_dispatch lee github_dispatch_pat.';

revoke all on function public.glossa_radar_tick() from public, anon, authenticated;

-- Reprogramable sin duplicar: si ya existe, se sustituye.
select cron.unschedule('glossa-radar') where exists (
  select 1 from cron.job where jobname = 'glossa-radar');

select cron.schedule('glossa-radar', '*/15 * * * *', 'select public.glossa_radar_tick()');
