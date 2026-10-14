-- El post-test (cierre) pasa de 21 a 26 preguntas: las 21 del pre-test más 5
-- nuevas (rendición de cuentas, líneas de defensa, riesgos institucionales y
-- sello de No discriminación). Las filas ya guardadas quedan con 22..26 en
-- null y su puntaje sobre 21; el backend las distingue por `pregunta_22 is null`.
alter table post_test
  add column if not exists pregunta_22 text,
  add column if not exists pregunta_23 text,
  add column if not exists pregunta_24 text,
  add column if not exists pregunta_25 text,
  add column if not exists pregunta_26 text;
