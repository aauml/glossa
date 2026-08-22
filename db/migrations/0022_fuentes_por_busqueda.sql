-- 0022 — fuentes que no tienen feed: temas y personas.
--
-- Un canal se sondea porque sabes su URL. Un tema —«Mexico politics»— y una
-- persona —«John Mearsheimer»— no tienen dónde ir a buscar: hay que preguntarle
-- a un buscador. Sus hallazgos entran en la MISMA cola que todo lo demás y los
-- lee el mismo análisis, sin camino nuevo.
--
-- Los nombres y la semántica se copian literalmente de la tabla `monitors` de
-- thesis (`phd-agents/monitors/main.py`), que lleva tiempo funcionando. Se
-- extiende esta tabla en vez de crear otra porque aquí un tema ES una fuente: se
-- sondea con horario, se activa y se pausa, sale en la misma lista. Una segunda
-- tabla obligaría a duplicar listar, alternar y borrar, y a unirlas en el panel.

alter table public.glossa_radar_sources
  add column if not exists queries            jsonb,      -- ["consulta 1", "consulta 2"]
  add column if not exists domains            text[],     -- limitar a estos medios
  -- La compuerta de relevancia, y es lo más valioso que se copia de thesis. Una
  -- búsqueda de «John Mearsheimer» devolvió una guía de fantasy football. Exigir
  -- que el apellido aparezca en el título o el resumen la descarta sin gastar
  -- una sola llamada a un modelo.
  add column if not exists keywords_required  text[],
  add column if not exists keywords_excluded  text[],
  add column if not exists schedule           text default 'weekly',
  add column if not exists next_run_at        timestamptz,
  add column if not exists consecutive_failures int not null default 0,
  add column if not exists last_success_at    timestamptz;

alter table public.glossa_radar_sources drop constraint if exists glossa_radar_sources_schedule_check;
alter table public.glossa_radar_sources add constraint glossa_radar_sources_schedule_check
  check (schedule is null or schedule in ('daily', 'weekly', 'biweekly', 'monthly'));

-- Solo las fuentes por búsqueda tienen turno; el resto las sondea el radar cada
-- pasada. El índice parcial es el que hace barata la pregunta «¿a quién le toca?».
create index if not exists glossa_radar_sources_turno_idx
  on public.glossa_radar_sources (next_run_at)
  where active and kind in ('tema', 'persona');

-- Las que ya existan sin turno arrancan de inmediato.
update public.glossa_radar_sources
   set next_run_at = now()
 where kind in ('tema', 'persona') and next_run_at is null;

comment on column public.glossa_radar_sources.keywords_required is
  'Todas tienen que aparecer en el título o el resumen del hallazgo, o se descarta '
  'antes de escribir la fila. Sin esto, buscar una persona devuelve cualquier '
  'página donde su nombre salga de paso.';
