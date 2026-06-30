-- Glossa · migración 0004 — cubrir el rol `authenticated`
-- Aplicada a Supabase project phd-kb (wtwuvrtmadnlezkbesqp) el 2026-06-30.
-- El conector de Supabase del chat puede autenticar como `authenticated` (no solo `anon`).
-- Espejamos los grants/políticas de anon para que la lectura/escritura funcione en ambos roles.
-- (Publicar desde chat usa además la edge function pública `glossa-enqueue`, que no depende del rol.)

grant select, insert         on public.glossa_seeds            to authenticated;
grant select, insert, update on public.glossa_issues           to authenticated;
grant select, insert         on public.glossa_issue_sources    to authenticated;
grant select, insert, update on public.glossa_publish_requests to authenticated;

create policy glossa_seeds_auth_insert on public.glossa_seeds for insert to authenticated with check (true);
create policy glossa_seeds_auth_select on public.glossa_seeds for select to authenticated using (true);

create policy glossa_issues_auth_insert on public.glossa_issues for insert to authenticated with check (true);
create policy glossa_issues_auth_select on public.glossa_issues for select to authenticated using (true);
create policy glossa_issues_auth_update on public.glossa_issues for update to authenticated using (true) with check (true);

create policy glossa_isrc_auth_insert on public.glossa_issue_sources for insert to authenticated with check (true);
create policy glossa_isrc_auth_select on public.glossa_issue_sources for select to authenticated using (true);

create policy glossa_pub_auth_insert on public.glossa_publish_requests for insert to authenticated with check (true);
create policy glossa_pub_auth_select on public.glossa_publish_requests for select to authenticated using (true);
create policy glossa_pub_auth_update on public.glossa_publish_requests for update to authenticated using (true) with check (true);
