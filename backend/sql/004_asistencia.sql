-- Registro de asistencia del evento de inducción.
-- `campana` sigue la misma convención que `respuestas`/`identidades`:
-- las pruebas usan CAMPANA=carga-prueba (ver backend/.env), el evento real
-- usa "2026". Limpiar antes del evento es un DELETE por campana, sin tocar
-- dispositivos_autorizados (esa lista sí debe sobrevivir).

create table if not exists asistencia (
  id              uuid primary key default gen_random_uuid(),
  campana         text not null,
  cedula          text not null,
  encontrado      boolean not null,
  nombre          text,
  area            text,
  servicio        text,
  telefono        text,
  dispositivo_mac text,
  dispositivo_ip  text,
  creado_en       timestamptz not null default now(),
  unique (campana, cedula)
);

create index if not exists asistencia_mac_idx on asistencia (campana, dispositivo_mac);

-- Celulares del staff exentos del bloqueo por "misma MAC, otra cédula".
-- Se llena a mano (ver backend/scripts/autorizar_dispositivo.py), sobrevive
-- entre campañas: no se borra al limpiar datos de prueba.
create table if not exists dispositivos_autorizados (
  mac        text primary key,
  etiqueta   text not null,
  creado_en  timestamptz not null default now()
);

alter table asistencia enable row level security;
alter table dispositivos_autorizados enable row level security;
