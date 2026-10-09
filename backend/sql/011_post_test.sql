-- Post-test (cierre) de la reinducción 2026: mismas 21 preguntas y misma clave
-- que `pre_test`, presentadas en otro orden (web/cierre.html). Igual que
-- `pre_test`, guarda solo cédula + puntaje + respuestas; los datos de la
-- persona viven en `personal`. Una fila por (campana, cedula): no se
-- sobrescribe, el primer envío es el que cuenta.
create table if not exists post_test (
  id             uuid primary key default gen_random_uuid(),
  campana        text not null,
  cedula         bigint not null,
  puntuacion     smallint,
  pregunta_01    text,
  pregunta_02    text,
  pregunta_03    text,
  pregunta_04    text,
  pregunta_05    text,
  pregunta_06    text,
  pregunta_07    text,
  pregunta_08    text,
  pregunta_09    text,
  pregunta_10    text,
  pregunta_11    text,
  pregunta_12    text,
  pregunta_13    text,
  pregunta_14    text,
  pregunta_15    text,
  pregunta_16    text,
  pregunta_17    text,
  pregunta_18    text,
  pregunta_19    text,
  pregunta_20    text,
  pregunta_21    text,
  creado_en      timestamptz not null default now(),
  unique (campana, cedula)
);

-- Solo-backend, igual que `pre_test`: RLS activo y sin políticas.
alter table post_test enable row level security;
