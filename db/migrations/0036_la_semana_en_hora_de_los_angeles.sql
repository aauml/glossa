-- 0036 — la semana es la de Arturo, no la de Greenwich.
--
-- Todo el reloj estaba anclado a UTC: el número «16 → 22» cubría en realidad
-- desde el SÁBADO 15 a las 17:00 en Los Ángeles hasta el viernes 21 a las 17:00.
-- Un episodio publicado el sábado por la tarde —hora de aquí— caía en la semana
-- siguiente, y el número que decía cubrir el sábado no lo cubría.
--
-- Se ancla a `America/Los_Angeles`. Y la aritmética se hace en hora LOCAL antes
-- de convertir: `timestamptz - interval '7 days'` se resuelve en la zona de la
-- sesión y en un cambio de horario mueve el borde una hora. Restando sobre el
-- `timestamp` desnudo y convirtiendo al final, el domingo es el domingo a
-- medianoche pase lo que pase con el horario de verano.
--
-- `ref` permite preguntar por otra semana —lo usa `WEEK_END`— sin que nadie
-- vuelva a calcular la ventana por su cuenta. UNA definición: la usan el panel,
-- el número, el reportaje, el cotejo y los monitores.
drop function if exists public.glossa_semana_actual();

create or replace function public.glossa_semana_actual(ref timestamptz default now())
returns table (desde timestamptz, hasta timestamptz, parcial boolean)
language sql
stable
set search_path to 'public'
as $$
  select (case when dow = 0 then hoy - interval '7 days' else hoy - (dow || ' days')::interval end)
           at time zone 'America/Los_Angeles',
         (case when dow = 0 then hoy else hoy + interval '1 day' end)
           at time zone 'America/Los_Angeles',
         dow <> 0
    from (select date_trunc('day', ref at time zone 'America/Los_Angeles') as hoy,
                 extract(dow from ref at time zone 'America/Los_Angeles')::int as dow) t;
$$;

comment on function public.glossa_semana_actual is
  'La semana de Glossa: domingo 00:00 en Los Angeles a domingo 00:00. Domingo devuelve la semana que acaba de cerrarse (corte oficial); cualquier otro dia, la semana abierta hasta el final de hoy (corte parcial). Fuente unica: el panel y todos los guiones la llaman en vez de calcularla.';

revoke all on function public.glossa_semana_actual(timestamptz) from public, anon, authenticated;
grant execute on function public.glossa_semana_actual(timestamptz) to service_role;
