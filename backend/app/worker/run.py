"""Loop que drena la cola de respuestas y genera los diagnósticos.

Dos formas de arrancarlo, con el mismo código:
  - embebido en la API   -> WORKER_EMBEBIDO=true (plan gratuito de Render)
  - proceso aparte       -> python -m app.worker.run  (Background Worker, de pago)
"""

import asyncio
import json
import logging
import time

from .. import db
from .. import eventos
from ..config import cfg
from ..correo import enviar_diagnostico_email
from .prompt import PROMPT_VERSION, RUBRICA_VERSION, construir_mensajes
from . import puntaje
from .puntaje import calcular_porcentaje, nivel_cualitativo, porcentaje_componente
from .router import Router, SinRutasDisponibles

log = logging.getLogger("worker")
log.info("puntaje.py cargado desde %s (NIVEL_PISO=%s COMPONENTES_CONTADOS=%s)",
          puntaje.__file__, puntaje.NIVEL_PISO, puntaje.COMPONENTES_CONTADOS)

# Nombre de campaña reservado para carga de prueba en local (ver .env.example
# y config.py). Mientras cfg.campana sea este valor, el worker sigue
# calculando diagnósticos normalmente pero NUNCA envía el correo: la BD de
# prueba comparte `personal` con la real, así que una fila de prueba puede
# tener el email institucional de una persona real.
_CAMPANA_PRUEBA = "carga-prueba"

_router: Router | None = None


def router() -> Router:
    global _router
    if _router is None:
        _router = Router()
    return _router


async def _telemetria(pool, respuesta_id, proveedor, modelo, latencia, detalle):
    """Registro técnico. NUNCA escribir aquí texto del colaborador."""
    try:
        await pool.execute(
            """
            insert into eventos_worker
                   (respuesta_id, proveedor, modelo, latencia_ms, detalle)
            values ($1, $2, $3, $4, $5)
            """,
            respuesta_id, proveedor, modelo, latencia, detalle,
        )
    except Exception:
        log.debug("no se pudo registrar telemetría", exc_info=False)


async def _enviar_correo_diagnostico(pool, respuesta_id, porcentaje, nivel, cruda) -> None:
    """Envía el correo del diagnóstico ya calculado. Nunca lanza: un fallo de
    Resend (o de red) no debe tumbar el worker ni reencolar una respuesta que
    ya quedó 'listo' — el peor caso es que la persona no reciba el correo y
    solo vea el resultado en pantalla.

    Prioridad de destinatario (decisión 2026-09-08, ver memoria
    project-correo-diagnostico-resend): email_institucional -> email_secundario
    (ambos de `personal`, el roster de RR.HH.) -> identidades.correo (lo que
    la persona escribió en el formulario, si no está en el roster).
    """
    if cfg.campana == _CAMPANA_PRUEBA:
        log.info("campana=%s (prueba): correo de diagnóstico omitido para respuesta %s",
                  cfg.campana, respuesta_id)
        return

    try:
        fila = await pool.fetchrow(
            """
            select i.correo as correo_identidad,
                   pe.email_institucional, pe.email_secundario
              from respuestas r
              join identidades i on i.id = r.identidad_id
              left join personal pe
                on pe.cedula = pgp_sym_decrypt(i.cedula_cifrada, $2)::bigint
             where r.id = $1
            """,
            respuesta_id, cfg.clave_datos,
        )
        if fila is None:
            return

        destinatario = (
            fila["email_institucional"]
            or fila["email_secundario"]
            or fila["correo_identidad"]
        )
        if not destinatario:
            log.info("respuesta %s sin correo de destino; no se envía diagnóstico",
                      respuesta_id)
            return

        diagnostico = {
            "porcentaje": porcentaje,
            "nivel": nivel,
            "fortaleza": cruda.get("fortaleza", {}).get("texto", ""),
            "proximo_paso": cruda.get("proximo_paso", {}),
            "mensaje_cierre": cruda.get("mensaje_cierre", ""),
            "componentes": [
                {
                    "nombre": c.get("nombre"),
                    "nivel": c.get("nivel"),
                    "porcentaje": porcentaje_componente(c.get("nivel", 0)),
                    "sugerencia": c.get("sugerencia", ""),
                }
                for c in cruda.get("componentes", [])
            ],
        }
        await enviar_diagnostico_email(destinatario, diagnostico)
    except Exception:
        log.exception("fallo enviando correo de diagnóstico para respuesta %s", respuesta_id)


