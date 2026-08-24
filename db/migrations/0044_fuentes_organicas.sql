-- 0044 · Fuentes orgánicas: el directorio de fuentes crece solo, con contrapeso.
--
-- Las 40 fuentes de hoy las dio de alta Arturo a mano. Este cambio hace que el
-- directorio se ramifique desde el material mismo: cuando un canal seguido cita
-- a un académico o a un medio como SU fuente de información, eso es una mención;
-- cuando el reportaje del viernes encuentra un medio que entrega texto útil
-- sobre un tema, eso es evidencia. Las dos cosas alimentan un expediente por
-- candidato, y quien promueve o degrada es el CONSEJO del domingo — el comité de
-- otros modelos que ya corrige la calibración— nunca el propio radar y nunca
-- (por diseño) Arturo, que solo mira y puede vetar desde el panel.
--
-- La defensa contra la cámara de eco no es clasificar ideologías —eso es frágil
-- y falla justo en los casos que importan— sino medir la ESTRUCTURA: un
-- candidato solo cuenta como mencionado dos veces si lo citan dos fuentes
-- distintas, y el expediente lista quiénes lo citan, para que el consejo vea si
-- todo viene del mismo racimo. La otra mitad es el cotejo: una fuente a prueba
-- se gana la confianza aportando hechos que se sostienen y relatos DISTINTOS de
-- los que ya había, no repitiendo lo que sus padrinos ya decían.
--
-- Nada de esto corrobora nada mientras está a prueba: el material de una fuente
-- `a_prueba` entra al número ETIQUETADO y no puede contarse como confirmación
-- independiente. La promoción a confianza es por tema, no en general.

-- ── El grafo de citas: quién cita a quién ──────────────────────────────────
-- Una fila por (episodio, citado). El análisis ya detectaba atribuciones y las
-- tiraba; ahora las guarda. `clave` es el nombre normalizado (minúsculas, sin
-- acentos ni puntuación) para que "Prof. Hudson" y "Michael Hudson" tengan
-- oportunidad de encontrarse — la fusión fina la hace el consejo al leer.
create table if not exists public.glossa_radar_menciones (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.glossa_radar_items(id) on delete cascade,
  citado text not null,                  -- el nombre tal como se dijo
  clave text not null,                   -- normalizado, para agrupar
  tipo text not null check (tipo in ('persona', 'medio', 'institucion', 'obra')),
  contexto text,                         -- para qué se le citó
  created_at timestamptz not null default now(),
  unique (item_id, clave)
);
comment on table public.glossa_radar_menciones is
  'Radar: a quién citan las fuentes como SU fuente de información. Es el grafo '
  'de citas del que nacen los candidatos a fuente nueva, y lo que permite medir '
  'si un tema se cita solo a sí mismo (cámara de eco). Escrito por el radar al '
  'digerir; leído por el consejo del domingo.';
create index if not exists glossa_radar_menciones_clave_idx on public.glossa_radar_menciones (clave);
create index if not exists glossa_radar_menciones_item_idx  on public.glossa_radar_menciones (item_id);

-- ── Los candidatos y su expediente ─────────────────────────────────────────
-- El ciclo de vida: candidato → a_prueba → confianza, o degradado/vetado.
-- `vetado` es el único estado que pone una persona (Arturo, desde el panel);
-- todos los demás los pone el consejo, y quedan con su motivo al lado.
create table if not exists public.glossa_radar_candidatos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,            -- dominio del medio o nombre normalizado
  nombre text not null,
  tipo text not null check (tipo in ('medio', 'persona', 'institucion', 'obra')),
  homepage text,
  feed_url text,                         -- se rellena al descubrir su RSS; sin él no hay promoción
  estado text not null default 'candidato'
    check (estado in ('candidato', 'a_prueba', 'confianza', 'degradado', 'vetado')),
  -- Los temas donde se ganó el lugar. La confianza es POR TEMA, no en general.
  temas jsonb not null default '[]'::jsonb,
  -- El expediente: quién lo mencionó (con el id de la fuente que lo citó, para
  -- exigir independencia), y en qué semanas lo encontró el reportaje.
  --   { "menciones": [{"source_id","fuente","item_id","contexto","fecha"}],
  --     "reportaje": [{"semana","tema","entro"}] }
  expediente jsonb not null default '{}'::jsonb,
  -- Si se promovió, la fila de glossa_radar_sources que lo encarna.
  source_id uuid references public.glossa_radar_sources(id) on delete set null,
  motivo text,                           -- la última decisión del consejo, en una frase
  decidido_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.glossa_radar_candidatos is
  'Radar: candidatos a fuente nueva y su expediente. Nacen de las menciones y '
  'del reportaje; los promueve o degrada el consejo del domingo con la evidencia '
  'del cotejo. Arturo solo mira, y puede vetar. La confianza es por tema.';
