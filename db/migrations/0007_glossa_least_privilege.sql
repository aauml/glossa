-- Glossa · migración 0007 — mínimo privilegio y políticas coherentes
-- NO aplicada todavía. Va emparejada con el cambio de los workers a service key
-- y con la cabecera `x-glossa-token` en las edge functions: aplicar solo una de
-- las dos mitades deja el sistema o roto o abierto.
--
-- Qué corrige:
--   1) La cola de publicación deja de ser escribible por `anon` a ciegas. El
--      worker ya no usa la anon key; escribe con la service key desde Secrets.
--   2) Las políticas duplicadas y las que apuntan a `public` se sustituyen por
--      políticas por rol explícito, SIN tocar quién puede escribir.
--   3) Se devuelven las escrituras de procedencia que `skills/SKILL.md` necesita
--      (avanzar el estado de un issue, registrar targets) SOLO a `authenticated`.
--
-- DECISIÓN A CONFIRMAR (§3): se conceden a `authenticated`, no a `anon`. Con
-- `anon` cualquiera en internet podría inyectar procedencia falsa, que es
-- justo la prueba en la que descansa el proyecto. Si el conector del chat
-- resulta ser `anon` y no `authenticated`, la salida correcta NO es abrir anon:
-- es llevar esas escrituras al payload de `glossa-enqueue`, que ya corre con
-- service key detrás del token.

-- ─────────────────────────────────────────────────────────────
-- 1) Cola de publicación / research — anon solo encola y consulta
-- ─────────────────────────────────────────────────────────────
-- (Ya es el estado de hecho desde el 2026-07-01; lo dejamos escrito y explícito
--  en vez de depender de un revoke manual que nadie registró.)

revoke update on public.glossa_publish_requests  from anon, authenticated;
revoke update on public.glossa_research_requests from anon, authenticated;

drop policy if exists glossa_pub_anon_update on public.glossa_publish_requests;
drop policy if exists glossa_pub_auth_update on public.glossa_publish_requests;
drop policy if exists glossa_res_anon_update on public.glossa_research_requests;
drop policy if exists glossa_res_auth_update on public.glossa_research_requests;

-- ─────────────────────────────────────────────────────────────
-- 2) glossa_candidates — solo quitar el duplicado exacto
-- ─────────────────────────────────────────────────────────────
-- Esta tabla la consume el dashboard de `aauml/thesis` (marcar un candidato como
-- copiado/descartado), no la ruta de publicación de Glossa. Tenía DOS políticas
-- de UPDATE idénticas, una sobre el rol `public` y otra sobre `anon,authenticated`.
-- Se elimina la de `public` —redundante y más amplia de lo que nadie pidió— y se
-- deja intacta la otra: restringir el UPDATE a `authenticated` rompería el
-- dashboard, y esa decisión no es de este repo.

drop policy if exists glossa_cand_anon_update on public.glossa_candidates;   -- to public; duplicada
drop policy if exists glossa_cand_anon_select on public.glossa_candidates;   -- to public
create policy glossa_cand_read on public.glossa_candidates
  for select to anon, authenticated using (true);

-- ─────────────────────────────────────────────────────────────
-- 3) Procedencia — escrituras que el skill necesita, por rol explícito
-- ─────────────────────────────────────────────────────────────

drop policy if exists glossa_issue_targets_read on public.glossa_issue_targets;  -- era to public

revoke all on public.glossa_issue_targets from anon, authenticated;
grant select         on public.glossa_issue_targets to anon, authenticated;
grant insert, delete on public.glossa_issue_targets to authenticated;
grant all            on public.glossa_issue_targets to service_role;

create policy glossa_tgt_service_all on public.glossa_issue_targets
  for all to service_role using (true) with check (true);
create policy glossa_tgt_read on public.glossa_issue_targets
  for select to anon, authenticated using (true);
create policy glossa_tgt_auth_insert on public.glossa_issue_targets
  for insert to authenticated with check (true);
-- Reasignar el target de una pieza = borrar y volver a insertar (hay unique).
create policy glossa_tgt_auth_delete on public.glossa_issue_targets
  for delete to authenticated using (true);

-- glossa_issues: el skill avanza status seed->researching->drafting->published.
grant update on public.glossa_issues to authenticated;
create policy glossa_issues_auth_update on public.glossa_issues
  for update to authenticated using (true) with check (true);
