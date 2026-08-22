-- 0023 — el cotejo: salir a comprobar lo que se afirma.
--
-- Hasta ahora el número podía decir honestamente que varias voces coinciden y
-- que esa coincidencia no es corroboración. Pero no salía a comprobarlo. Un dato
-- que circula por cinco canales sin que nadie lo respalde se quedaba en «nadie
-- lo respaldó AQUÍ DENTRO», cuando la afirmación fuerte es «lo buscamos fuera y
-- no existe».
--
-- Esto es tabla nueva y no un campo del `digest`: es una relación entre una
-- afirmación y un documento externo, con deduplicación por huella de URL y
-- escrituras concurrentes. Dentro del jsonb obligaría a leer-modificar-escribir
-- sobre una columna que otro proceso puede estar reescribiendo.

create table if not exists public.glossa_radar_cotejos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.glossa_radar_items(id) on delete cascade,

  -- Una afirmación no tiene id: vive dentro de `digest->'claims'`. Se direcciona
  -- por posición Y por huella del texto. Si el episodio se vuelve a analizar, la
  -- huella deja de cuadrar y el cotejo se puede marcar obsoleto en vez de
  -- apuntar en silencio a OTRA afirmación — que sería exactamente el fallo que
  -- este sistema existe para no cometer.
  claim_idx  int  not null,
  claim_hash text not null,
  claim_text text not null,          -- copia congelada: el cotejo se lee solo

  query text not null,               -- lo que se buscó, literal

  url            text,
  title          text,
  source_domain  text,
  published_date date,
  snippet        text,
  fingerprint    text not null,      -- huella de la URL normalizada

  -- `documenta` = la página ES o reproduce un registro que dice eso.
  -- `repite`    = lo dice también, pero es comentario, agregación, o va a parar
  --               al mismo origen. Coincidir no es corroborar.
  -- `contradice`= el veredicto más valioso, y el que no se puede suavizar.
  -- `sin_hallazgo` lleva url nula a propósito: guardar «se buscó y no había
  --               nada» es lo único que permite escribir «no se pudo rastrear a
  --               ningún documento» en vez de deducirlo de una ausencia.
  verdict text not null
    check (verdict in ('documenta','repite','contradice','no_concluyente','sin_hallazgo')),
  verdict_reason text,
  independence text
    check (independence is null or independence in ('independiente','misma_orbita','desconocida')),
  gate text,                         -- qué compuerta mecánica se aplicó, si alguna

  model text,
  tokens_used int,
  state text not null default 'nuevo' check (state in ('nuevo','usado','descartado')),
  created_at timestamptz not null default now()
);

-- Un mismo documento no se guarda dos veces para la misma afirmación.
create unique index if not exists glossa_radar_cotejos_uniq
  on public.glossa_radar_cotejos (item_id, claim_idx, fingerprint);
create index if not exists glossa_radar_cotejos_item_idx
  on public.glossa_radar_cotejos (item_id);
-- Para saltarse lo ya cotejado hace poco sin volver a gastar una búsqueda.
create index if not exists glossa_radar_cotejos_hash_idx
  on public.glossa_radar_cotejos (claim_hash, created_at desc);

alter table public.glossa_radar_cotejos enable row level security;
grant all on public.glossa_radar_cotejos to service_role;
create policy glossa_radar_cotejos_service on public.glossa_radar_cotejos
  for all to service_role using (true) with check (true);

-- Los dominios donde `documenta` está permitido. Sin esta lista, un modelo llama
-- «documentado» a cualquier artículo competente, y el subrayado dorado —que
-- afirma que algo es rastreable a un registro— pasa a ser mentira en una página
-- cuya premisa entera es que no lo es.
insert into public.glossa_radar_settings (key, value) values
  ('cotejo_dominios_primarios',
   '[".gov",".gob.mx",".mil","europa.eu","un.org","who.int","imf.org","worldbank.org",
     "doi.org","arxiv.org","iaea.org","eia.gov","bls.gov","federalregister.gov",
     "supremecourt.gov","courtlistener.com","sec.gov","inegi.org.mx"]'::jsonb)
on conflict (key) do nothing;
