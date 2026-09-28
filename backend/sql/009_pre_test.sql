-- Pre-test de reinducción 2026 (antes en Google Forms, se está llevando al
-- aplicativo). Guarda únicamente cédula + puntaje + respuesta a cada
-- pregunta del cuestionario de conocimiento — nada de datos personales o
-- institucionales (nombre, correo, empresa/sindicato, proceso/servicio,
-- perfil): esos ya viven en `personal`, se relacionan por `cedula`.
--
-- `campana` sigue la misma convención que `respuestas`/`asistencia`
-- (CAMPANA=carga-prueba en pruebas, "2026" en el evento real).
create table if not exists pre_test (
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

comment on column pre_test.pregunta_01 is 'Enuncie el momento de higiene de manos, según la clasificación de la OMS, con mayor adherencia en la institución';
comment on column pre_test.pregunta_02 is 'Mencione los elementos que facilitan la comunicación entre el equipo de trabajo orientados a alertar precozmente sobre el deterioro clínico del paciente';
comment on column pre_test.pregunta_03 is 'Mencione dos elementos que facilitan la comunicación entre los procesos asistenciales y administrativos';
comment on column pre_test.pregunta_04 is '¿Cuál fue el ultimo simulacro de emergencias y desastres que realizo el hospital?';
comment on column pre_test.pregunta_05 is 'Enuncie dos mecanismos que la institución ha implementado para prevenir cansancio del personal asistencial en contacto permanente con el paciente';
comment on column pre_test.pregunta_06 is '¿Cada cuanto se realiza la reinducción institucional?';
comment on column pre_test.pregunta_07 is 'Mencione dos temas contenidos en la inducción';
comment on column pre_test.pregunta_08 is 'Cuales son las líneas de la política de humanización';
comment on column pre_test.pregunta_09 is 'Mencione elementos de la política de humanización hacia el usuario y su familia';
comment on column pre_test.pregunta_10 is 'Mencione dos elementos de la política de humanización hacia el trabajador';
comment on column pre_test.pregunta_11 is 'Mencione que acciones propician la relación humanizada entre el equipo de salud y el usuario y su familia';
comment on column pre_test.pregunta_12 is 'Mencione dos acciones que evidencien la humanización en la relación entre compañeros subalternos y jefes';
comment on column pre_test.pregunta_13 is 'Mencione dos mecanismos que faciliten la comunicación entre el jefe y sus subalternos, en doble vía';
comment on column pre_test.pregunta_14 is 'El código de integridad incluye';
comment on column pre_test.pregunta_15 is '¿Cada cuanto el hospital realiza encuestas para medir la adherencia a la cultura organizacional?';
comment on column pre_test.pregunta_16 is 'Mencione dos elementos de la cultura organizacional que aplica diariamente en sus actividades';
comment on column pre_test.pregunta_17 is '¿Cuál es el objetivo principal de la gestión financiera del Hospital?';
comment on column pre_test.pregunta_18 is '¿Cuál de las siguientes actividades NO hace parte del ciclo de la gestión financiera del Hospital?';
comment on column pre_test.pregunta_19 is '¿Qué busca prevenir y administrar la Política SARLAFT del Hospital Susana López de Valencia E.S.E.?';
comment on column pre_test.pregunta_20 is '¿Cuál de las siguientes acciones hace parte de la gestión de los riesgos asociados al SARLAFT?';
comment on column pre_test.pregunta_21 is 'Enuncie dos mecanismos implementados por la institución para la provisión oportuna de tecnología a todos los pacientes';

-- Sin políticas RLS = anon/authenticated no leen nada, igual que `personal`.
alter table pre_test enable row level security;
