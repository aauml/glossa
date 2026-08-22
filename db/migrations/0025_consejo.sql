-- 0025 — el consejo: autocorrección con contrapeso.
--
-- El cotejo mide los juicios del propio sistema, y la primera medición ya dijo
-- algo: de las afirmaciones que el análisis marcó como «documentadas», ninguna
-- sobrevivió a la comprobación. Eso es un error de calibración, contado.
--
-- La objeción evidente a dejar que se corrija solo es que el juez sería la cosa
-- juzgada: si el análisis se vuelve más permisivo y eso mejora sus propias
-- métricas, se seguirá premiando, y la deriva es invisible porque lo que la
-- notaría es justo lo que cambió.
--
-- Un comité de OTROS modelos rompe eso, y es la regla que thesis ya aplica
-- (D-038): «el comité es contrapeso, no puede corregir sus propios deberes».
-- Aquí eso significa que Gemini —que es quien analiza— no vota sobre cómo
-- analizar. Votan Kimi, DeepSeek y Qwen: tres casas distintas.
--
-- Tres límites más, y son los que hacen que esto sea reversible en vez de
-- deriva:
--   1. El comité solo puede escribir en RANURAS con nombre, nunca reescribir un
--      prompt entero. El radio de daño está acotado por diseño.
--   2. Todo queda registrado: qué se midió, quién votó qué y por qué.
--   3. Se revierte desde el panel con un clic, y revertir devuelve la ranura a
--      vacío, que es el comportamiento original.

create table if not exists public.glossa_radar_consejo (
  id uuid primary key default gen_random_uuid(),
  convocado_por text not null,        -- qué medición disparó esto
  ranura text not null,               -- dónde puede escribir el veredicto
  evidencia jsonb not null,           -- los números que lo motivaron
  pregunta text not null,

  votos jsonb not null,               -- [{modelo, casa, cambiar, propuesta, razon}]
  decision text,                      -- el texto que se aplicó, o null si no hubo cambio
  motivo text,                        -- por qué se decidió eso
  aplicado boolean not null default false,
  revertido_at timestamptz,

  coste_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.glossa_radar_consejo enable row level security;
grant all on public.glossa_radar_consejo to service_role;
create policy glossa_radar_consejo_service on public.glossa_radar_consejo
  for all to service_role using (true) with check (true);

create index if not exists glossa_radar_consejo_reciente
  on public.glossa_radar_consejo (created_at desc);

-- Las ranuras. Vacías = comportamiento original. El consejo solo puede tocar
-- estas, y solo con texto corto: son una nota de calibración que se AÑADE a las
-- reglas, no un sustituto de ellas.
insert into public.glossa_radar_settings (key, value) values
  ('prompt_calibracion_digest', '""'::jsonb),
  ('prompt_calibracion_cotejo', '""'::jsonb),
  -- Cuántas comprobaciones hacen falta antes de que una tasa signifique algo.
  -- Con cuatro casos no se corrige nada: se espera.
  ('consejo_minimo_muestra', '12'::jsonb),
  -- Por debajo de esta proporción de «documentado» confirmado, se convoca.
  ('consejo_umbral_calibracion', '0.34'::jsonb)
on conflict (key) do nothing;

comment on table public.glossa_radar_consejo is
  'Deliberaciones del comité que corrige la calibración del sistema. El modelo '
  'que se corrige no vota sobre sí mismo. Cada fila es reversible desde el panel.';
