-- Usuarios del panel de administración (jefes de servicio).
-- Ejecutar en el SQL Editor de Supabase. Es seguro correrlo dos veces.
--
-- No usa Supabase Auth (exige correo/dominio, que los jefes no tienen):
-- login propio de usuario + contraseña, con hash bcrypt hecho en el backend.
-- Esta tabla nunca guarda la contraseña en texto plano, solo el hash.

create table if not exists admins (
  id              uuid primary key default gen_random_uuid(),
  usuario         text not null unique,
  password_hash   text not null,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

-- Sin políticas RLS = anon/authenticated no leen nada. Solo la service_role
-- key del backend las salta (mismo patrón que 001_schema.sql).
alter table admins enable row level security;
