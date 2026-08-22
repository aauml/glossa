-- 0026 — el veredicto del fusible viaja con el número.
--
-- Guardarlo importa por lo que permite después: comparar durante unas semanas lo
-- que el fusible habría decidido con lo que Arturo decidió de verdad. Encender
-- la publicación automática el mismo día que el fusible estrena sería hacer que
-- su primera prueba real fuese también la primera sin supervisión.

alter table public.glossa_radar_weekly
  add column if not exists fuse jsonb,
  add column if not exists cotejo_count int not null default 0;

comment on column public.glossa_radar_weekly.fuse is
  'Veredicto del fusible: {ok, ran_at, fallos:[{regla,detalle,grave}]}. Un fallo '
  'grave impide publicar en automático, NUNCA a una persona: alguien puede pasar '
  'por encima, la automatización no.';
