-- 0028 — marcar cuándo se intentó bajar los subtítulos.
--
-- Sin esto, un vídeo sin subtítulos se reintentaría en cada pasada para siempre.
-- Con la marca puesta, se intenta una vez, y si no hay, pasa al camino del vídeo
-- —que sigue funcionando— y no se vuelve a preguntar.

alter table public.glossa_radar_items
  add column if not exists captions_at timestamptz;

create index if not exists glossa_radar_items_sin_subtitulos
  on public.glossa_radar_items (created_at)
  where state = 'pending' and body_text is null and captions_at is null;

comment on column public.glossa_radar_items.captions_at is
  'Cuándo se intentó bajar los subtítulos. Con valor y sin body_text significa '
  'que el vídeo no los tiene: se analiza como vídeo y no se vuelve a intentar.';
