-- 0052 · La misma caja sirve para dos cosas, y hay que poder distinguirlas.
--
-- La portada ya no ofrece el boletín (queda para otra etapa): ofrece tener una
-- Glossa propia. Son dos intenciones distintas sobre la misma tabla, y sin
-- decir cuál es cada fila, el envío semanal acabaría escribiendo a gente que
-- pidió otra cosa.
alter table public.glossa_subscribers
  add column if not exists intent text not null default 'acceso'
  check (intent in ('boletin', 'acceso'));

comment on column public.glossa_subscribers.intent is
  'boletin = quiere recibir el semanal (alta en dos pasos, state=confirmado). '
  'acceso = pide tener su propia Glossa; se le contesta a mano y NUNCA entra en el envio.';

-- Lo que ya existe vino de la caja del boletín.
update public.glossa_subscribers set intent = 'boletin' where created_at < now();
