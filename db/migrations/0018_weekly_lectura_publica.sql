-- 0018 — dejar leer al público los números YA PUBLICADOS.
--
-- `glossa_radar_weekly` sólo la tocaba `service_role`, que es lo correcto
-- mientras el número vivía únicamente en el panel. Ahora se publica en el sitio,
-- y la página pública no debe llevar ninguna llave: el sitio es estático y
-- cualquier secreto suyo sería un secreto en el navegador de cualquiera.
--
-- La política es deliberadamente estrecha. `anon` ve SELECT y sólo de las filas
-- con state='publicado'. Los borradores —que es donde se revisa antes de sacar
-- nada— siguen siendo invisibles, igual que `glossa_radar_items`, que guarda
-- material de terceros y texto pegado de suscripciones personales y no se
-- publica nunca.

create policy glossa_radar_weekly_publicos
  on public.glossa_radar_weekly
  for select
  to anon, authenticated
  using (state = 'publicado');

comment on policy glossa_radar_weekly_publicos on public.glossa_radar_weekly is
  'Lectura pública de los números publicados. Los borradores quedan fuera: la '
  'revisión antes de publicar es la única compuerta que tiene este sistema.';
