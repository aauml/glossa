-- 0048 · El progreso de una pieza en producción, visible desde el panel.
--
-- Producir una pieza tarda 10-20 minutos y hasta ahora era una caja negra:
-- se pegaba, decía «being written now» y no volvía a saberse nada hasta que
-- aparecía (o no). El guion va escribiendo aquí en qué fase va y el panel lo
-- pinta como barra bajo la caja de entrada.
--
-- {pct, fase, slug?, issue?, error?, updated_at} — lo escribe únicamente el
-- workflow de la pieza (service key); el panel solo lo lee.
alter table public.glossa_radar_items
  add column if not exists progress jsonb;

comment on column public.glossa_radar_items.progress is
  'Solo para origin=pieza: fase y porcentaje de la producción en curso, escrito '
  'por glossa-pieza.yml. El panel lo pinta como barra de progreso.';
