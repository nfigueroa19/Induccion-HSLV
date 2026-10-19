-- Registro de certificados de la Reinducción 2026 emitidos. El `id` es el número que va
-- escondido (marca de agua invisible) en el fondo de cada PDF; al subir un PDF a la
-- verificación se lee ese número y se busca aquí a quién se emitió realmente.
-- Datos personales: solo-backend, RLS activo y sin políticas (como `certificacion`).
create table if not exists certificados_emitidos (
  id          integer generated always as identity primary key,   -- cabe en 20 bits
  cedula      bigint not null unique,                              -- un certificado por persona
  nombre      text not null,
  entidad     text,
  emitido_en  timestamptz not null default now(),
  revocado    boolean not null default false
);
alter table certificados_emitidos enable row level security;