async def procesar(fila, pool) -> None:
    inicio = time.monotonic()
    mensajes = construir_mensajes(
        perfil=fila["perfil"], area=fila["area"], texto=fila["texto"],
        cargo=fila["cargo"], servicio=fila["servicio"],
        perfil_profesional=fila["perfil_profesional"],
    )

    try:
        cruda, ruta = await router().completar(mensajes)

    except SinRutasDisponibles:
        # Nadie tiene cuota ahora mismo. Se suelta el lease y se reintenta
        # pronto SIN gastar uno de los 5 intentos: no es culpa de esta fila.
        await pool.execute(
            """
            update respuestas
               set estado = 'pendiente',
                   intentos = greatest(intentos - 1, 0),
                   visible_desde = now() + interval '60 seconds',
                   actualizado_en = now()
             where id = $1
            """,
            fila["id"],
        )
        log.warning("sin rutas disponibles; respuesta %s reencolada", fila["id"])
        return

    except Exception as e:
        await pool.execute(
            """
            update respuestas
               set estado = case when intentos >= 5 then 'fallido'::estado_respuesta
                                 else 'pendiente'::estado_respuesta end,
                   visible_desde = now() + (interval '30 seconds' * power(2, intentos)),
                   ultimo_error = $2,
                   actualizado_en = now()
             where id = $1
            """,
            fila["id"], type(e).__name__,
        )
        log.warning("fallo respuesta=%s err=%s", fila["id"], type(e).__name__)
        await _telemetria(pool, fila["id"], None, None, None, type(e).__name__)
        return

    # El porcentaje lo calcula el código, no el modelo. Ver puntaje.py.
    porcentaje = calcular_porcentaje(cruda["componentes"])
    nivel = nivel_cualitativo(porcentaje)
    latencia = int((time.monotonic() - inicio) * 1000)

    async with pool.acquire() as con, con.transaction():
        await con.execute(
            """
            insert into diagnosticos
                   (respuesta_id, porcentaje_global, nivel, payload, proveedor,
                    modelo, prompt_version, rubrica_version, latencia_ms)
            values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
            on conflict (respuesta_id) do nothing
            """,
            fila["id"], porcentaje, nivel, json.dumps(cruda, ensure_ascii=False),
            ruta.id, ruta.modelo, PROMPT_VERSION, RUBRICA_VERSION, latencia,
        )
        await con.execute(
            """
            update respuestas
               set estado = 'listo', ultimo_error = null, actualizado_en = now()
             where id = $1
            """,
            fila["id"],
        )

    # El envío por correo (paso 5) debe SALTARSE las filas con
    # banderas.requiere_revision_humana: alguien puede haber usado el formulario
    # para reportar una situación grave, y no se le responde con un porcentaje.
    if cruda.get("banderas", {}).get("requiere_revision_humana"):
        log.warning("respuesta %s marcada para revisión humana", fila["id"])
    else:
        await _enviar_correo_diagnostico(pool, fila["id"], porcentaje, nivel, cruda)

    await _telemetria(pool, fila["id"], ruta.id, ruta.modelo, latencia, "ok")
    log.info("ok respuesta=%s ruta=%s pct=%s ms=%s",
             fila["id"], ruta.id, porcentaje, latencia)
    eventos.avisar_diagnostico_nuevo()


async def loop() -> None:
    pool = await db.iniciar()
    sem = asyncio.Semaphore(cfg.worker_concurrencia)
    router()   # falla temprano y ruidosamente si no hay ninguna llave configurada

    async def con_limite(fila):
        async with sem:
            # Cada tarea usa su propia conexión: un objeto Connection de asyncpg
            # NO admite consultas concurrentes.
            await procesar(fila, pool)

    log.info("worker arriba: lote=%s concurrencia=%s",
             cfg.worker_lote, cfg.worker_concurrencia)

    while True:
        try:
            lote = await pool.fetch(
                "select * from claim_respuestas($1, $2)", cfg.worker_lote, cfg.campana
            )

            if not lote:
                await asyncio.sleep(cfg.worker_pausa_seg)
                continue

            await asyncio.gather(
                *(con_limite(f) for f in lote), return_exceptions=True
            )

        except asyncio.CancelledError:
            log.info("worker detenido")
            raise
        except Exception:
            # Un fallo de red contra la base no debe matar el loop.
            log.exception("error en el ciclo del worker; reintentando en 10 s")
            await asyncio.sleep(10)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    asyncio.run(loop())
