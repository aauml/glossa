-- 0021 — contar lo que se gasta, y parar cuando toca.
--
-- Glossa está a punto de hacer llamadas de pago en automático los domingos, y no
-- tenía ni contador ni tope. Thesis lleva topes por tarea —blando por corrida,
-- duro por mes— desde hace tiempo; esto copia esa disciplina.
--
-- Se cuentan LLAMADAS, no dólares, porque lo que aprieta de verdad son cuotas:
-- búsquedas al mes en Tavily, unidades al día en YouTube, llamadas al día en el
-- tramo gratuito de Gemini. Contar llamadas es exacto y no necesita una tabla de
-- precios que se quede vieja en silencio. Solo Kimi tiene precio de verdad, y
-- solo Kimi lleva cifra en dólares.

create table if not exists public.glossa_radar_uso (
  proveedor  text not null,
  dia        date not null default (now() at time zone 'utc')::date,
  llamadas   int  not null default 0,
  tokens     bigint not null default 0,
  coste_usd  numeric(10,4) not null default 0,
  primary key (proveedor, dia)
);

alter table public.glossa_radar_uso enable row level security;
grant all on public.glossa_radar_uso to service_role;
create policy glossa_radar_uso_service on public.glossa_radar_uso
  for all to service_role using (true) with check (true);

-- Suma atómica. Un leer-modificar-escribir desde dos procesos concurrentes
-- pierde cuentas, y una cuenta perdida es una llamada gratis que el tope no ve.
-- El radar corre cada 15 minutos y el número los domingos: se solapan.
create or replace function public.glossa_radar_uso_sumar(
  p_proveedor text,
  p_llamadas  int     default 1,
  p_tokens    bigint  default 0,
  p_coste     numeric default 0
)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.glossa_radar_uso (proveedor, llamadas, tokens, coste_usd)
  values (p_proveedor, p_llamadas, p_tokens, p_coste)
  on conflict (proveedor, dia) do update
    set llamadas  = public.glossa_radar_uso.llamadas  + excluded.llamadas,
        tokens    = public.glossa_radar_uso.tokens    + excluded.tokens,
        coste_usd = public.glossa_radar_uso.coste_usd + excluded.coste_usd;
$$;

-- Lo gastado hoy, esta semana y este mes, por proveedor. Es lo que mira el
-- código antes de llamar y lo que pinta el panel.
create or replace function public.glossa_radar_presupuesto()
returns table (
  proveedor text, hoy bigint, semana bigint, mes bigint,
  tokens_mes bigint, coste_mes numeric
)
language sql
security definer
set search_path to 'public'
as $$
  select proveedor,
         coalesce(sum(llamadas) filter (where dia = (now() at time zone 'utc')::date), 0)::bigint,
         coalesce(sum(llamadas) filter (where dia >= (now() at time zone 'utc')::date - 6), 0)::bigint,
         coalesce(sum(llamadas) filter (where date_trunc('month', dia) =
                    date_trunc('month', (now() at time zone 'utc')::date)), 0)::bigint,
         coalesce(sum(tokens)   filter (where date_trunc('month', dia) =
                    date_trunc('month', (now() at time zone 'utc')::date)), 0)::bigint,
         coalesce(sum(coste_usd) filter (where date_trunc('month', dia) =
                    date_trunc('month', (now() at time zone 'utc')::date)), 0)
    from public.glossa_radar_uso
   group by proveedor
   order by proveedor;
$$;

revoke all on function public.glossa_radar_uso_sumar(text, int, bigint, numeric) from public;
revoke all on function public.glossa_radar_presupuesto() from public;
grant execute on function public.glossa_radar_uso_sumar(text, int, bigint, numeric) to service_role;
grant execute on function public.glossa_radar_presupuesto() to service_role;

-- Los topes viven en ajustes, no aquí: cambiarlos no debe pedir una migración.
-- Para eso se hizo esa tabla.
--
-- `cap_tavily_mes` está en 100 y no en 1.000 a propósito. El plan da 1.000, pero
-- un tope bajo convierte un error de configuración en «se acabó el cupo» en vez
-- de en una factura.
insert into public.glossa_radar_settings (key, value) values
  ('cap_gemini_dia',           '400'::jsonb),
  ('cap_youtube_dia',          '6000'::jsonb),
  ('cap_tavily_mes',           '100'::jsonb),
  ('cap_moonshot_mes_usd',     '3'::jsonb),
  ('cotejo_busquedas_semana',  '20'::jsonb)
on conflict (key) do nothing;
