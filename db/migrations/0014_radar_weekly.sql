-- 0014 — recuperada de la base el 2026-08-22.
--
-- Esta migración se aplicó en producción pero nunca llegó al repo: el
-- historial saltaba de la 0009 a la 0016, así que el esquema no se podía
-- reconstruir desde aquí. El SQL es el que Supabase guardó al aplicarla.

-- Glossa · migración 0014 — el número semanal
--
-- Reúne lo acumulado por tema durante la semana y produce un número: una sección
-- por tema, con en qué coinciden las fuentes, dónde se contradicen, qué es nuevo
-- respecto al número anterior y qué no está diciendo nadie.
--
-- Sigue sin publicarse solo salvo que el interruptor `auto_publish` esté
-- encendido, y ese interruptor se decide viendo el primer número.

create table if not exists public.glossa_radar_weekly (
  id uuid primary key default gen_random_uuid(),
  -- Lunes de la semana que cubre. Único: un número por semana, y reconstruirlo
  -- actualiza el mismo en vez de acumular borradores.
  week_start date not null unique,
  week_end date not null,
  -- {sections:[{topic, summary, converged, conflicts, new_since_last,
  --             unverified, blind_spots, angles, items:[...]}], intro}
  body jsonb not null,
  state text not null default 'borrador' check (state in ('borrador','publicado','descartado')),
  item_count integer not null default 0,
  topic_count integer not null default 0,
  -- De qué número viene, para poder decir qué cambió.
  previous_id uuid references public.glossa_radar_weekly(id),
  -- Si acabó en una pieza de Glossa, queda registrado de dónde salió.
  issue_id uuid references public.glossa_issues(id),
  tokens_used integer,
  generated_at timestamptz not null default now(),
  published_at timestamptz
);
comment on table public.glossa_radar_weekly is 'Radar: el numero de la semana, una seccion por tema. Borrador hasta que Arturo lo publica, salvo que auto_publish este encendido.';

create index if not exists glossa_radar_weekly_state_idx on public.glossa_radar_weekly (state, week_start desc);

alter table public.glossa_radar_weekly enable row level security;
grant all on public.glossa_radar_weekly to service_role;
drop policy if exists glossa_radar_weekly_service on public.glossa_radar_weekly;
create policy glossa_radar_weekly_service on public.glossa_radar_weekly
  for all to service_role using (true) with check (true);

-- Qué temas tienen material suficiente en la ventana.
--
-- El umbral cuenta VOCES DISTINTAS, no fuentes. Un canal de entrevistas trae
-- diez invitados por semana: exigir dos feeds distintos bloquearía todo mientras
-- solo haya uno dado de alta, y editorialmente lo que importa es que hablen
-- personas distintas, no que vengan de RSS distintos.
create or replace function public.glossa_radar_temas_semana(desde timestamptz, hasta timestamptz)
  returns table (topic_id uuid, label text, n_items bigint, n_voces bigint)
  language sql
  security definer
  set search_path to 'public'
as $$
  select t.id, t.label, count(distinct i.id),
         count(distinct v.voz)
  from public.glossa_radar_topics t
  join public.glossa_radar_item_topics it on it.topic_id = t.id
  join public.glossa_radar_items i on i.id = it.item_id
  left join lateral jsonb_array_elements_text(coalesce(i.digest->'speakers','[]'::jsonb)) as v(voz) on true
  where t.merged_into is null
    and i.state = 'digested'
    and i.published_at >= desde and i.published_at < hasta
  group by t.id, t.label
  having count(distinct i.id) >= 2
  order by count(distinct i.id) desc;
$$;

revoke all on function public.glossa_radar_temas_semana(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.glossa_radar_temas_semana(timestamptz, timestamptz) to service_role;
