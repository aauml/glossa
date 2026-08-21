-- Glossa · migración 0008 — radar: leer muchas fuentes sin verlas todas
--
-- Qué resuelve: seguir 10-30 canales y podcasts es imposible a mano. El radar
-- escucha cada episodio, saca un resumen estructurado, y agrupa los resúmenes
-- por TEMA. La unidad de salida es el tema, no el canal: se pregunta "¿qué pasó
-- con Irán?" y hay un dossier al día con lo que dijo cada fuente y dónde chocan.
--
-- Los temas NO están predefinidos: emergen del contenido. Cada resumen se
-- compara con los temas ya vistos y o encaja en uno o propone uno nuevo. Por eso
-- hay un registro de temas con `merged_into`: el modelo creará duplicados
-- ("Irán", "Guerra de Irán") y hace falta poder fundirlos sin perder el enlace.
--
-- Frontera: esto NO es la capa de publicación. Nada de aquí se publica solo.
-- Es material de lectura privado; una pieza de Glossa nace cuando Arturo le pone
-- su tesis a un dossier, y entonces sigue el camino normal (seed -> issue -> MDX).

-- ─────────────────────────────────────────────────────────────
-- Fuentes
-- ─────────────────────────────────────────────────────────────
create table if not exists public.glossa_radar_sources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('youtube', 'podcast', 'rss')),
  name text not null,
  feed_url text not null unique,          -- RSS del canal / del podcast / del medio
  homepage text,
  active boolean not null default true,
  notes text,                             -- p. ej. orientación editorial conocida
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.glossa_radar_sources is 'Radar: qué se vigila. Una fila por canal, podcast o medio. Añadir una fuente es insertar una fila.';

-- ─────────────────────────────────────────────────────────────
-- Episodios y su resumen
-- ─────────────────────────────────────────────────────────────
create table if not exists public.glossa_radar_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.glossa_radar_sources(id) on delete cascade,
  external_id text not null,              -- videoId de YouTube / guid del podcast
  url text not null,
  title text not null,
  author text,                            -- el invitado, cuando se puede separar del título
  published_at timestamptz not null,
  state text not null default 'pending'
    check (state in ('pending', 'running', 'digested', 'skipped', 'error')),
  -- El resumen: tesis, afirmaciones falsables, citas con su marca de tiempo.
  -- NO se guarda la transcripción: para escribir hace falta la cita localizable,
  -- no una copia de la obra.
  digest jsonb,
  lang text,
  tokens_used integer,
  error text,
  digested_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, external_id)
);
comment on table public.glossa_radar_items is 'Radar: un episodio y su resumen estructurado. Guarda análisis y citas localizables, nunca la transcripción completa.';
create index if not exists glossa_radar_items_state_idx on public.glossa_radar_items (state, published_at desc);
create index if not exists glossa_radar_items_pub_idx   on public.glossa_radar_items (published_at desc);

-- ─────────────────────────────────────────────────────────────
-- Temas emergentes
-- ─────────────────────────────────────────────────────────────
create table if not exists public.glossa_radar_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text,                       -- qué cae dentro y qué no; guía al clasificador
  -- Los duplicados se funden apuntando aquí en vez de borrarse, para no romper
  -- las asignaciones ya hechas.
  merged_into uuid references public.glossa_radar_topics(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
comment on table public.glossa_radar_topics is 'Radar: temas que EMERGEN del contenido, no predefinidos. merged_into funde duplicados sin perder las asignaciones.';

create table if not exists public.glossa_radar_item_topics (
  item_id uuid not null references public.glossa_radar_items(id) on delete cascade,
  topic_id uuid not null references public.glossa_radar_topics(id) on delete cascade,
  relevance text check (relevance in ('central', 'secundario')),
  created_at timestamptz not null default now(),
  primary key (item_id, topic_id)
);
create index if not exists glossa_radar_it_topic_idx on public.glossa_radar_item_topics (topic_id);

-- ─────────────────────────────────────────────────────────────
-- Dossier por tema
-- ─────────────────────────────────────────────────────────────
create table if not exists public.glossa_radar_dossiers (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.glossa_radar_topics(id) on delete cascade,
  -- Estructura: qué cruzó varias fuentes, dónde se contradicen, qué es nuevo
  -- respecto al dossier anterior, qué afirmaciones quedan sin verificar.
  body jsonb not null,
  covers_from timestamptz not null,
  covers_to timestamptz not null,
  item_count integer not null default 0,
  source_count integer not null default 0,
  -- Enlaza con el anterior para poder decir "qué cambió".
  previous_id uuid references public.glossa_radar_dossiers(id),
  -- Si de este dossier salió una pieza, queda registrado de dónde vino.
  issue_id uuid references public.glossa_issues(id),
  tokens_used integer,
  created_at timestamptz not null default now()
);
comment on table public.glossa_radar_dossiers is 'Radar: el estado de un tema en un momento. previous_id permite comparar con el anterior; issue_id registra si acabó en una pieza de Glossa.';
create index if not exists glossa_radar_dossiers_topic_idx on public.glossa_radar_dossiers (topic_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Permisos: nada de esto lo toca `anon`. Solo el worker (service key).
-- ─────────────────────────────────────────────────────────────
alter table public.glossa_radar_sources     enable row level security;
alter table public.glossa_radar_items       enable row level security;
alter table public.glossa_radar_topics      enable row level security;
alter table public.glossa_radar_item_topics enable row level security;
alter table public.glossa_radar_dossiers    enable row level security;

grant all on public.glossa_radar_sources, public.glossa_radar_items, public.glossa_radar_topics,
             public.glossa_radar_item_topics, public.glossa_radar_dossiers to service_role;

create policy glossa_radar_src_service   on public.glossa_radar_sources     for all to service_role using (true) with check (true);
create policy glossa_radar_items_service on public.glossa_radar_items       for all to service_role using (true) with check (true);
create policy glossa_radar_top_service   on public.glossa_radar_topics      for all to service_role using (true) with check (true);
create policy glossa_radar_it_service    on public.glossa_radar_item_topics for all to service_role using (true) with check (true);
create policy glossa_radar_dos_service   on public.glossa_radar_dossiers    for all to service_role using (true) with check (true);
