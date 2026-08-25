-- 0051 · El boletín: quien quiera, recibe lo de la semana por correo.
--
-- Una vez por semana, el domingo: el número y las piezas publicadas esos siete
-- días. Nada más. Sin anuncios, sin seguimiento de aperturas, sin «te puede
-- interesar».
--
-- Alta en DOS pasos, y no es ceremonia: sin confirmar, cualquiera puede
-- apuntar la dirección de otro, y esa dirección recibiría correo que no pidió
-- hasta que se dé de baja. El primer correo es el que pregunta.
--
-- El `token` sirve para confirmar Y para darse de baja: es un secreto que solo
-- viaja al buzón de esa persona. Uno solo en vez de dos porque un segundo no
-- añade nada — quien tiene el correo tiene los dos poderes de todos modos.

create table if not exists public.glossa_subscribers (
  id uuid primary key default gen_random_uuid(),
  -- En minúsculas SIEMPRE, y único: «Hola@…» y «hola@…» son el mismo buzón, y
  -- sin esto la misma persona recibiría dos copias de cada número.
  email text not null unique check (position('@' in email) > 1 and email = lower(email)),
  lang text not null default 'en' check (lang in ('en', 'es')),
  state text not null default 'pendiente' check (state in ('pendiente', 'confirmado', 'baja')),
  token uuid not null default gen_random_uuid(),
  -- De dónde salió el alta. Si algún día llega una queja, esto dice si vino de
  -- la portada española, de la inglesa o de otra parte.
  origen text,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  unsubscribed_at timestamptz,
  last_sent_at  timestamptz
);

comment on table public.glossa_subscribers is
  'Boletín de Glossa: una entrega semanal con el número y las piezas de esos '
  'siete días. Alta en dos pasos; el token confirma y también da de baja.';

create index if not exists glossa_subs_envio_idx
  on public.glossa_subscribers (state) where state = 'confirmado';
create unique index if not exists glossa_subs_token_idx
  on public.glossa_subscribers (token);

-- Nadie toca esto salvo el worker y la edge function, las dos con service key.
-- `anon` no puede ni leer la lista (sería una fuga de direcciones) ni escribir
-- en ella: el alta pasa por la función, que valida y manda el correo.
alter table public.glossa_subscribers enable row level security;
grant all on public.glossa_subscribers to service_role;
create policy glossa_subs_service on public.glossa_subscribers
  for all to service_role using (true) with check (true);

-- Ajustes del boletín, para poder pararlo sin desplegar nada.
insert into public.glossa_radar_settings (key, value) values
  ('boletin_activo', 'true'::jsonb),
  ('boletin_remitente', '"Glossa <glossa@ademas.ai>"'::jsonb)
on conflict (key) do nothing;
