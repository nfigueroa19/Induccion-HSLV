-- El dashboard agrupaba por respuestas.area (la categoría de servicio que el
-- colaborador elige a mano en el formulario). Se cambia a personal.proceso
-- (columna respuestas.servicio, copiada del roster en 006_respuestas_perfil_
-- roster.sql) porque es el dato oficial de RR.HH., no una elección libre.
--
-- No todas las filas tienen servicio (el roster no siempre matchea la
-- cédula, ver 006): para esas se imputa la moda de servicio entre las demás
-- respuestas de la MISMA área -- y si esa área tampoco tiene ninguna fila
-- con servicio, se deja el área como último recurso en vez de dejar la fila
-- fuera del reporte.
--
-- drop + create porque cambia el nombre de columna (area -> proceso) y
-- Postgres no permite eso con create or replace (error 42P16).
drop view if exists v_agregado_area;
drop view if exists v_componentes_area;

create view v_agregado_area as
with moda as (
  select area, campana,
         mode() within group (order by servicio) as proceso_moda
    from respuestas
   where servicio is not null and servicio <> ''
   group by area, campana
)
select coalesce(r.servicio, m.proceso_moda, r.area) as proceso,
       r.campana,
       count(*)                        as n,
       round(avg(d.porcentaje_global)) as promedio,
       min(d.porcentaje_global)        as minimo,
       max(d.porcentaje_global)        as maximo
  from diagnosticos d
  join respuestas r on r.id = d.respuesta_id
  left join moda m on m.area = r.area and m.campana = r.campana
 group by coalesce(r.servicio, m.proceso_moda, r.area), r.campana;

create view v_componentes_area as
with moda as (
  select area, campana,
         mode() within group (order by servicio) as proceso_moda
    from respuestas
   where servicio is not null and servicio <> ''
   group by area, campana
)
select coalesce(r.servicio, m.proceso_moda, r.area) as proceso,
       r.campana,
       c ->> 'id'                              as componente_id,
       c ->> 'nombre'                          as componente,
       count(*)                                as n,
       round(avg((c ->> 'nivel')::numeric), 2) as nivel_promedio
  from diagnosticos d
  join respuestas r on r.id = d.respuesta_id
  left join moda m on m.area = r.area and m.campana = r.campana
  cross join lateral jsonb_array_elements(d.payload -> 'componentes') as c
 group by coalesce(r.servicio, m.proceso_moda, r.area), r.campana, c ->> 'id', c ->> 'nombre';
