-- 0013 — recuperada de la base el 2026-08-22.
--
-- Esta migración se aplicó en producción pero nunca llegó al repo: el
-- historial saltaba de la 0009 a la 0016, así que el esquema no se podía
-- reconstruir desde aquí. El SQL es el que Supabase guardó al aplicarla.

-- Glossa · migración 0013 — cuándo empezó a procesarse un episodio
--
-- Para rescatar filas atascadas en 'running' hace falta saber cuándo entraron en
-- ese estado, no cuándo se descubrió el episodio. Usar `created_at` reiniciaría
-- por error una pasada legítima sobre un episodio descubierto hace rato.
--
-- Por qué hace falta rescatarlas: la pasada marca 'running' antes de llamar a
-- Gemini, y el reloj de 150 s de una edge function es un corte duro. Si cae ahí,
-- la fila queda en 'running' para siempre y el bucle no la recoge, porque solo
-- mira 'pending'. Pasó con un episodio real a los 9 minutos de empezar.

alter table public.glossa_radar_items
  add column if not exists started_at timestamptz;

comment on column public.glossa_radar_items.started_at is
  'Cuando la fila paso a running. Sirve para detectar pasadas muertas: ninguna dura mas de 150 s, asi que un running mas viejo que eso esta abandonado.';

create index if not exists glossa_radar_items_running_idx
  on public.glossa_radar_items (started_at) where state = 'running';

-- El que está atascado ahora mismo vuelve a la cola.
update public.glossa_radar_items set state = 'pending', started_at = null
 where state = 'running';
