-- 0064 · Los relojes que quedaban en GitHub.
--
-- La 0063 movió la cadena del domingo. Quedaban tres trabajos recurrentes
-- colgando del horario de GitHub, y los tres se estaban saltando: medido el
-- 2026-08-28, `sectores` pedía cada hora y hacía 13 corridas en 46 h —huecos de
-- 608, 649 y 538 minutos—, `vigilante` pedía cada 4 h y acumulaba huecos de 790,
-- y `monitores` se saltó el 27 entero.
--
-- El caso del vigilante es el que obliga a arreglarlo: es quien relanza lo que
-- falla y quien abre las incidencias. Un vigilante que duerme trece horas no
-- avisa de nada, y el sistema entero pierde su red justo cuando más la necesita.
--
-- `schedule:` se queda en los tres workflows. Esto no lo sustituye: lo dobla. Y
-- doblarlo es barato porque los tres ya saben no repetir trabajo — `monitores`
-- mira `next_run_at` fuente por fuente, `vigilante` tiene `cancel-in-progress`, y
-- a `sectores` se le acaba de poner su grupo de concurrencia.

create or replace function public.glossa_reloj_empujar(wf text, cada interval)
returns text
language plpgsql
security definer
set search_path to 'public', 'vault', 'net', 'extensions'
as $function$
declare
  estado jsonb;
  ultimo timestamptz;
  pat    text;
begin
  select value into estado from public.glossa_radar_settings where key = 'reloj_estado';
  estado := coalesce(estado, '{}'::jsonb);
  ultimo := (estado ->> wf)::timestamptz;

  -- Lo que manda es cuándo se empujó por última vez desde aquí, no si GitHub
  -- corrió por su cuenta: preguntarle a GitHub costaría una llamada por reloj y
  -- por pasada, y la respuesta no cambiaría nada — una corrida de más en
  -- cualquiera de los tres no hace daño, y una de menos es el problema que esto
  -- viene a resolver.
  if ultimo is not null and now() < ultimo + cada then
    return format('%s: aún no toca (último empujón %s)', wf, ultimo);
  end if;

  select decrypted_secret into pat
    from vault.decrypted_secrets where name = 'github_dispatch_pat' limit 1;
  if pat is null then
    raise exception 'glossa_reloj_empujar: falta github_dispatch_pat en el Vault';
  end if;

  perform net.http_post(
    url := 'https://api.github.com/repos/aauml/glossa/actions/workflows/' || wf || '/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || pat,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'glossa-reloj',
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('ref', 'main'),
    timeout_milliseconds := 8000
  );

  insert into public.glossa_radar_settings (key, value, updated_at)
       values ('reloj_estado', estado || jsonb_build_object(wf, now()), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();

  return format('empujado %s', wf);
end;
$function$;

revoke all on function public.glossa_reloj_empujar(text, interval) from public, anon, authenticated;
grant execute on function public.glossa_reloj_empujar(text, interval) to postgres, service_role;

comment on function public.glossa_reloj_empujar(text, interval) is
  'Empuja un workflow recurrente por workflow_dispatch si han pasado `cada` desde el '
  'ultimo empujon. Dobla el schedule: de GitHub, que es best-effort y se salta corridas '
  'bajo carga. Los tres workflows que la usan ya saben no repetir trabajo.';

-- Cada quince minutos se pregunta por los tres; cada uno sale por su propia
-- cadencia. Una sola entrada en el cron en vez de tres.
select cron.schedule('glossa-relojes', '*/15 * * * *', $cron$
  select public.glossa_reloj_empujar('glossa-sectores.yml',  interval '1 hour'),
         public.glossa_reloj_empujar('glossa-vigilante.yml', interval '4 hours'),
         public.glossa_reloj_empujar('glossa-monitores.yml', interval '24 hours');
$cron$);

-- ── La aritmética de la cola, en un solo sitio ───────────────────────────
-- El vigilante no tenía ningún chequeo de la cola: el 2026-08-28 había 665
-- elementos sin leer y no producían ni una incidencia. Se veía el síntoma
-- —«presupuesto_al_limite: gemini»— y no la causa, que es que entra más de lo
-- que cabe. PostgREST tiene los agregados desactivados, así que la cuenta vive
-- aquí y no en el guion: una definición, no una copia. Ver la 0036.
create or replace function public.glossa_radar_cola()
returns table (pendientes bigint, entrada_dia numeric, digestion_dia numeric, dias_de_atraso numeric)
language sql
stable
set search_path to 'public'
as $$
  with e as (
    -- Lo filtrado no cuenta como entrada: no llega a pedirle nada a Gemini.
    select count(*)::numeric / 3 as por_dia from public.glossa_radar_items
     where created_at >= now() - interval '3 days' and state <> 'skipped'
  ), d as (
    select count(*)::numeric / 3 as por_dia from public.glossa_radar_items
     where digested_at >= now() - interval '3 days' and state = 'digested'
  ), p as (
    select count(*) as n from public.glossa_radar_items where state = 'pending'
  )
  select p.n, round(e.por_dia, 1), round(d.por_dia, 1),
         case when d.por_dia > 0 then round(p.n / d.por_dia, 1) end
    from p, e, d;
$$;

revoke all on function public.glossa_radar_cola() from public, anon, authenticated;
grant execute on function public.glossa_radar_cola() to postgres, service_role;

comment on function public.glossa_radar_cola() is
  'Cuanto hay sin leer y cuantos dias se tardaria en vaciarlo al ritmo de los ultimos '
  'tres. Lo usa el vigilante para abrir `cola_creciendo`.';
