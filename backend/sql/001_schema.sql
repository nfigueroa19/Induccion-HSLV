-- Esquema de la re-inducción HSLV.
-- Ejecutar en el SQL Editor de Supabase. Es seguro correrlo dos veces.
--
-- Diseño: Segundo Cerebro/01 - Arquitectura/Arquitectura de despliegue y pipeline asincrono.md

create extension if not exists pgcrypto;

do $$
begin
  create type estado_respuesta as enum
    ('pendiente', 'procesando', 'listo', 'fallido', 'descartado');
exception
  when duplicate_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- Identidad, separada del contenido.
-- El worker del motor de IA NUNCA consulta esta tabla: al LLM solo viajan
-- area, perfil y texto. Ver: Confidencialidad y privacidad.
-- ---------------------------------------------------------------------------
create table if not exists identidades (
  id              uuid primary key default gen_random_uuid(),
  campana         text not null,
  cedula_hash     text not null,          -- HMAC-SHA256: buscar sin descifrar
  cedula_cifrada  bytea not null,
  nombre_cifrado  bytea not null,
  correo          text,
  creado_en       timestamptz not null default now(),
  unique (campana, cedula_hash)
);

-- ---------------------------------------------------------------------------
-- Cola de respuestas.
-- ---------------------------------------------------------------------------
create table if not exists respuestas (
  id             uuid primary key default gen_random_uuid(),
  identidad_id   uuid not null references identidades(id) on delete cascade,
  campana        text not null,
  area           text not null,
  perfil         text not null check (perfil in ('asistencial', 'administrativo')),
  texto          text not null,
  estado         estado_respuesta not null default 'pendiente',
  intentos       smallint not null default 0,
  visible_desde  timestamptz not null default now(),   -- lease + backoff
  ultimo_error   text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (identidad_id, campana)
);

-- Índice parcial: la cola solo mira lo que está en vuelo.
create index if not exists respuestas_cola_idx
  on respuestas (visible_desde)
  where estado in ('pendiente', 'procesando');

-- ---------------------------------------------------------------------------
-- Diagnósticos generados.
-- ---------------------------------------------------------------------------
create table if not exists diagnosticos (
  id                uuid primary key default gen_random_uuid(),
  respuesta_id      uuid not null unique references respuestas(id) on delete cascade,
  porcentaje_global smallint not null,
  nivel             text not null,
  payload           jsonb not null,
  proveedor         text not null,
  modelo            text not null,
  prompt_version    text not null,    -- sin esto no se puede comparar entre años
  rubrica_version   text not null,
  latencia_ms       int,
  enviado_en        timestamptz,      -- correo institucional (paso 5)
  creado_en         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Telemetría técnica. PROHIBIDO escribir aquí texto del colaborador.
-- ---------------------------------------------------------------------------
create table if not exists eventos_worker (
  id           bigserial primary key,
  respuesta_id uuid,
  proveedor    text,
  modelo       text,
  http_status  int,
  latencia_ms  int,
  detalle      text,
  creado_en    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sin políticas RLS = las llaves anon/authenticated no leen absolutamente nada.
-- Solo la service_role key (que vive únicamente en el backend) las salta.
-- ---------------------------------------------------------------------------
alter table identidades    enable row level security;
alter table respuestas     enable row level security;
alter table diagnosticos   enable row level security;
alter table eventos_worker enable row level security;

-- ---------------------------------------------------------------------------
-- Reporte agregado por área, con k-anonimato.
-- Los grupos de menos de 5 personas no aparecen: en un área de 2, el "promedio"
-- es el diagnóstico individual disfrazado.
-- ---------------------------------------------------------------------------
create or replace view v_agregado_area as
select r.area,
       r.perfil,
       r.campana,
       count(*)                        as n,
       round(avg(d.porcentaje_global)) as promedio,
       min(d.porcentaje_global)        as minimo,
       max(d.porcentaje_global)        as maximo
from diagnosticos d
join respuestas r on r.id = d.respuesta_id
group by r.area, r.perfil, r.campana
having count(*) >= 5;

-- Fortalezas y debilidades por área, para los líderes.
-- Desarma el JSON de componentes y promedia el nivel de cada uno.
create or replace view v_componentes_area as
select r.area,
       r.perfil,
       r.campana,
       c ->> 'id'                            as componente_id,
       c ->> 'nombre'                        as componente,
       count(*)                              as n,
       round(avg((c ->> 'nivel')::numeric), 2) as nivel_promedio
from diagnosticos d
join respuestas r on r.id = d.respuesta_id
cross join lateral jsonb_array_elements(d.payload -> 'componentes') as c
group by r.area, r.perfil, r.campana, c ->> 'id', c ->> 'nombre'
having count(*) >= 5;
