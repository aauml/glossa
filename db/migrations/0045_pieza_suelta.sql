-- 0045 · La pieza suelta: leer algo SOLO para un artículo, sin tocar el semanal.
--
-- Hasta ahora todo lo pegado en la caja acababa en el número de la semana: la
-- cola es una y el guion del domingo lee todo lo digerido de la ventana. Pero
-- hay un caso distinto, pedido explícitamente: «pego un video o un podcast y
-- quiero un artículo de ESO, sin que se mezcle con el issue semanal».
--
-- La solución es un origen nuevo, no una tabla nueva: `origin='pieza'` entra en
-- la misma cola, el radar lo digiere igual (mismo prompt, mismos temas), pero el
-- guion del número lo excluye. El digest queda listo para que Arturo ordene la
-- pieza en conversación (skills/SKILL.md), que es el camino de publicación de
-- siempre — con su seed y su autoría humana, como exige docs/05.
alter table public.glossa_radar_items
  drop constraint if exists glossa_radar_items_origin_check;
alter table public.glossa_radar_items
  add constraint glossa_radar_items_origin_check
  check (origin in ('feed', 'pegado', 'busqueda', 'reportaje', 'pieza'));

comment on column public.glossa_radar_items.origin is
  'feed = lo trajo una fuente seguida; pegado = lo metió Arturo para el semanal; '
  'busqueda = lo encontró un monitor; reportaje = lo trajo la salida del viernes; '
  'pieza = lo metió Arturo SOLO para un artículo suelto — el número no lo lee.';
