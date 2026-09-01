-- 0066 · El domingo no se atasca y el radar deja rastro.
--
-- Tres arreglos de la auditoría del 2026-08-31, todos de la familia «falla en
-- silencio»:
--
-- 1. LA CONDICIÓN DEL COTEJO ERA INALCANZABLE POR SU PROPIO CRON. `cotejo_hecho`
--    exigía `created_at >= v.hasta` (domingo 00:00 LA), pero el cotejo corre el
--    SÁBADO a las 21:00 LA — dentro de la semana, antes del cierre. Un cotejo
--    que corrió bien y a su hora no satisfacía nunca la condición, así que el
--    conductor lo relanzaba OTRA VEZ cada domingo: doble gasto de Tavily y
--    media hora de espera, todas las semanas, sin un solo error. Ahora un
--    cotejo del último día de la semana cuenta como hecho.
--
-- 2. UNA ETAPA AGOTADA PARABA LA CADENA SIN DECIRLO. Cotejo, consejo y boletín
--    pueden terminar en verde con CERO filas (sin material, muestra corta, sin
--    suscriptores nuevos): la condición nunca se cumplía, los 3 intentos se
--    gastaban, y la cadena entera se quedaba en «hace falta mano» — sin
--    incidencia, con el consejo y el boletín sin disparar. Ahora una etapa
--    LATERAL que agota sus intentos deja incidencia y se salta, y la cadena
--    sigue; el número y el español —sin los que no hay nada que seguir— paran
--    la cadena como antes, pero dejando incidencia.
--
-- 3. EL REGISTRO DEL RADAR SE TIRABA. `glossa-radar-run` devuelve su resumen
--    (descubiertos, fallos, presupuesto agotado) por HTTP a pg_net, que no lee
--    la respuesta (0016). Nadie lo persistía: «hoy no se descubrió nada» era
--    invisible. La tabla nueva guarda cada pasada; el vigilante la usa como
--    LATIDO (un silencio de horas = pg_cron muerto o token caducado, que hoy
--    solo se nota cuando la cola lleva día y medio creciendo) y el panel puede
--    enseñarla.
--
-- Los topes de Gemini (0021/0043) NO se tocan: los valores vivos ya se
-- corrigieron desde el panel (radar 380 < día 470) y pisarlos desharía esa
-- corrección. El vigilante avisa si la reserva vuelve a invertirse.

-- ── 3. El rastro del radar ───────────────────────────────────────────────
create table if not exists public.glossa_radar_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  resumen jsonb not null
);
create index if not exists glossa_radar_runs_ran_at on public.glossa_radar_runs (ran_at desc);

alter table public.glossa_radar_runs enable row level security;
grant all on public.glossa_radar_runs to service_role;
create policy glossa_radar_runs_service on public.glossa_radar_runs
  for all to service_role using (true) with check (true);

comment on table public.glossa_radar_runs is
  'El resumen de cada pasada de glossa-radar-run. Lo escribe la propia función '
  '(la respuesta HTTP la recibe pg_net, que no la lee); lo leen el vigilante '
  '(latido del radar) y el panel. La función borra lo de más de 14 días.';

-- ── 1 y 2. El conductor del domingo ──────────────────────────────────────
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
  -- empujar y esta función se va sin tocar nada.
  if v.parcial then return 'no es domingo'; end if;

  semana := (v.desde at time zone 'America/Los_Angeles')::date;

  select value into estado from public.glossa_radar_settings
   where key = 'domingo_estado';
  if estado is null or (estado->>'semana') is distinct from semana::text then
    estado := jsonb_build_object('semana', semana::text);
  end if;

  select * into num from public.glossa_radar_weekly where week_start = semana;

  -- «Hecho» se mide por la SALIDA de cada etapa, no por si el workflow corrió.
  -- El cotejo corre el SÁBADO por la noche —dentro de la semana— así que su
  -- salida del último día cuenta: exigir `>= v.hasta` lo relanzaba cada
  -- domingo aunque hubiera corrido bien (doble gasto de Tavily, medido).
  -- Y una etapa saltada por agotar sus intentos (abajo) cuenta como hecha para
  -- que la cadena siga: su incidencia ya la enseña.
  cotejo_hecho  := exists (select 1 from public.glossa_radar_cotejos
                            where created_at >= v.hasta - interval '24 hours')
                   or coalesce((estado #>> '{cotejo,saltada}')::boolean, false);
  consejo_hecho := exists (select 1 from public.glossa_radar_consejo where created_at >= v.hasta)
                   or coalesce((estado #>> '{consejo,saltada}')::boolean, false);
  boletin_hecho := not exists (
    select 1 from public.glossa_subscribers
     where state = 'confirmado'
       and (last_sent_at is null or last_sent_at < v.hasta))
                   or coalesce((estado #>> '{boletin,saltada}')::boolean, false);

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

  if ultimo is not null and now() < ultimo + espera then
    return format('%s en marcha desde %s', etapa, ultimo);
  end if;

  -- Tres intentos y esa etapa no insiste más. Antes esto paraba la CADENA
  -- ENTERA en silencio: una etapa lateral en verde-con-cero-filas gastaba sus
  -- intentos y el consejo y el boletín no se disparaban nunca. Ahora:
  --   · cotejo/consejo/boletin → incidencia, se marca saltada, la cadena sigue.
  --   · numero/espanol → incidencia y la cadena para (sin ellos no hay nada
  --     que seguir); el vigilante y el correo la enseñan.
  if intentos >= 3 then
    insert into public.glossa_radar_incidencias (clase, sujeto, gravedad, detalle, evidencia)
    values ('domingo_etapa_agotada', wf, 'grave',
            format('la etapa «%s» agotó sus 3 intentos el domingo del %s', etapa, semana),
            jsonb_build_object('etapa', etapa, 'semana', semana::text, 'estado', estado -> etapa))
    on conflict do nothing;
    if etapa in ('cotejo', 'consejo', 'boletin') then
      estado := jsonb_set(estado, array[etapa, 'saltada'], 'true'::jsonb, true);
      insert into public.glossa_radar_settings (key, value, updated_at)
           values ('domingo_estado', estado, now())
      on conflict (key) do update set value = excluded.value, updated_at = now();
      return format('%s agotó sus 3 intentos; se salta con incidencia y la cadena sigue', etapa);
    end if;
    return format('%s agotó sus 3 intentos; hace falta mano (incidencia abierta)', etapa);
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
    etapa, (coalesce(estado -> etapa, '{}'::jsonb)) ||
           jsonb_build_object('n', intentos + 1, 'ts', now()));

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
  'por CONDICION. Desde 0066: el cotejo del sabado cuenta como hecho, y una etapa '
  'lateral que agota sus 3 intentos deja incidencia y se salta en vez de atascar la '
  'cadena en silencio; numero y espanol siguen parando, con incidencia.';
