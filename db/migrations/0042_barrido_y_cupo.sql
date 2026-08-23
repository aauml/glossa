-- 0042 · El barrido gratis y el cupo que se administra solo
--
-- Las fuentes van a seguir creciendo. Más fuentes son más asuntos, y más asuntos
-- sobre el mismo cupo mensual de Tavily significan menos por asunto — salvo que
-- alguien lo reparta. Esto es lo que hace falta guardar para que se reparta.
--
-- El cambio de fondo: TODOS los temas salen a la calle, no los seis mayores.
-- Puede hacerse porque la primera pasada no cuesta nada (Google News RSS: sin
-- clave, sin cupo, ~600 ms). Lo que devuelve es el censo —quién cubrió el
-- asunto, desde qué país, con qué titular— y no el texto, que va cifrado. Con
-- eso basta para la única pregunta de esa fase: ¿merece la pena PAGAR por leer
-- esto? Si cuarenta medios de cinco países titulan lo mismo, no.

alter table public.glossa_radar_reportajes
  add column if not exists barrido  jsonb not null default '{}'::jsonb,
  add column if not exists urgencia jsonb not null default '{}'::jsonb,
  add column if not exists cuota    int   not null default 0;

comment on column public.glossa_radar_reportajes.barrido is
  'El censo gratis de Google News: cuantas notas, cuantos medios, que paises, y el acuerdo entre titulares del mismo idioma (0 a 1). No es citable —solo trae titular, medio y fecha— y por eso vive aqui y no en glossa_radar_items.';
comment on column public.glossa_radar_reportajes.urgencia is
  'Lo que se decidio con el barrido: nivel 0 a 3 y el porque. Nivel 0 = corroborado en varios paises, no se gasta. Ese cero es lo que financia los de nivel 3.';
comment on column public.glossa_radar_reportajes.cuota is
  'Busquedas de pago que le tocaron a este tema en el reparto de la semana. Cero es un resultado, no un salto: significa comprobado gratis.';

-- `paro` gana un valor: el tema que no necesito comprarse.
comment on column public.glossa_radar_reportajes.paro is
  'Por que se dejo de buscar: corroborado_gratis (el barrido ya lo confirmo en varios paises: no se gasto nada), convergen (todos repetian el mismo relato), tope_tema, tope_semana, sin_hallazgos. Es lo que permite distinguir «no habia nada» de «no se busco mas» y de «no hizo falta».';

-- Los ajustes. Ninguno es ya el motor del gasto: son techos. El motor es el cupo
-- real que Tavily dice que queda, repartido entre las semanas que faltan.
insert into public.glossa_radar_settings (key, value) values
  ('reportaje_temas_barrido',   '14'),
  ('reportaje_entran_semana',   '24'),
  ('tavily_dia_reset',          '1')
on conflict (key) do nothing;

update public.glossa_radar_settings
   set value = '60'
 where key = 'reportaje_busquedas_semana' and value::int < 60;
