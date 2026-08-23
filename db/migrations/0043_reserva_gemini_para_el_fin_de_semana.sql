-- 0043 · Una reserva de cuota para lo que corre una vez por semana
--
-- El radar lee sin parar —cada quince minutos— y el reportaje y el número corren
-- una vez. Compartiendo un solo tope diario, el que corre siempre se lo queda
-- siempre: el 2026-08-23 el radar gastó 411 de 400 y el reportaje del sábado
-- llegó a sus búsquedas sin nada con que digerirlas. Compró veintiocho, gastó
-- cincuenta y seis créditos de Tavily y no produjo un solo reporte.
--
-- `cap_gemini_dia` sigue siendo el techo del día. `cap_gemini_dia_radar` es el
-- del radar solo, y la diferencia entre los dos es la reserva.
insert into public.glossa_radar_settings (key, value) values
  ('cap_gemini_dia_radar', '600')
on conflict (key) do update set value = excluded.value, updated_at = now();

comment on table public.glossa_radar_settings is
  'Ajustes del radar. cap_gemini_dia es el techo del DIA; cap_gemini_dia_radar es el del radar solo, y la diferencia entre ambos queda reservada para las tareas semanales (reportaje, numero), que corren una vez y no pueden competir con algo que corre cada quince minutos.';
