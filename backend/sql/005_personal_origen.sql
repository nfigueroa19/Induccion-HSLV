-- Distingue el roster verificado de RR.HH. (carga inicial desde
-- Personal_Susana.xlsx, ver Segundo Cerebro/01 - Arquitectura/Analisis y
-- mapeo de Personal_Susana.xlsx.md) de las filas que se autocompletan desde
-- asistencia.html cuando alguien no aparece en el roster. `personal` sigue
-- siendo la fuente de verdad, pero ahora queda claro qué fila fue verificada
-- por RR.HH. y cuál se autorregistró en el evento.

alter table personal
  add column if not exists origen text not null default 'rrhh';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'personal_origen_check'
  ) then
    alter table personal
      add constraint personal_origen_check
      check (origen in ('rrhh', 'autorregistro'));
  end if;
end $$;

-- Las 1632 filas ya cargadas vienen todas del Excel de RR.HH.
update personal set origen = 'rrhh' where origen is distinct from 'rrhh';
