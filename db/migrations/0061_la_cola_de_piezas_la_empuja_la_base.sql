-- ── La cola de piezas la empuja la base, no GitHub ───────────────────────
--
-- El empujador vivía en un workflow con `cron: */20`. En cuatro horas no
-- disparó ni una vez: los cron de GitHub Actions se retrasan y se saltan bajo
-- carga, y son «best effort» por contrato. El radar, en cambio, lleva meses
-- puntual cada quince minutos — porque lo dispara pg_cron desde aquí.
--
-- Así que el mismo trabajo se hace donde el reloj sí se cumple. Esta función
-- mira el turno, coge la pieza pendiente más antigua y llama al mismo
-- `glossa_pieza_dispatch` que usa el panel. El workflow se queda como red de
-- seguridad manual, no como el mecanismo.
create or replace function public.glossa_piezas_empujar()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  turno   jsonb;
  siguiente uuid;
  titulo  text;
begin
  select value into turno from public.glossa_radar_settings where key = 'pieza_lease';

  -- Turno vivo: hay una corrida escribiendo. Se respeta hasta que caduque; los
  -- 45 minutos son la red por si esa corrida murió sin soltarlo.
  if turno ? 'at' and turno->>'at' is not null
     and (now() - (turno->>'at')::timestamptz) < interval '45 minutes' then
    return 'ocupado: ' || coalesce(turno->>'run', '?');
  end if;

  select id, title into siguiente, titulo
    from public.glossa_radar_items
   where origin = 'pieza' and state = 'pending'
   order by created_at asc
   limit 1;

  if siguiente is null then return 'cola vacía'; end if;

  -- La barra deja de anunciar el fallo del intento anterior: esto está en cola.
  update public.glossa_radar_items
     set progress = jsonb_build_object(
           'pct', 4, 'fase', 'queued — launching',
           'intentos', coalesce((progress->>'intentos')::int, 0),
           'updated_at', now())
   where id = siguiente;

  perform public.glossa_pieza_dispatch(siguiente);
  return 'lanzada: ' || left(coalesce(titulo, ''), 60);
end;
$$;

comment on function public.glossa_piezas_empujar is
  'Empuja la cola de piezas sueltas: si el turno está libre, lanza la pendiente más antigua. La llama pg_cron cada 15 min porque el cron de GitHub Actions no es fiable a esa frecuencia.';

revoke all on function public.glossa_piezas_empujar() from public;
grant execute on function public.glossa_piezas_empujar() to service_role;

select cron.schedule('glossa-piezas-cola', '*/15 * * * *',
                     'select public.glossa_piezas_empujar()');
