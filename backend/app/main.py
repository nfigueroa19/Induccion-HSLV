import asyncio
import hashlib
import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, field_validator

from . import db
from .config import cfg

# El access log de uvicorn no se guarda: las peticiones llevan la respuesta
# confidencial del colaborador en el cuerpo. Ver Confidencialidad y privacidad.
logging.getLogger("uvicorn.access").disabled = True
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
)
log = logging.getLogger("api")

# Debe coincidir con los optgroup de web/index.html.
AREAS_ASISTENCIALES = {
    "Urgencias", "Hospitalización", "Cirugía", "Consulta Externa",
    "Laboratorio Clínico", "Imágenes Diagnósticas", "Gastroenterología",
    "Fisioterapia y Rehabilitación", "Pediatría", "Ginecología y Obstetricia",
    "UCI Materna", "UCI Pediátrica", "UCI Neonatal", "Enfermería",
}


@asynccontextmanager
async def ciclo_vida(app: FastAPI):
    await db.iniciar()
    tarea = None
    if cfg.worker_embebido:
        from .worker.run import loop
        tarea = asyncio.create_task(loop())
        log.info("worker embebido iniciado")
    try:
        yield
    finally:
        if tarea is not None:
            tarea.cancel()
        await db.cerrar()


app = FastAPI(
    title="HSLV Re-inducción API",
    lifespan=ciclo_vida,
    docs_url=None,      # sin documentación pública: no es una API abierta
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.lista_origenes,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Admin-Token"],
)


class RespuestaIn(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    cedula: str = Field(min_length=5, max_length=15)
    area: str = Field(min_length=2, max_length=80)
    texto: str = Field(min_length=120, max_length=1200)
    correo: EmailStr | None = None

    @field_validator("cedula")
    @classmethod
    def solo_digitos(cls, v: str) -> str:
        limpia = v.replace(".", "").replace(" ", "").replace("-", "").strip()
        if not limpia.isdigit():
            raise ValueError("La cédula debe contener solo números.")
        return limpia

    @field_validator("nombre", "area", "texto")
    @classmethod
    def sin_espacios_sobrantes(cls, v: str) -> str:
        return v.strip()


@app.get("/healthz")
async def healthz():
    """Sondeo de Render y despertador desde el navegador. No toca la base."""
    return {"ok": True}


@app.post("/v1/respuestas", status_code=202)
async def recibir(payload: RespuestaIn):
    """Recibe y encola. Deliberadamente aburrido: dos INSERT y 202.

    Nunca llama al LLM. Latencia típica 15-30 ms, que es lo que permite
    aguantar la ráfaga de ~1500 personas del evento.
    """
    cedula_hash = hmac.new(
        cfg.pepper_cedula.encode(), payload.cedula.encode(), hashlib.sha256
    ).hexdigest()

    perfil = "asistencial" if payload.area in AREAS_ASISTENCIALES else "administrativo"

    p = await db.pool()
    async with p.acquire() as con, con.transaction():
        identidad_id = await con.fetchval(
            """
            insert into identidades
                   (campana, cedula_hash, cedula_cifrada, nombre_cifrado, correo)
            values ($1, $2, pgp_sym_encrypt($3, $5), pgp_sym_encrypt($4, $5), $6)
            on conflict (campana, cedula_hash)
                do update set correo = coalesce(excluded.correo, identidades.correo)
            returning id
            """,
            cfg.campana, cedula_hash, payload.cedula,
            payload.nombre, cfg.clave_datos, payload.correo,
        )

        respuesta_id = await con.fetchval(
            """
            insert into respuestas (identidad_id, campana, area, perfil, texto)
            values ($1, $2, $3, $4, $5)
            on conflict (identidad_id, campana) do nothing
            returning id
            """,
            identidad_id, cfg.campana, payload.area, perfil, payload.texto,
        )

    # Doble clic, reenvío por mala señal o "lo llené dos veces": lo resuelve la
    # restricción única, no lógica de aplicación.
    if respuesta_id is None:
        log.info("respuesta duplicada ignorada area=%s", payload.area)
        return {"ok": True, "duplicado": True}

    log.info("respuesta encolada id=%s area=%s perfil=%s",
             respuesta_id, payload.area, perfil)
    return {"ok": True, "duplicado": False, "id": str(respuesta_id)}


@app.get("/v1/estado")
async def estado(x_admin_token: str = Header(default="")):
    """Monitoreo de la cola el día del evento. Solo conteos, sin datos personales."""
    if not cfg.admin_token or not hmac.compare_digest(x_admin_token, cfg.admin_token):
        raise HTTPException(status_code=404)

    p = await db.pool()
    filas = await p.fetch("select * from estado_cola($1)", cfg.campana)
    return {"campana": cfg.campana, "cola": {f["estado"]: f["n"] for f in filas}}
