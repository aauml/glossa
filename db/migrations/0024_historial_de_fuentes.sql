-- 0024 — el sistema empieza a aprender de lo que él mismo comprobó.
--
-- El cotejo produce algo poco común: verdad medida sobre juicios anteriores del
-- propio sistema. Cuando el análisis marcó una afirmación como «documentada» y
-- el cotejo no encontró ningún registro primario que la sostenga, eso no es una
-- opinión sobre nada: es un error de calibración, contado.
--
-- Esto expone dos recuentos. NO cambia ningún comportamiento por su cuenta —esa
-- es la línea deliberada—: alimenta al número y al panel para que quien escriba
-- lo sepa. Un sistema que reescribe sus propias instrucciones según resultados
-- deriva, y la deriva es invisible porque lo que la notaría es justo lo que
-- cambió.

-- ── Cómo le va a cada fuente cuando se la comprueba ───────────────────────
-- Es un recuento, no un juicio. «De 14 afirmaciones comprobadas, 1 documentada,
-- 9 solo repetidas, 2 contradichas» dice algo que ninguna lectura del canal
-- puede decir, y lo dice sin adjetivos.
create or replace function public.glossa_radar_historial_fuentes()
returns table (
  source_id uuid, name text, kind text,
  comprobadas bigint, documentadas bigint, repetidas bigint,
  contradichas bigint, sin_rastro bigint, independientes bigint,
  desde timestamptz
)
language sql
security definer
set search_path to 'public'
as $$
  select s.id, s.name, s.kind,
         count(c.id)                                                   as comprobadas,
         count(*) filter (where c.verdict = 'documenta')               as documentadas,
         count(*) filter (where c.verdict = 'repite')                  as repetidas,
         count(*) filter (where c.verdict = 'contradice')              as contradichas,
         count(*) filter (where c.verdict = 'sin_hallazgo')            as sin_rastro,
         count(*) filter (where c.independence = 'independiente')      as independientes,
         min(c.created_at)                                             as desde
    from public.glossa_radar_sources s
    join public.glossa_radar_items i on i.source_id = s.id
    join public.glossa_radar_cotejos c on c.item_id = i.id
   group by s.id
  having count(c.id) > 0
   order by count(*) filter (where c.verdict = 'contradice') desc, count(c.id) desc;
$$;

-- ── Cómo de bien calibra el análisis ──────────────────────────────────────
-- El análisis etiqueta cada afirmación como afirmada, atribuida o documentada.
-- El cotejo comprueba por su cuenta si hay un registro detrás. Donde discrepan
-- de forma sistemática, el que se está equivocando es el análisis.
--
-- El caso que importa: «documentado» según el análisis, sin registro primario
-- según el cotejo. Ese es el error que pone un subrayado dorado que no toca.
create or replace function public.glossa_radar_calibracion()
returns table (
  etiqueta_analisis text, comprobadas bigint,
  confirmadas bigint, solo_repetidas bigint, contradichas bigint
)
language sql
security definer
set search_path to 'public'
as $$
  select coalesce(i.digest->'claims'->c.claim_idx->>'status', 'sin etiqueta') as etiqueta_analisis,
         count(*)                                            as comprobadas,
         count(*) filter (where c.verdict = 'documenta')      as confirmadas,
         count(*) filter (where c.verdict = 'repite')         as solo_repetidas,
         count(*) filter (where c.verdict = 'contradice')     as contradichas
    from public.glossa_radar_cotejos c
    join public.glossa_radar_items i on i.id = c.item_id
   group by 1
   order by count(*) desc;
$$;

revoke all on function public.glossa_radar_historial_fuentes() from public;
revoke all on function public.glossa_radar_calibracion() from public;
grant execute on function public.glossa_radar_historial_fuentes() to service_role;
grant execute on function public.glossa_radar_calibracion() to service_role;