create index if not exists glossa_radar_candidatos_estado_idx on public.glossa_radar_candidatos (estado, updated_at desc);

-- ── Las fuentes ganan estado y alcance ─────────────────────────────────────
-- Las 40 existentes quedan como `confianza`: las puso Arturo y ese es el ancla.
-- Una fuente `a_prueba` se sondea igual, pero su material va etiquetado y no
-- corrobora. `temas` acota dónde vale; vacío = general (las de Arturo).
alter table public.glossa_radar_sources
  add column if not exists estado text not null default 'confianza'
    check (estado in ('confianza', 'a_prueba')),
  add column if not exists temas jsonb not null default '[]'::jsonb,
  add column if not exists candidato_id uuid references public.glossa_radar_candidatos(id) on delete set null;

comment on column public.glossa_radar_sources.estado is
  'confianza = la puso Arturo o el consejo la promovió tras la prueba. a_prueba = '
  'la promovió el consejo desde un expediente; su material entra etiquetado y no '
  'cuenta como corroboración hasta que el cotejo la respalde.';
comment on column public.glossa_radar_sources.temas is
  'Alcance: slugs de los temas donde esta fuente se ganó el lugar. Vacío = general.';

-- ── Ajustes: umbrales y frenos ─────────────────────────────────────────────
insert into public.glossa_radar_settings (key, value) values
  -- Menciones de fuentes DISTINTAS que hacen candidato a alguien.
  ('candidato_menciones_minimas',  '2'),
  -- Semanas distintas en que el reportaje debe encontrar a un medio.
  ('candidato_semanas_reportaje',  '2'),
  -- Fuentes activas que puede tener un tema; promover con el cupo lleno exige degradar.
  ('fuentes_tope_por_tema',        '6'),
  -- Altas nuevas por semana, como mucho. Es el freno de crecimiento: cada fuente
  -- cuesta cuota de Gemini, y un domingo entusiasta no puede duplicar el gasto.
  ('fuentes_altas_por_semana',     '2'),
  -- Semanas mínimas a prueba antes de que el consejo pueda decidir confianza/degradado.
  ('prueba_semanas_minimas',       '3')
on conflict (key) do nothing;

-- ── El expediente, listo para leer ─────────────────────────────────────────
-- Agrega las menciones por candidato con la independencia YA contada: cuántas
-- fuentes distintas lo citan, quiénes son, y en qué temas cayó el material que
-- lo cita. Lo usa el consejo para decidir y el panel para mostrar.
create or replace function public.glossa_radar_expedientes(minimo int default 1)
returns table (
  clave text, citado text, tipo text,
  fuentes_distintas bigint, menciones bigint,
  citado_por jsonb, temas jsonb, primera timestamptz, ultima timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select m.clave,
         min(m.citado)                                        as citado,
         min(m.tipo)                                          as tipo,
         count(distinct i.source_id)                          as fuentes_distintas,
         count(*)                                             as menciones,
         coalesce(jsonb_agg(distinct s.name) filter (where s.name is not null), '[]'::jsonb) as citado_por,
         coalesce((select jsonb_agg(distinct t.slug)
                     from public.glossa_radar_item_topics it
                     join public.glossa_radar_topics t on t.id = it.topic_id
                    where it.item_id in (select m2.item_id from public.glossa_radar_menciones m2
                                          where m2.clave = m.clave)), '[]'::jsonb) as temas,
         min(m.created_at)                                    as primera,
         max(m.created_at)                                    as ultima
    from public.glossa_radar_menciones m
    join public.glossa_radar_items i on i.id = m.item_id
    left join public.glossa_radar_sources s on s.id = i.source_id
   group by m.clave
  having count(distinct i.source_id) >= minimo
   order by count(distinct i.source_id) desc, count(*) desc;
$$;

revoke all on function public.glossa_radar_expedientes(int) from public;
grant execute on function public.glossa_radar_expedientes(int) to service_role;

-- ── Permisos ───────────────────────────────────────────────────────────────
alter table public.glossa_radar_menciones  enable row level security;
alter table public.glossa_radar_candidatos enable row level security;
grant all on public.glossa_radar_menciones, public.glossa_radar_candidatos to service_role;
create policy glossa_radar_menc_service on public.glossa_radar_menciones
  for all to service_role using (true) with check (true);
create policy glossa_radar_cand_service on public.glossa_radar_candidatos
  for all to service_role using (true) with check (true);
