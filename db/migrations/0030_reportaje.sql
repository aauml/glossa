-- 0030 — el tema deja de ser una etiqueta y pasa a ser un encargo.
--
-- Hasta ahora el número se escribía con lo que dijeron los canales seguidos. Se
-- midió: 190 de 195 elementos venían de YouTube, y las diecinueve fuentes de
-- fuera que el cotejo llegó a consultar —Reuters, la BBC, congress.gov— se
-- usaron para emitir un veredicto sobre una frase y se tiraron. Ninguna llegó al
-- número.
--
-- Esto abre el sitio donde guardar lo contrario: salir a buscar un asunto en
-- otros medios y otros países, traer el texto y que ENTRE como material.

-- ── Un reportaje es un elemento más, con su procedencia dicha ─────────────
alter table public.glossa_radar_items
  drop constraint if exists glossa_radar_items_origin_check;
alter table public.glossa_radar_items
  add constraint glossa_radar_items_origin_check
  check (origin in ('feed', 'pegado', 'busqueda', 'reportaje'));

comment on column public.glossa_radar_items.origin is
  'feed = una fuente seguida; pegado = lo echo Arturo a mano; busqueda = lo encontro un monitor de tema o persona; reportaje = se salio a buscarlo por un tema de la semana.';

-- ── Se retira la tabla de dosieres ───────────────────────────────────────
-- Existe desde la 0008 y no la lee nadie: cero filas, cero llamadas. Describía
-- un dosier por tema y por día que nunca se construyó y cuyo trabajo acabó
-- haciendo el número semanal. Además cuelga de `glossa_issues`, de la capa de
-- publicación anterior al radar, así que ata dos épocas que ya no se tocan.
--
-- Se borra en vez de dejarla vacía porque una tabla cuyo comentario explica una
-- arquitectura muerta es peor que ninguna: el que venga la toma por intención y
-- construye encima.
drop table if exists public.glossa_radar_dossiers;

-- ── El registro de lo que se salió a buscar ──────────────────────────────
-- No es un dosier: es el parte de la corrida. Hace falta porque UNA AUSENCIA NO
-- TIENE FILA EN `items`. Sin esto, el número no puede escribir «se buscó sobre
-- esto y no había nada fuera», que es la mitad del valor de salir a buscar —el
-- mismo argumento que ganó `sin_hallazgo` en el cotejo—.
--
-- `label` se guarda copiado a propósito. Los temas se funden y se renombran; si
-- el parte se leyera por la etiqueta actual, un tema fusionado convertiría en
-- ilegible lo que se hizo esa semana.
create table if not exists public.glossa_radar_reportajes (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references public.glossa_radar_topics(id) on delete cascade,
  week_start   date not null,
  label        text not null,
  queries      jsonb not null default '[]'::jsonb,
  paises       text[] not null default '{}',
  rondas       int  not null default 0,
  busquedas    int  not null default 0,
  hallados     int  not null default 0,
  entran       int  not null default 0,
  colapsados   jsonb not null default '[]'::jsonb,
  dominios_vacios text[] not null default '{}',
  dispersion   numeric,
  paro         text,
  created_at   timestamptz not null default now(),
  unique (topic_id, week_start)
);

comment on table public.glossa_radar_reportajes is
  'Radar: el parte de cada salida a buscar. Una fila por tema y semana, incluidas las que no encontraron nada — que es justo lo que ninguna otra tabla puede decir.';
comment on column public.glossa_radar_reportajes.paro is
  'Por que se dejo de buscar: convergen (todos repetian el mismo relato), tope_tema, tope_semana, sin_hallazgos. Es lo que permite distinguir «no habia nada» de «no se busco mas».';
comment on column public.glossa_radar_reportajes.colapsados is
  'Que se junto y por que: casi-duplicados y despachos de agencia que varios medios llevaron. Se cuenta y se dice; un filtro que trabaja callado es indistinguible de un descubrimiento roto.';
comment on column public.glossa_radar_reportajes.dominios_vacios is
  'Dominios que devolvieron 403 o un esqueleto — casi siempre muros de pago. Se guardan porque tuercen la base de fuentes hacia agencias y radios publicas, y eso el numero tiene que poder decirlo.';

create index if not exists glossa_radar_reportajes_semana
  on public.glossa_radar_reportajes (week_start desc);

alter table public.glossa_radar_reportajes enable row level security;
grant all on public.glossa_radar_reportajes to service_role;
drop policy if exists glossa_radar_reportajes_service on public.glossa_radar_reportajes;
create policy glossa_radar_reportajes_service on public.glossa_radar_reportajes
  for all to service_role using (true) with check (true);

-- ── Topes ────────────────────────────────────────────────────────────────
-- `reportaje_busquedas_semana` cuenta BÚSQUEDAS, que es la unidad legible; el
-- contador de Tavily cuenta CRÉDITOS, y una búsqueda `advanced` vale dos.
--
-- `cap_tavily_mes` sube de 100 a 600, y 100 ya se quedaba corto antes de esto:
-- con el cotejo a 20 búsquedas por semana en `advanced` son ~172 créditos al
-- mes él solo. Lo que había era un tope que alguna etapa agotaba en silencio a
-- final de mes. Con el reportaje el modelo son ~470; 600 deja margen sin dejar
-- de hacer de tope. El plan del proveedor da 1.000, y el razonamiento de la
-- 0021 sigue en pie: un tope bajo convierte una mala configuración en «cuota
-- agotada» y no en una factura.
insert into public.glossa_radar_settings (key, value) values
  ('reportaje_busquedas_semana', '24'::jsonb),
  ('reportaje_medios',           '{}'::jsonb)
on conflict (key) do nothing;

update public.glossa_radar_settings set value = '600'::jsonb where key = 'cap_tavily_mes';
