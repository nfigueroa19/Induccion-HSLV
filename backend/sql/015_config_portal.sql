-- Interruptor abrir/cerrar del portal, editable desde la página privada
-- `portal-control` sin tocar variables de Render ni redesplegar.
-- Mientras no exista la fila, manda PORTAL_CERRADO del entorno; una vez que se
-- alterna desde la página, la fila de esta tabla tiene prioridad.
-- Es seguro correrlo dos veces.

create table if not exists config_portal (
  clave        text primary key,
  cerrado      boolean not null,
  actualizado_en  timestamptz not null default now(),
  actualizado_por text
);

-- Sin políticas RLS: solo la service_role del backend la lee/escribe.
alter table config_portal enable row level security;
