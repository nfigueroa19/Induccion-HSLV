-- Tercer estado del interruptor del portal: abierto SOLO para quienes tienen
-- asistencia registrada (tabla `asistencia`, campaña activa). Con
-- cerrado = false y solo_asistentes = true, el backend deja pasar únicamente las
-- cédulas con fila en `asistencia`; el resto recibe el mismo 410 de "cerrado".
-- Es seguro correrlo dos veces.

alter table config_portal
  add column if not exists solo_asistentes boolean not null default false;
