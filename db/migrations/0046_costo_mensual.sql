-- 0046 · El costo por mes, agregado en la base.
--
-- El panel enseñaba el gasto como una línea de contadores rodantes (hoy /
-- semana / mes) y la primera lectura real la malinterpretó: los 117 créditos
-- GASTADOS de Tavily se leyeron como los que QUEDABAN. Una tabla por mes, con
-- el total al lado, no admite esa lectura. El agregado se hace aquí y no en el
-- navegador porque glossa_radar_uso guarda una fila por proveedor y día — al
-- año son miles de filas que el panel no tiene por qué cargar.
create or replace function public.glossa_radar_costo_mensual()
returns table (mes text, proveedor text, llamadas bigint, tokens bigint, coste numeric)
language sql
security definer
set search_path to 'public'
as $$
  select to_char(dia, 'YYYY-MM') as mes,
         proveedor,
         sum(llamadas)           as llamadas,
         sum(tokens)             as tokens,
         round(sum(coste_usd)::numeric, 2) as coste
    from public.glossa_radar_uso
   group by 1, 2
   order by 1 desc, 5 desc;
$$;

revoke all on function public.glossa_radar_costo_mensual() from public;
grant execute on function public.glossa_radar_costo_mensual() to service_role;
