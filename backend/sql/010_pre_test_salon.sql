-- Día/horario/salón elegidos para la reinducción presencial (2026-09-27: se
-- agregan al pre_test existente en vez de una tabla aparte porque siempre se
-- diligencian junto con el cuestionario, o solos si la persona ya había
-- respondido antes del cambio de fecha — ver pre-test-induccion2026.html).
alter table pre_test
  add column if not exists dia      text,
  add column if not exists horario  text,
  add column if not exists salon    text;
