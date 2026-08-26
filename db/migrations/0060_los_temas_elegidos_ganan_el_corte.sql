-- ── Lo que toca un tema elegido entra primero ────────────────────────────
--
-- El número tiene un presupuesto (55.000 tokens) y la semana trae más de lo que
-- cabe: medido el 2026-08-25, 272 episodios para 135 sitios. Quién entra lo
-- decidía este peso, que contaba SOLO en cuántos temas cae cada elemento — sin
-- mirar si esos temas son los que Arturo eligió.
--
-- El resultado era un número con departamentos suyos y sin el material que los
-- llena: esa semana se cayeron 3 de Latinus, 3 de Mario Nawfal y 1 de Aristegui
-- mientras entraban episodios de temas que nadie había señalado. Elegir un tema
-- decidía el índice del número y no decidía nada sobre su contenido.
--
-- El factor 100 no es un ajuste fino: es la separación que hace que CUALQUIER
-- elemento de un tema elegido gane a cualquiera que no lo sea (el peso base de
-- un elemento muy conectado ronda 30). Entre los elegidos siguen ordenándose
-- por cuántos temas tocan y con qué centralidad, y entre los no elegidos, igual
-- que antes. No se descarta nada: lo no elegido llena lo que sobre.
create or replace function public.glossa_radar_pesos(desde timestamptz, hasta timestamptz)
returns table (item_id uuid, peso bigint)
language sql
stable
security definer
set search_path to 'public'
as $$
  select it.item_id,
         (sum(case when it.relevance = 'central' then 3 else 1 end)
          + 100 * sum(case when t.fijo and it.relevance = 'central' then 3
                           when t.fijo then 1
                           else 0 end))::bigint
    from public.glossa_radar_item_topics it
    join public.glossa_radar_items i on i.id = it.item_id
    join public.glossa_radar_topics t on t.id = it.topic_id
   where i.published_at >= desde and i.published_at < hasta
   group by it.item_id;
$$;

comment on function public.glossa_radar_pesos is
  'Radar: peso de cada elemento de la ventana. Lo que toca un tema fijado gana el corte del número por presupuesto (factor 100); dentro de cada grupo manda cuántos temas toca y su centralidad.';
