-- 0031 — dos cifras que dicen si salir a buscar sirve para algo.
--
-- `STANDARD-PUBLISHED-OUTPUT` exige que lo que se produce tenga un lector
-- nombrado. La etapa de reportaje podría funcionar en vacío durante semanas
-- —buscando, encontrando, guardando— sin que nadie notara que el número no la
-- usa. Estas dos columnas son lo que lo hace visible en el panel:
--
--   `reportaje_count`      cuántos reportajes llegaron al número
--   `piezas_sin_reportaje` cuántas piezas se escribieron solo con los canales
--                          HABIENDO reportaje disponible esa semana
--
-- La segunda es la que importa. Que sea alta no es un error del sistema: una
-- pieza puede ser honestamente de algo sobre lo que no se encontró nada. Pero si
-- se queda alta semana tras semana, lo que está fallando es el prompt o la
-- selección de temas, y sin medirlo no habría forma de saberlo.
alter table public.glossa_radar_weekly
  add column if not exists reportaje_count      int not null default 0,
  add column if not exists piezas_sin_reportaje int not null default 0;

comment on column public.glossa_radar_weekly.piezas_sin_reportaje is
  'Piezas escritas solo con los canales habiendo reportaje de fuera esa semana. No es un error por si solo; sostenido en el tiempo, dice que la etapa no se esta usando.';
