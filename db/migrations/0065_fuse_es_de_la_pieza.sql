-- 0065 · El veredicto del español de la pieza queda escrito.
--
-- El semanal ya guardaba su fusible español en `glossa_radar_weekly.fuse_es`.
-- La pieza suelta no guardaba nada: la edición española se elegía por «el
-- primer modelo que no dio error HTTP» y nadie podía ver después qué contrato
-- pasó ni con cuántos intentos. Desde la auditoría del 2026-08-31 la pieza
-- corre el mismo bucle validado (revisor_es.mjs: determinista + revisor de
-- estilo) y su veredicto se escribe aquí, con la misma forma que el del
-- semanal: { deterministico, revisor, intentos, ran_at }.
--
-- Lo lee el panel (/admin), que es el único consumidor: cifras con verbo, sin
-- mandos nuevos. No cambia ningún flujo — es memoria, no compuerta.

alter table public.glossa_issues
  add column if not exists fuse_es jsonb;

comment on column public.glossa_issues.fuse_es is
  'Veredicto de la edición española: {deterministico, revisor, intentos, ran_at}. Lo escribe scripts/pieza_from_supabase.mjs.';
