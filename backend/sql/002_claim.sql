-- La cola: toma un lote de respuestas pendientes de forma segura entre varios
-- workers en paralelo. Ejecutar después de 001_schema.sql.
--
-- Tres propiedades importantes:
--   1. FOR UPDATE SKIP LOCKED  -> dos workers jamás toman la misma fila.
--   2. lease (visible_desde)   -> si el worker muere a mitad de una llamada,
--                                 la fila se libera sola y otro la retoma.
--   3. intentos < 5            -> cola de muertos automática.

create or replace function claim_respuestas(p_lote int, p_lease_seg int default 180)
returns table (id uuid, area text, perfil text, texto text, intentos smallint)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update respuestas r
     set estado         = 'procesando',
         intentos       = r.intentos + 1,
         visible_desde  = now() + make_interval(secs => p_lease_seg),
         actualizado_en = now()
   where r.id in (
     select r2.id
       from respuestas r2
      where r2.estado in ('pendiente', 'procesando')
        and r2.visible_desde <= now()
        and r2.intentos < 5
      order by r2.creado_en
        for update skip locked
      limit p_lote
   )
  returning r.id, r.area, r.perfil, r.texto, r.intentos;
end;
$$;

revoke all on function claim_respuestas(int, int) from public, anon, authenticated;


-- Conteo de la cola para monitoreo el día del evento. Sin datos personales.
create or replace function estado_cola(p_campana text)
returns table (estado text, n bigint)
language sql
security definer
set search_path = public
as $$
  select r.estado::text, count(*)
    from respuestas r
   where r.campana = p_campana
   group by r.estado;
$$;

revoke all on function estado_cola(text) from public, anon, authenticated;
