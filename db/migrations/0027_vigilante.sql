-- 0027 — el vigilante: que el sistema mire sus propias anomalías.
--
-- Hasta ahora el panel ENSEÑABA el estado pero nadie lo VIGILABA. Hoy seis
-- elementos llevaban horas en error y el número falló dos domingos seguidos; las
-- dos cosas estaban a la vista y las descubrió Arturo preguntando, no el sistema.
-- Un tablero que hay que mirar para enterarse no es vigilancia, es decoración con
-- datos.
--
-- Lo que esto NO hace: arreglar defectos del código. Los once fallos de hoy eran
-- condiciones mal escritas, y un sistema que reescribe su propio código sin que
-- nadie lo lea se «arregla» volviéndose permisivo, que es el fallo que no se ve.
-- Lo que sí hace es detectar, recuperar lo que tiene forma conocida, y dejar el
-- resto anotado con su evidencia para que la corrección se escriba con datos.

create table if not exists public.glossa_radar_incidencias (
  id uuid primary key default gen_random_uuid(),
  clase text not null,              -- qué tipo de anomalía
  sujeto text,                      -- a quién le pasa: una fuente, un trabajo…
  gravedad text not null default 'aviso' check (gravedad in ('aviso','grave')),
  detalle text not null,
  evidencia jsonb,
  accion text,                      -- qué hizo el vigilante por su cuenta, si algo
  abierta boolean not null default true,
  vista_por_ultima_vez timestamptz not null default now(),
  created_at timestamptz not null default now(),
  cerrada_at timestamptz
);

-- Una incidencia por clase y sujeto. Si sigue pasando se actualiza la fecha en
-- vez de acumular filas: veinte avisos del mismo problema no informan mejor que
-- uno que diga «desde hace tres días».
create unique index if not exists glossa_radar_incidencias_uniq
  on public.glossa_radar_incidencias (clase, coalesce(sujeto, '')) where abierta;
create index if not exists glossa_radar_incidencias_reciente
  on public.glossa_radar_incidencias (created_at desc);

alter table public.glossa_radar_incidencias enable row level security;
grant all on public.glossa_radar_incidencias to service_role;
create policy glossa_radar_incidencias_service on public.glossa_radar_incidencias
  for all to service_role using (true) with check (true);

insert into public.glossa_radar_settings (key, value) values
  -- Días que una fuente activa puede pasar sin traer nada antes de que se avise.
  ('vigilante_dias_muda', '8'::jsonb),
  -- Fallos seguidos de una fuente por búsqueda antes de pausarla sola.
  ('vigilante_fallos_para_pausar', '3'::jsonb)
on conflict (key) do nothing;

comment on table public.glossa_radar_incidencias is
  'Anomalías que el vigilante encontró en el propio sistema. Se cierran solas '
  'cuando dejan de darse: una incidencia que sigue abierta es una que sigue pasando.';
