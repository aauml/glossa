-- ── La fila avanza apretada, sin correr dos a la vez ─────────────────────
--
-- En PARALELO no se puede, y no es prudencia: cada corrida calcula su número
-- como «el mayor que hay más uno», así que dos a la vez reclaman el mismo y el
-- comprobador de contenido para la publicación —pasó anoche—; y la cuenta de
-- Moonshot admite UNA petición a la vez, así que la segunda se pasaría el rato
-- reintentando contra un 429 sin ganar nada.
--
-- Lo que sí se puede es apretar la fila. Dos cambios:
--
--   · El turno ahora LATE: cada avance de la pieza renueva su marca de tiempo.
--     Un turno viejo significa entonces «esa corrida está muerta» y no «lleva un
--     rato en la parte lenta», así que doce minutos bastan donde antes hacían
--     falta cuarenta y cinco por si acaso.
--   · Y se mira cada cinco minutos en vez de cada quince: cuando una pieza
--     termina, la siguiente entra casi seguida.
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

  -- Doce minutos SIN LATIDO. La corrida renueva la marca en cada avance, y
  -- entre avances nunca pasan doce minutos ni en la etapa larga.
  if turno ? 'at' and turno->>'at' is not null
     and (now() - (turno->>'at')::timestamptz) < interval '12 minutes' then
    return 'ocupado: ' || coalesce(turno->>'run', '?');
  end if;

  select id, title into siguiente, titulo
    from public.glossa_radar_items
   where origin = 'pieza' and state = 'pending'
   order by created_at asc
   limit 1;

  if siguiente is null then return 'cola vacía'; end if;

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

revoke all on function public.glossa_piezas_empujar() from public;
grant execute on function public.glossa_piezas_empujar() to service_role;

select cron.unschedule('glossa-piezas-cola');
select cron.schedule('glossa-piezas-cola', '*/5 * * * *',
                     'select public.glossa_piezas_empujar()');
