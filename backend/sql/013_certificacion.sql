-- Foto de lo que dejó cada persona en la Reinducción 2026 (base para certificar).
-- Se llena con scripts/generar_certificacion.py a partir de la misma lógica del
-- panel de gestión interna; NO es una vista viva, hay que regenerarla.
-- Datos personales: solo-backend, RLS activo y sin políticas (como `personal`).
create table if not exists certificacion (
  cedula              bigint primary key,
  nombre              text,
  cargo               text,
  proceso             text,
  entidad             text,
  inscripcion         text,          -- "Mar 13 oct · 7:30 a.m. · Memoria"
  asistencia          timestamptz,
  puntaje_pretest     int,
  total_pretest       int,
  puntaje_posttest    int,
  total_posttest      int,
  adn_susana          int,           -- % global del diagnóstico
  origen              text,          -- rrhh | autorregistro
  generado_en         timestamptz not null default now()
);
alter table certificacion enable row level security;
