-- Glossa · migración 0001 — capa de publicación sobre phd-kb
-- Aplicada a Supabase project phd-kb (wtwuvrtmadnlezkbesqp) el 2026-06-30 (success).
-- Additive-only: crea tablas glossa_*; no modifica ni borra nada existente.
-- Reversión: drop table public.glossa_issue_sources, public.glossa_issues, public.glossa_seeds;

create table if not exists public.glossa_seeds (
  id uuid primary key default gen_random_uuid(),
  authored_by text not null default 'Arturo',
  mode text not null default 'tesis',            -- tesis|fuente|pregunta|vigilancia|dialectica|serie
  track text not null default 'general',          -- general|thesis|ai-policy|finance|geopolitics
  thesis text,                                    -- hipotesis / angulo (autoria humana)
  notes text,
  origin_finding_id bigint references public.monitor_findings(id),
  origin_conversation_id integer references public.reading_conversations(id),
  origin_kb_id uuid references public.evaluated_items(pk),
  created_at timestamptz not null default now()   -- fechada = ancla de autoria
);
comment on table public.glossa_seeds is 'Glossa: intencion humana fechada que ancla cada pieza (autoria). Origenes opcionales a monitor_findings / reading_conversations / evaluated_items.';

create table if not exists public.glossa_issues (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  issue_no text,
  track text not null default 'general',
  mode text,
  status text not null default 'seed',            -- seed->researching->drafting->review->published
  title_en text,
  title_es text,
  dek_en text,
  dek_es text,
  topics text[] not null default '{}',
  chapters smallint[] not null default '{}',      -- capitulos de tesis relacionados
  seed_id uuid references public.glossa_seeds(id),
  model text,
  url_en text,
  url_es text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.glossa_issues is 'Glossa: un articulo/lectura y su estado de pipeline. Bilingue EN/ES.';

create table if not exists public.glossa_issue_sources (
  id bigint generated always as identity primary key,
  issue_id uuid not null references public.glossa_issues(id) on delete cascade,
  source_kb_id uuid references public.evaluated_items(pk),
  role text,                                      -- primary|support|context|discourse
  claim text,                                     -- que afirmacion respalda
  verified text,                                  -- si|no|parcial
  created_at timestamptz not null default now(),
  unique (issue_id, source_kb_id)
);
comment on table public.glossa_issue_sources is 'Glossa: procedencia. Une cada issue con fuentes del KB (evaluated_items).';

create index if not exists glossa_issues_status_idx on public.glossa_issues(status);
create index if not exists glossa_issue_sources_issue_idx on public.glossa_issue_sources(issue_id);
create index if not exists glossa_seeds_finding_idx on public.glossa_seeds(origin_finding_id);

alter table public.glossa_seeds enable row level security;
alter table public.glossa_issues enable row level security;
alter table public.glossa_issue_sources enable row level security;
