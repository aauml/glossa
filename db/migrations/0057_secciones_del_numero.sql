-- 0057 · Las secciones del número son SECTORES, no temas sueltos.
--
-- Fijar temas uno a uno tenía dos problemas: la lista cambia sola cada semana
-- (el clasificador crea asuntos nuevos y jubila otros), y con más de ocho el
-- número no cabe. Un sector no cambia nunca: es el departamento de una revista.
--
-- Y dentro de cada departamento caben UNA A TRES piezas, cada una sobre un
-- asunto con su tesis. Sin eso, una sección tan ancha como «Geopolitics & war»
-- se convertiría en un repaso —«esta semana pasaron cinco cosas»—, que es el
-- aplanamiento que esta publicación existe para no cometer.
create table if not exists public.glossa_radar_secciones (
  sector text primary key,
  activo boolean not null default false,
  -- Lo que a Arturo le interesa de este departamento, en una línea. Va al
  -- prompt: es lo que decide qué entra y qué se queda fuera cuando hay más
  -- material del que cabe.
  interes text,
  orden int not null default 100,
  updated_at timestamptz not null default now()
);

comment on table public.glossa_radar_secciones is
  'Los departamentos del numero semanal. Activo = tiene seccion siempre, y la semana que no traiga nada lo dice. `interes` es la linea que gobierna que entra dentro.';

insert into public.glossa_radar_secciones (sector, orden) values
  ('Geopolitics & war',   10),
  ('Economy & markets',   20),
  ('Energy & resources',  30),
  ('U.S. politics',       40),
  ('Latin America',       50),
  ('AI & technology',     60),
  ('Media & information', 70),
  ('Justice & crime',     80),
  ('Society & culture',   90),
  ('Other',              100)
on conflict (sector) do nothing;

alter table public.glossa_radar_secciones enable row level security;
grant all on public.glossa_radar_secciones to service_role;
create policy glossa_secciones_service on public.glossa_radar_secciones
  for all to service_role using (true) with check (true);

-- El material de la semana, agrupado POR SECTOR: lo que el número necesita para
-- escribir cada departamento sin tener que resolver la agrupación en el prompt.
create or replace function public.glossa_radar_material_por_sector(desde timestamptz, hasta timestamptz)
returns table (sector text, topic_id uuid, label text, n_items bigint, n_canales bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(t.sector, 'Other') as sector, t.id, t.label,
         count(distinct i.id)                                         as n_items,
         count(distinct i.source_id) filter (where i.origin = 'feed')  as n_canales
    from public.glossa_radar_topics t
    join public.glossa_radar_item_topics it on it.topic_id = t.id
    join public.glossa_radar_items i on i.id = it.item_id
   where t.merged_into is null
     and i.state = 'digested' and i.origin <> 'pieza'
     and i.published_at >= desde and i.published_at < hasta
   group by t.sector, t.id
  having count(distinct i.id) >= 2
   order by 1, 4 desc;
$$;

revoke all on function public.glossa_radar_material_por_sector(timestamptz, timestamptz) from public;
grant execute on function public.glossa_radar_material_por_sector(timestamptz, timestamptz) to service_role;
