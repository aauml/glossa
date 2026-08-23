-- 0037 — lo que no llegó a tiempo pasa a la semana siguiente.
--
-- La ventana del número se mide por `published_at`. Un episodio publicado el
-- sábado que a la hora del corte seguía en la cola se leía después — y ya no
-- entraba en NINGÚN número: su semana había cerrado, y la siguiente empieza el
-- domingo, así que su fecha de publicación queda fuera para siempre. Trabajo
-- pagado, guardado, y nunca leído por nadie.
--
-- `entregado_en` es la semana del número que lo CONSIDERÓ. No dice que saliera
-- publicado —el presupuesto de tokens recorta— dice que tuvo su oportunidad:
-- estuvo en la mesa cuando se escribió esa semana. Lo que no la ha tenido
-- todavía se arrastra.
alter table public.glossa_radar_items
  add column if not exists entregado_en date;

comment on column public.glossa_radar_items.entregado_en is
  'Semana del numero que lo tuvo sobre la mesa. NULL = todavia no ha entrado en ningun corte; el numero siguiente lo arrastra aunque su fecha de publicacion sea de una semana ya cerrada.';

create index if not exists glossa_radar_items_sin_entregar
  on public.glossa_radar_items (published_at)
  where entregado_en is null and state = 'digested';

-- Lo ya publicado se marca como entregado: el número del 16 los tuvo delante.
-- Sin esto, el primer corte con arrastre se traería 274 elementos viejos.
update public.glossa_radar_items
   set entregado_en = '2026-08-16'
 where entregado_en is null
   and state = 'digested'
   and published_at >= '2026-08-16 07:00:00+00'
   and published_at <  '2026-08-23 07:00:00+00';
