-- Agrega `entidad` (empresa/cooperativa que contrata a la persona, ej. SSC,
-- ASIES, HSLV directo) al roster `personal`. Viene del Excel de RR.HH. de
-- julio 2026 (`base datos reinduccion.xlsx`) y no tenía equivalente en la
-- carga anterior (Personal_Susana.xlsx). Ver Segundo Cerebro/05 - Motor IA/
-- Documentacion institucional (comparación de rosters, 2026-09-11).

alter table personal
  add column if not exists entidad text;
