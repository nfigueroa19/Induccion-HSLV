-- Copia cargo/proceso/perfil profesional del roster (`personal`) a
-- `respuestas` en el momento del envío, igual que ya se hace con `area`.
-- Objetivo: que el prompt del LLM (worker) pueda usar ese contexto sin tener
-- que consultar `personal` (evita un join extra desde la cola) y sin tocar
-- `identidades` (el worker sigue sin ver nombre/cédula, ver 001_schema.sql).
--
-- Nombres de columna en `respuestas` alineados con los que ya expone
-- /v1/admin/respuestas (main.py): cargo, servicio, perfil_profesional.

alter table respuestas
  add column if not exists cargo text,
  add column if not exists servicio text,
  add column if not exists perfil_profesional text;

-- El backfill de las filas ya existentes se hace aparte, en Python
-- (scripts/backfill_perfil_roster.py) porque requiere la clave de cifrado
-- (cfg.clave_datos) para descifrar la cédula y cruzar con `personal` — no
-- es un valor que deba viajar dentro de una migración SQL en texto plano.

-- claim_respuestas ahora también devuelve estos 3 campos para el worker.
drop function if exists claim_respuestas(int, text, int);

create or replace function claim_respuestas(
  p_lote int, p_campana text default null, p_lease_seg int default 180
)
returns table (
  id uuid, area text, perfil text, texto text, intentos smallint,
  cargo text, servicio text, perfil_profesional text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update respuestas r
     set estado         = 'procesando',
         intentos       = r.intentos + 1,
         visible_desde  = now() + make_interval(secs => p_lease_seg),
         actualizado_en = now()
   where r.id in (
     select r2.id
       from respuestas r2
      where r2.estado in ('pendiente', 'procesando')
        and r2.visible_desde <= now()
        and r2.intentos < 5
        and (p_campana is null or r2.campana = p_campana)
      order by r2.creado_en
        for update skip locked
      limit p_lote
   )
  returning r.id, r.area, r.perfil, r.texto, r.intentos,
            r.cargo, r.servicio, r.perfil_profesional;
end;
$$;

revoke all on function claim_respuestas(int, text, int) from public, anon, authenticated;
