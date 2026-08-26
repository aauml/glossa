-- 0059 · Qué pasó con TODO lo que llegó, a la vista.
--
-- La pregunta que lo motiva es legítima y no se puede contestar con «confía»:
-- ¿cómo sabe uno que el sistema no está descartando cosas en silencio? Se sabe
-- viendo la cuenta entera — leídos y descartados, cada descarte con su motivo —
-- sin tener que pedirla.
--
-- Cada elemento aparece en UNA sola fila: si la suma no cuadra con lo que llegó,
-- el propio panel lo delata.
create or replace function public.glossa_radar_cobertura(dias int default 7)
returns table (que_paso text, veces bigint, orden int)
language sql
stable
security definer
set search_path to 'public'
as $$
  select q.que_paso, count(*), min(q.orden)::int
    from (
      select case
               when i.state = 'digested' then 'read'
               when i.state = 'pending'  then 'in the queue'
               when i.state = 'error'    then 'failed'
               when i.error ~ 'dura \d+h\d+m' or i.error like '%retransmisión cruda%'
                                          then 'skipped: over 3 h of raw broadcast'
               when i.error ~ 'dura \d+m\d+s' then 'skipped: under 5 min (a short)'
               when i.error like '%directo%' then 'skipped: live, nothing to analyse yet'
               when i.error like 'sin texto%' or i.error like 'sin poder leerse%'
                                          then 'skipped: no readable text (paywall or JS page)'
               when i.error like 'sin acceso%' then 'skipped: YouTube would not let us in'
               else 'skipped: ' || left(coalesce(i.error, 'no reason recorded'), 40)
             end as que_paso,
             case when i.state = 'digested' then 1 when i.state = 'pending' then 2 else 3 end as orden
        from public.glossa_radar_items i
       where i.published_at > now() - make_interval(days => dias)
         and i.origin = 'feed'
    ) q
   group by q.que_paso
   order by min(q.orden), count(*) desc;
$$;

revoke all on function public.glossa_radar_cobertura(int) from public;
grant execute on function public.glossa_radar_cobertura(int) to service_role;
