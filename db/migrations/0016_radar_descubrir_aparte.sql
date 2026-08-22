-- 0016 — separar el descubrimiento de la digestión.
--
-- El radar corría entero cada 15 minutos: preguntar a YouTube qué hay nuevo Y
-- analizar lo que hubiera en cola. Las dos mitades tienen ritmos distintos y
-- juntarlas salía caro por un lado y era obligatorio por el otro.
--
-- DIGERIR tiene que ir seguido, y no es una preferencia: una edge function
-- muere a los 150 s y un episodio de vídeo tarda entre 26 y 60 s en analizarse.
-- Caben dos por pasada. Con 42 episodios entrando al día hacen falta al menos
-- 21 pasadas diarias solo para no acumular cola; a dos veces al día, la cola
-- crecería 38 episodios cada día, para siempre.
--
-- DESCUBRIR no gana nada yendo tan seguido. Nadie lee esto en los quince
-- minutos siguientes a que se publique, la ventana de recuperación es de 7 días
-- —así que una pasada fallida no pierde nada— y cada pasada vuelve a examinar y
-- rechazar los mismos ~200 Shorts de la semana. Eso gastaba unas 2.900 unidades
-- diarias de las 10.000 de la API de YouTube sin que nada mejorase.
--
-- Queda: descubrir cada 6 horas, digerir cada 15 minutos. El gasto en YouTube
-- baja a ~150 unidades al día y el ritmo de análisis no se toca.

-- El parámetro es nuevo, así que la versión sin argumentos tiene que irse: si
-- conviven, `glossa_radar_tick()` queda ambigua entre las dos y falla.
drop function if exists public.glossa_radar_tick();

create or replace function public.glossa_radar_tick(descubrir boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public', 'vault', 'net', 'extensions'
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
    -- Por defecto descubre: quien la llame a mano desde el panel espera una
    -- pasada completa. El cron de digestión es el que pide lo contrario.
    body := jsonb_build_object('skip_discover', not descubrir),
    -- pg_net no espera la respuesta; la función corre hasta 150 s por su cuenta.
    timeout_milliseconds := 5000
  );
end;
$function$;

-- Se recrean los permisos: al soltar la función se pierden. Solo postgres (que
-- es quien ejecuta el cron) y service_role.
revoke all on function public.glossa_radar_tick(boolean) from public;
grant execute on function public.glossa_radar_tick(boolean) to postgres, service_role;

-- Digerir: cada 15 minutos, sin volver a preguntar a YouTube.
select cron.schedule('glossa-radar', '*/15 * * * *',
                     'select public.glossa_radar_tick(false)');

-- Descubrir: cuatro veces al día. Con una ventana de 7 días, perder una pasada
-- no pierde ningún episodio.
select cron.schedule('glossa-radar-descubrir', '0 */6 * * *',
                     'select public.glossa_radar_tick(true)');
