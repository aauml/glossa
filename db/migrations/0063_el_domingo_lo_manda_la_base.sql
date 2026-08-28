-- 0063 · El domingo lo manda la base, no el reloj de GitHub.
--
-- Es la 0061 otra vez, para la cadena que de verdad importa. Aquella movió la
-- cola de piezas a pg_cron porque «los cron de GitHub Actions se retrasan y se
-- saltan bajo carga, y son "best effort" por contrato». El número semanal, su
-- traducción, el cotejo, el consejo y el boletín seguían colgando de ese reloj.
--
-- Medido el 2026-08-28, sobre las corridas reales:
--
--   sectores   pedía cada hora   → 13 corridas en 46 h, huecos de 608, 649 y 538 min
--   vigilante  pedía cada 4 h    → huecos de 615, 744 y 790 min desde el 26 por la noche
--   monitores  pedía diaria      → se saltó el 27 y corrió 11 h tarde
--   weekly     pedía dom 07:30   → el 23 arrancó a las 10:15
--
-- La cadena del domingo tiene huecos FIJOS de 45 a 150 minutos entre etapas
-- (cotejo 04:00 → número 07:30 → español 08:45 → consejo 10:00 → boletín 12:30).
-- Con retrasos de diez horas las etapas se cruzan o se pierden, y la que peor
-- se pierde es la traducción: si arranca antes de que el número exista, el guion
-- imprime «No hay ningún número pendiente de traducir» y sale con CÓDIGO 0. Sin
-- edición española, sin alarma, y sin nada en el registro que lo parezca.
--
-- Así que aquí no hay reloj: hay una CONDICIÓN por etapa. Esta función se
-- pregunta cada diez minutos qué le falta al domingo y dispara sólo eso. El
-- orden sigue importando —el cotejo alimenta al número, y el consejo usa la
-- misma cuenta de Kimi que el número, que admite una petición a la vez— pero
-- deja de medirse en minutos de margen y pasa a medirse en hechos consumados.
--
-- Los `schedule:` de los cinco workflows se quedan puestos a propósito: si esto
-- fallara, GitHub sigue siendo la red. Disparar dos veces no duplica nada
-- —cada guion comprueba su propia salida antes de trabajar y los workflows
-- tienen `concurrency`—, y el contador de intentos de aquí abajo impide que un
-- fallo repetido se convierta en un bucle que dispare para siempre.

-- ── Qué le falta al domingo ──────────────────────────────────────────────
create or replace function public.glossa_domingo_empujar()
returns text
language plpgsql
security definer
set search_path to 'public', 'vault', 'net', 'extensions'
as $function$
declare
  v            record;
  num          record;
  semana       date;
  estado       jsonb;
  etapa        text := null;
  wf           text := null;
  espera       interval;
  intentos     int;
  ultimo       timestamptz;
  pat          text;
  cotejo_hecho boolean;
  consejo_hecho boolean;
  boletin_hecho boolean;
begin
  select * into v from public.glossa_semana_actual();

  -- `parcial` es falso SÓLO el domingo: es cuando `glossa_semana_actual()`
  -- devuelve la semana que acaba de cerrarse. El resto de días no hay nada que
  -- empujar y esta función se va sin tocar nada. Una definición, un consumidor
  -- más — la misma que usan el panel, el número, el reportaje y los monitores.
  if v.parcial then return 'no es domingo'; end if;

  semana := (v.desde at time zone 'America/Los_Angeles')::date;

  select value into estado from public.glossa_radar_settings
   where key = 'domingo_estado';
  if estado is null or (estado->>'semana') is distinct from semana::text then
    estado := jsonb_build_object('semana', semana::text);
  end if;

  select * into num from public.glossa_radar_weekly where week_start = semana;

  -- «Hecho» se mide por la SALIDA de cada etapa, no por si el workflow corrió.
  -- Un Action que acaba en verde sin escribir nada no es una etapa hecha.
  cotejo_hecho  := exists (select 1 from public.glossa_radar_cotejos where created_at >= v.hasta);
  consejo_hecho := exists (select 1 from public.glossa_radar_consejo where created_at >= v.hasta);
  boletin_hecho := not exists (
    select 1 from public.glossa_subscribers
     where state = 'confirmado'
       and (last_sent_at is null or last_sent_at < v.hasta));

  -- La primera condición que no se cumple es la etapa que toca. El orden es el
  -- de la cadena y la espera es el tiempo que esa etapa tarda como mucho.
  if not cotejo_hecho then
    etapa := 'cotejo';   wf := 'glossa-cotejo.yml';   espera := interval '30 minutes';
  elsif num.id is null or num.body is null then
    etapa := 'numero';   wf := 'glossa-weekly.yml';   espera := interval '95 minutes';
  elsif num.body_es is null then
    etapa := 'espanol';  wf := 'glossa-traducir.yml'; espera := interval '40 minutes';
  elsif not consejo_hecho then
    etapa := 'consejo';  wf := 'glossa-consejo.yml';  espera := interval '40 minutes';
  elsif num.state = 'publicado' and not boletin_hecho then
    etapa := 'boletin';  wf := 'glossa-boletin.yml';  espera := interval '20 minutes';
  else
    return 'el domingo está completo';
  end if;

  intentos := coalesce((estado #>> array[etapa, 'n'])::int, 0);
  ultimo   := (estado #>> array[etapa, 'ts'])::timestamptz;

  -- Turno vivo: hay una corrida trabajando. Se respeta hasta que caduque; la
  -- espera es la red por si esa corrida murió sin dejar rastro.
  if ultimo is not null and now() < ultimo + espera then
    return format('%s en marcha desde %s', etapa, ultimo);
  end if;

  -- Tres intentos y se para. Sin esto, una etapa que falle siempre dispararía un
  -- Action cada diez minutos hasta el lunes. Lo que queda parado lo ve el
  -- vigilante, que para eso está.
  if intentos >= 3 then
    return format('%s agotó sus 3 intentos; hace falta mano', etapa);
  end if;

  select decrypted_secret into pat
    from vault.decrypted_secrets where name = 'github_dispatch_pat' limit 1;
  if pat is null then
    raise exception 'glossa_domingo_empujar: falta github_dispatch_pat en el Vault';
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/aauml/glossa/actions/workflows/' || wf || '/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || pat,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'glossa-domingo',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main'),
    timeout_milliseconds := 8000
  );

  estado := estado || jsonb_build_object(
    etapa, jsonb_build_object('n', intentos + 1, 'ts', now()));

  insert into public.glossa_radar_settings (key, value, updated_at)
       values ('domingo_estado', estado, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return format('disparado %s (%s), intento %s', etapa, wf, intentos + 1);
end;
$function$;

revoke all on function public.glossa_domingo_empujar() from public, anon, authenticated;
grant execute on function public.glossa_domingo_empujar() to postgres, service_role;

comment on function public.glossa_domingo_empujar() is
  'Conduce la cadena del domingo (cotejo -> numero -> espanol -> consejo -> boletin) '
  'encadenando por CONDICION y no por reloj: cada diez minutos mira que le falta a la '
  'semana cerrada y dispara solo esa etapa. Existe porque el cron de GitHub Actions es '
  'best-effort y se salta corridas bajo carga; los schedule: de los workflows se quedan '
  'como red. Tres intentos por etapa y para.';

-- Cada diez minutos: lo bastante seguido para que una etapa no espere, y lo
-- bastante espaciado para que no haga ruido los otros seis días —los otros seis
-- días sale por el primer `return` sin tocar nada—.
select cron.schedule('glossa-domingo', '*/10 * * * *',
                     'select public.glossa_domingo_empujar()');
