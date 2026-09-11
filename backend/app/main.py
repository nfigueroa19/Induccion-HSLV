import asyncio
import hashlib
import hmac
import json
import logging
import re
import unicodedata
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, EmailStr, Field, field_validator

from . import db
from . import eventos
from .config import cfg
from .correo import gauge_png_bytes
from .dispositivo import mac_desde_ip
from .worker.puntaje import porcentaje_componente

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

# Única fuente de verdad para el catálogo de áreas administrativas: la
# consume scripts/prueba_carga.py (clasificación de perfil de /v1/respuestas,
# no tiene relación con personal.area — ver CATEGORIAS_AREA_PERSONAL abajo).
AREAS_ADMINISTRATIVAS = [
    "Sistemas de Información", "Talento Humano", "Facturación",
    "Gestión Documental", "Calidad", "Compras", "Mercadeo",
    "Servicios Generales", "Mantenimiento", "Subdirección Científica",
]

# Correcciones puntuales de typos detectados en personal.proceso que la
# deduplicación case-insensitive no atrapa por sí sola (letras de más/menos,
# no solo mayúsculas/tildes/espacios). Clave en minúsculas -> grafía correcta.
CORRECCIONES_PROCESO = {
    "subdieccion administrativa": "Subdireccion administrativa",
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
    title="HSLV Inducción API",
    lifespan=ciclo_vida,
    docs_url=None,      # sin documentación pública: no es una API abierta
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cfg.lista_origenes,
    # El host físico del evento (PC o Raspberry Pi) recibe una IP LAN
    # distinta cada vez (DHCP del TP-Link, ver dispositivo.py) — se acepta
    # cualquier IP de esa subred en el puerto de asistencia.html en vez de
    # fijar una sola IP en ORIGENES.
    allow_origin_regex=r"^http://192\.168\.\d{1,3}\.\d{1,3}:8080$",
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Admin-Token", "Authorization"],
    expose_headers=["X-Session-Token"],
)


class RespuestaIn(BaseModel):
    nombre: str = Field(min_length=3, max_length=120)
    cedula: str = Field(min_length=5, max_length=15)
    # cargo/proceso/entidad/correo/telefono solo vienen del cliente cuando se
    # mostró el formulario de contacto (cédula no encontrada, o encontrada
    # pero sin correo/entidad en `personal`) — en ese caso reemplazan lo que
    # hubiera en `personal` (ver upsertar_personal). Si la cédula ya estaba
    # completa, viajan en None y recibir() lee cargo/proceso directo del
    # roster para el prompt del LLM, sin tocar `personal`.
    cargo: str | None = None
    proceso: str | None = None
    entidad: str | None = None
    telefono: str | None = None
    texto: str = Field(min_length=200, max_length=2000)
    correo: EmailStr | None = None

    @field_validator("cedula")
    @classmethod
    def solo_digitos(cls, v: str) -> str:
        limpia = v.replace(".", "").replace(" ", "").replace("-", "").strip()
        if not limpia.isdigit():
            raise ValueError("La cédula debe contener solo números.")
        return limpia

    @field_validator("nombre", "texto")
    @classmethod
    def sin_espacios_sobrantes(cls, v: str) -> str:
        return v.strip()


@app.get("/healthz")
async def healthz():
    """Sondeo de Render y despertador desde el navegador. No toca la base."""
    return {"ok": True}


@app.get("/v1/gauge/{porcentaje}")
async def gauge(porcentaje: int):
    """Logo-medidor (hslv-mark.png relleno según el %) para el correo del
    diagnóstico — ver app/correo.py. Público y sin datos personales: solo
    recibe un entero 0-100. Tiene que ser una URL de verdad porque Gmail
    bloquea imágenes data:base64 incrustadas en el HTML del correo."""
    if not 0 <= porcentaje <= 100:
        raise HTTPException(status_code=404)
    return Response(
        content=gauge_png_bytes(porcentaje),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


async def _valores_columna(columna: str) -> list[str]:
    """Valores distintos de una columna de texto en `personal`, deduplicados
    sin distinguir mayúsculas/espacios (se conserva la grafía más frecuente
    como canónica). `columna` siempre es uno de los tres literales fijos que
    llaman a esta función más abajo, nunca entrada del usuario."""
    p = await db.pool()
    filas = await p.fetch(
        f"select {columna} as v, count(*) as n from personal "
        f"where {columna} is not null and trim({columna}) != '' "
        f"group by {columna}"
    )
    agrupado: dict[str, tuple[str, int]] = {}
    for f in filas:
        valor = re.sub(r"\s+", " ", f["v"].strip())
        valor = CORRECCIONES_PROCESO.get(valor.lower(), valor)
        clave = valor.lower()
        actual = agrupado.get(clave)
        if actual is None or f["n"] > actual[1]:
            agrupado[clave] = (valor, f["n"])
    return sorted(grafia for grafia, _ in agrupado.values())


@app.get("/v1/catalogos")
async def catalogos():
    """Cargo, proceso y entidad ya presentes en el roster `personal`, para
    los <select> del formulario de contacto (cédula no encontrada o con
    correo/entidad sin diligenciar). Cada uno lleva además una opción
    "Otra..." en el frontend para texto libre, por si el valor real todavía
    no está en el roster."""
    return {
        "cargos": await _valores_columna("cargo"),
        "procesos": await _valores_columna("proceso"),
        "entidades": await _valores_columna("entidad"),
    }


@app.get("/v1/personal/{cedula}")
async def buscar_personal(cedula: str):
    """Lookup de solo lectura contra el roster `personal` (RR.HH.) por cédula.

    Sirve para que el frontend decida el siguiente paso:
      - No existe                              -> formulario de contacto completo.
      - Existe pero sin entidad o sin correo   -> mismo formulario, precargado
        con lo que ya se sabe (`completo: false`).
      - Existe y ya tiene entidad y correo     -> se salta el formulario.

    Nunca devuelve el correo ni el teléfono reales (solo si hay alguno
    registrado, vía `completo`) para no exponer más del roster de lo
    necesario a quien solo está consultando una cédula.
    """
    limpia = cedula.replace(".", "").replace(" ", "").replace("-", "").strip()
    if not limpia.isdigit():
        raise HTTPException(status_code=422, detail="La cédula debe contener solo números.")

    p = await db.pool()
    fila = await p.fetchrow(
        """
        select nombre_completo, cargo, proceso, entidad,
               (email_institucional is not null or email_secundario is not null) as tiene_correo
          from personal where cedula = $1
        """,
        int(limpia),
    )
    if fila is None:
        return {"existe": False, "completo": False}
    completo = fila["entidad"] is not None and fila["tiene_correo"]
    return {
        "existe": True,
        "completo": completo,
        "nombre": fila["nombre_completo"],
        "cargo": fila["cargo"],
        "proceso": fila["proceso"],
        "entidad": fila["entidad"],
    }


async def upsertar_personal(con_o_pool, cedula: int, nombre: str, cargo, proceso,
                             entidad, telefono, correo) -> None:
    """Crea o actualiza la fila de `personal` con lo que la persona acaba de
    confirmar en el formulario de contacto. A diferencia de un upsert que
    solo completa huecos, este SÍ reemplaza lo que ya hubiera: el formulario
    solo se muestra cuando el dato estaba incompleto (cédula nueva, o sin
    correo/entidad), así que lo que llega aquí es la corrección que la
    persona acaba de confirmar. El correo se guarda en `email_secundario`
    (mismo campo que usa el roster de RR.HH. para el correo del Excel; ver
    worker/run.py, que intenta primero email_institucional).
    """
    await con_o_pool.execute(
        """
        insert into personal (cedula, nombre_completo, cargo, proceso, entidad,
                               telefono, email_secundario, origen)
        values ($1, $2, $3, $4, $5, $6, $7, 'autorregistro')
        on conflict (cedula) do update
           set nombre_completo  = excluded.nombre_completo,
               cargo            = excluded.cargo,
               proceso          = excluded.proceso,
               entidad          = excluded.entidad,
               telefono         = excluded.telefono,
               email_secundario = excluded.email_secundario
        """,
        cedula, nombre, cargo, proceso, entidad, telefono, correo,
    )


class AsistenciaIn(BaseModel):
    cedula: str = Field(min_length=5, max_length=15)
    encontrado: bool
    nombre: str | None = None
    cargo: str | None = None
    proceso: str | None = None
    entidad: str | None = None
    telefono: str | None = None
    correo: EmailStr | None = None

    @field_validator("cedula")
    @classmethod
    def solo_digitos(cls, v: str) -> str:
        limpia = v.replace(".", "").replace(" ", "").replace("-", "").strip()
        if not limpia.isdigit():
            raise ValueError("La cédula debe contener solo números.")
        return limpia


@app.post("/v1/asistencia", status_code=201)
async def registrar_asistencia(payload: AsistenciaIn, request: Request):
    """Guarda un registro de asistencia. Bloquea un segundo registro con
    cédula distinta desde el mismo dispositivo (misma MAC en la red local),
    salvo que esa MAC esté en `dispositivos_autorizados` (staff).

    La MAC solo se puede resolver cuando este proceso corre en la misma LAN
    que el celular (ver dispositivo.py) — fuera de ese escenario, dispositivo_mac
    queda en NULL y el bloqueo por MAC simplemente no aplica.
    """
    ip_cliente = request.client.host if request.client else None
    mac = mac_desde_ip(ip_cliente) if ip_cliente else None

    p = await db.pool()

    es_staff = False
    if mac is not None:
        es_staff = bool(await p.fetchval(
            "select true from dispositivos_autorizados where mac = $1", mac
        ))
        if not es_staff:
            otra_cedula = await p.fetchval(
                """
                select cedula from asistencia
                 where campana = $1 and dispositivo_mac = $2 and cedula != $3
                 limit 1
                """,
                cfg.campana, mac, payload.cedula,
            )
            if otra_cedula is not None:
                raise HTTPException(
                    status_code=409,
                    detail="Este dispositivo ya se usó para registrar otra cédula. "
                           "Si necesitas ayuda, busca al staff del evento.",
                )

    fila = await p.fetchrow(
        """
        insert into asistencia
               (campana, cedula, encontrado, nombre, area, servicio, telefono,
                dispositivo_mac, dispositivo_ip)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (campana, cedula) do nothing
        returning id
        """,
        cfg.campana, payload.cedula, payload.encontrado, payload.nombre,
        payload.cargo, payload.proceso, payload.telefono, mac, ip_cliente,
    )

    # Se mostró el formulario de contacto (cédula no encontrada, o encontrada
    # pero sin correo/entidad) y la persona lo llenó: crea o actualiza su fila
    # en `personal` con lo que acaba de confirmar — ver upsertar_personal().
    if payload.nombre and (payload.cargo or payload.proceso or payload.entidad
                            or payload.telefono or payload.correo):
        await upsertar_personal(
            p, int(payload.cedula), payload.nombre, payload.cargo,
            payload.proceso, payload.entidad, payload.telefono, payload.correo,
        )

    # `staff`: el frontend usa esto para NO poner el candado de localStorage
    # en dispositivos autorizados (el staff registra a varias personas
    # seguidas desde el mismo celular, no debe verse bloqueado por su propio
    # navegador).
    return {"ok": True, "duplicado": fila is None, "staff": es_staff}


@app.post("/v1/respuestas", status_code=202)
async def recibir(payload: RespuestaIn):
    """Recibe y encola. Deliberadamente aburrido: dos INSERT y 202.

    Nunca llama al LLM. Latencia típica 15-30 ms, que es lo que permite
    aguantar la ráfaga de ~1500 personas del evento.
    """
    cedula_hash = hmac.new(
        cfg.pepper_cedula.encode(), payload.cedula.encode(), hashlib.sha256
    ).hexdigest()

    p = await db.pool()
    async with p.acquire() as con, con.transaction():
        # Se mostró el formulario de contacto (cédula no encontrada, o
        # encontrada pero sin correo/entidad) y la persona lo llenó: crea o
        # actualiza su fila en `personal` ANTES de leer el roster de abajo,
        # para que cargo/proceso ya reflejen lo recién confirmado en esta
        # misma respuesta (no en la siguiente). Ver upsertar_personal().
        if payload.nombre and (payload.cargo or payload.proceso or payload.entidad
                                or payload.telefono or payload.correo):
            await upsertar_personal(
                con, int(payload.cedula), payload.nombre, payload.cargo,
                payload.proceso, payload.entidad, payload.telefono, payload.correo,
            )

        # Roster real (RR.HH.) ya actualizado arriba si hacía falta: cargo/
        # proceso/perfil profesional solo viajan al LLM si están en `personal`.
        roster = await con.fetchrow(
            "select cargo, proceso, perfil from personal where cedula = $1",
            int(payload.cedula),
        )

        # `area`/`perfil` de `respuestas` son columnas heredadas de la vieja
        # clasificación asistencial/administrativo: ya no alimentan el prompt
        # de IA (ver worker/prompt.py v2.0) ni el dashboard (agrupa por
        # proceso, migración 007), pero siguen NOT NULL en el esquema — se
        # completan aquí mismo con el mejor dato disponible del roster, sin
        # pedírselo a la persona.
        cargo_o_proceso = (roster["cargo"] if roster else None) or (roster["proceso"] if roster else None) or "Sin dato"
        perfil = (
            "asistencial"
            if roster and roster["proceso"] and roster["proceso"] in AREAS_ASISTENCIALES
            else "administrativo"
        )

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
            insert into respuestas
                   (identidad_id, campana, area, perfil, texto,
                    cargo, servicio, perfil_profesional)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            on conflict (identidad_id, campana) do nothing
            returning id
            """,
            identidad_id, cfg.campana, cargo_o_proceso, perfil, payload.texto,
            roster["cargo"] if roster else None,
            roster["proceso"] if roster else None,
            roster["perfil"] if roster else None,
        )

    # Doble clic, reenvío por mala señal o "lo llené dos veces": lo resuelve la
    # restricción única, no lógica de aplicación.
    if respuesta_id is None:
        log.info("respuesta duplicada ignorada cedula=%s", payload.cedula)
        return {"ok": True, "duplicado": True}

    log.info("respuesta encolada id=%s perfil=%s", respuesta_id, perfil)
    return {"ok": True, "duplicado": False, "id": str(respuesta_id)}


@app.get("/v1/respuestas/{respuesta_id}/diagnostico")
async def obtener_diagnostico(respuesta_id: str):
    """Devuelve el diagnóstico para mostrarlo en pantalla a quien respondió.

    El id es un UUID que solo recibe quien envió el formulario, así que funciona
    como llave: sin él no se puede consultar nada. No expone nombre ni cédula,
    que viven cifrados en otra tabla.

    202 = todavía procesando (el frontend reintenta). 200 = listo.
    """
    try:
        uuid.UUID(respuesta_id)
    except ValueError:
        raise HTTPException(status_code=404)

    p = await db.pool()
    fila = await p.fetchrow(
        """
        select r.estado::text as estado,
               d.porcentaje_global,
               d.nivel,
               d.payload
          from respuestas r
          left join diagnosticos d on d.respuesta_id = r.id
         where r.id = $1::uuid
        """,
        respuesta_id,
    )

    if fila is None:
        raise HTTPException(status_code=404)

    if fila["payload"] is None:
        if fila["estado"] == "fallido":
            raise HTTPException(
                status_code=503,
                detail="No pudimos generar tu diagnóstico. Ya quedó registrado "
                       "y lo revisaremos.",
            )
        return JSONResponse(status_code=202, content={"listo": False})

    payload = json.loads(fila["payload"])
    banderas = payload.get("banderas", {})

    # Alguien puede haber usado el formulario para reportar una situación grave.
    # A esa persona no se le responde con un porcentaje.
    if banderas.get("requiere_revision_humana"):
        return {
            "listo": True,
            "revision": True,
            "mensaje": "Gracias por escribirnos. Tu mensaje será revisado por "
                       "una persona del equipo.",
        }

    return {
        "listo": True,
        "revision": False,
        "insuficiente": bool(banderas.get("respuesta_insuficiente")),
        "porcentaje": fila["porcentaje_global"],
        "nivel": fila["nivel"],
        "fortaleza": payload.get("fortaleza", {}).get("texto", ""),
        "proximo_paso": payload.get("proximo_paso", {}),
        "mensaje_cierre": payload.get("mensaje_cierre", ""),
        "componentes": [
            {
                "id": c.get("id"),
                "nombre": c.get("nombre"),
                "nivel": c.get("nivel"),
                "porcentaje": porcentaje_componente(
                    c.get("nivel", 0), f"{respuesta_id}:{c.get('id')}"
                ),
                "sugerencia": c.get("sugerencia", ""),
            }
            for c in payload.get("componentes", [])
        ],
    }


async def _indicadores_dashboard() -> dict:
    """Indicadores agregados para el panel de comunicaciones/líderes.

    Sin token: lo que expone ya es agregado y anónimo (sin umbral mínimo de
    respuestas por proceso — decisión del usuario 2026-08-20, ver
    001_schema.sql). Nunca hay texto ni identidad de nadie aquí. Asistencial
    y administrativo van fusionados: el dashboard ya no distingue perfil.

    Agrupa por personal.proceso (respuestas.servicio, ver 006) en vez de por
    respuestas.area: proceso es el dato oficial de RR.HH., no la elección
    libre del formulario. v_agregado_area/v_componentes_area (ver
    007_dashboard_por_proceso.sql) ya resuelven ahí la imputación para las
    filas sin servicio, con la moda de la misma área como respaldo.
    """
    p = await db.pool()
    procesos = await p.fetch(
        """
        select proceso, n, promedio, minimo, maximo
          from v_agregado_area
         where campana = $1
         order by promedio desc
        """,
        cfg.campana,
    )
    componentes = await p.fetch(
        """
        select proceso, componente_id, componente, n, nivel_promedio
          from v_componentes_area
         where campana = $1
         order by proceso, componente_id
        """,
        cfg.campana,
    )
    total = await p.fetchval(
        """
        select count(*)
          from diagnosticos d
          join respuestas r on r.id = d.respuesta_id
         where r.campana = $1
        """,
        cfg.campana,
    )
    return {
        "total_respuestas": total,
        "procesos": [dict(f) for f in procesos],
        "componentes": [dict(f) for f in componentes],
    }


@app.get("/v1/dashboard")
async def dashboard():
    return await _indicadores_dashboard()


@app.get("/v1/dashboard/stream")
async def dashboard_stream():
    """Mismos datos que /v1/dashboard, empujados por SSE en vez de sondeados.

    El worker avisa (eventos.avisar_diagnostico_nuevo) apenas graba un
    diagnóstico nuevo; este generador se despierta al instante y reenvía el
    estado completo. Sin aviso en 15s, igual vuelve a consultar y manda el
    estado (no un simple ping): así el stream se autosana si algo escribió en
    la base sin pasar por el worker de este proceso — por ejemplo un script
    de datos aparte, o el worker corriendo en otro proceso el día que se
    separe del plan gratuito (ver eventos.py) — y de paso evita que Render (o
    cualquier proxy intermedio) corte la conexión por inactividad.
    """
    async def generador():
        q = eventos.suscribirse()
        try:
            while True:
                try:
                    # jsonable_encoder, no json.dumps a secas: nivel_promedio
                    # sale de Postgres como Decimal (round(...,2) en la vista),
                    # y json.dumps no sabe serializarlo — reventaba el stream
                    # a medio mandar (ERR_INCOMPLETE_CHUNKED_ENCODING).
                    cuerpo = jsonable_encoder(await _indicadores_dashboard())
                    yield f"data: {json.dumps(cuerpo)}\n\n"
                except Exception:
                    log.exception("fallo consultando indicadores para el stream; se reintenta")
                try:
                    await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    pass
        finally:
            eventos.desuscribirse(q)

    return StreamingResponse(
        generador(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            # Nginx (y proxies similares) bufferean respuestas por defecto;
            # esta cabecera les pide no acumular antes de mandar cada chunk.
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/v1/estado")
async def estado(x_admin_token: str = Header(default="")):
    """Monitoreo de la cola el día del evento. Solo conteos, sin datos personales."""
    if not cfg.admin_token or not hmac.compare_digest(x_admin_token, cfg.admin_token):
        raise HTTPException(status_code=404)

    p = await db.pool()
    filas = await p.fetch("select * from estado_cola($1)", cfg.campana)
    return {"campana": cfg.campana, "cola": {f["estado"]: f["n"] for f in filas}}


# ---------------------------------------------------------------------------
# Panel de administración (jefes de servicio): login propio + tabla con
# nombre, cédula y diagnóstico por persona. A diferencia de /v1/dashboard,
# esto SÍ expone identidad — por eso vive detrás de sesión, no solo del
# secreto de la URL. Ver Confidencialidad y privacidad.
# ---------------------------------------------------------------------------

class LoginIn(BaseModel):
    usuario: str = Field(min_length=1, max_length=60)
    contrasena: str = Field(min_length=1, max_length=200)


def _firmar_token(usuario: str) -> str:
    vencimiento = datetime.now(timezone.utc) + timedelta(minutes=cfg.admin_sesion_min)
    return jwt.encode(
        {"sub": usuario, "exp": vencimiento}, cfg.jwt_secret, algorithm="HS256"
    )


async def admin_actual(authorization: str = Header(default="")) -> str:
    """Valida el Bearer token y devuelve el usuario. Renueva el token en cada
    llamada (sesión deslizante): 15 min de inactividad real cierran la
    sesión, no 15 min desde el login."""
    if not cfg.jwt_secret:
        raise HTTPException(status_code=404)

    esquema, _, token = authorization.partition(" ")
    if esquema != "Bearer" or not token:
        raise HTTPException(status_code=401, detail="Sesión requerida.")

    try:
        payload = jwt.decode(token, cfg.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Sesión inválida o vencida.")

    return payload["sub"]


@app.post("/v1/admin/login")
async def admin_login(payload: LoginIn):
    if not cfg.jwt_secret:
        raise HTTPException(status_code=404)

    p = await db.pool()
    fila = await p.fetchrow(
        "select password_hash from admins where usuario = $1 and activo",
        payload.usuario,
    )

    # Mismo mensaje para usuario inexistente o contraseña incorrecta: no dar
    # pistas de qué usuarios existen.
    valido = fila is not None and bcrypt.checkpw(
        payload.contrasena.encode(), fila["password_hash"].encode()
    )
    if not valido:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos.")

    log.info("login admin usuario=%s", payload.usuario)
    return {"token": _firmar_token(payload.usuario)}


@app.get("/v1/admin/respuestas")
async def admin_respuestas(usuario: str = Depends(admin_actual)):
    """Asistencia y diagnóstico por persona: nombre, cédula, área, estado,
    % global y % por componente. Sin el texto libre que escribió cada quien
    — eso sigue siendo confidencial incluso para el panel de jefes.

    Se cruza con `personal` (por cédula) para traer el perfil completo del
    roster — cargo, servicio (`proceso`), perfil profesional, entidad,
    contacto — sin duplicar esos datos dentro de `respuestas`. Funciona igual
    para alguien
    verificado por RR.HH. y para un autorregistro (`personal.origen`), porque
    ambos casos ya completan `personal` (ver /v1/asistencia y /v1/respuestas).
    Nota: `p.perfil` (cargo profesional tipo "Auxiliar de Enfermería") no es
    lo mismo que `r.perfil` (asistencial/administrativo) — se expone como
    `perfil_profesional` para no confundirlos.
    """
    p = await db.pool()
    filas = await p.fetch(
        """
        with base as (
            select pgp_sym_decrypt(i.nombre_cifrado, $2) as nombre,
                   pgp_sym_decrypt(i.cedula_cifrada, $2)  as cedula,
                   r.area, r.perfil, r.estado::text as estado,
                   d.porcentaje_global, d.nivel, d.payload,
                   r.creado_en
              from respuestas r
              join identidades i on i.id = r.identidad_id
              left join diagnosticos d on d.respuesta_id = r.id
             where r.campana = $1
        )
        select b.*, pe.cargo, pe.proceso as servicio,
               pe.perfil as perfil_profesional, pe.entidad, pe.telefono,
               pe.email_institucional, pe.email_secundario, pe.origen as origen_personal
          from base b
          left join personal pe on pe.cedula = b.cedula::bigint
         order by b.creado_en desc
        """,
        cfg.campana, cfg.clave_datos,
    )

    filas_json = []
    for f in filas:
        componentes = []
        if f["payload"] is not None:
            payload = json.loads(f["payload"])
            componentes = [
                {
                    "id": c.get("id"),
                    "nombre": c.get("nombre"),
                    "nivel": c.get("nivel"),
                    "porcentaje": porcentaje_componente(c.get("nivel", 0)),
                }
                for c in payload.get("componentes", [])
            ]
        filas_json.append({
            "nombre": f["nombre"],
            "cedula": f["cedula"],
            "area": f["area"],
            "perfil": f["perfil"],
            "estado": f["estado"],
            "porcentaje": f["porcentaje_global"],
            "nivel": f["nivel"],
            "componentes": componentes,
            "creado_en": f["creado_en"].isoformat(),
            # De `personal` (roster RR.HH. + autorregistros) — null si la
            # cédula todavía no tiene fila ahí (caso raro: solo puede pasar
            # si el upsert de /v1/respuestas o /v1/asistencia falló).
            "cargo": f["cargo"],
            "servicio": f["servicio"],
            "perfil_profesional": f["perfil_profesional"],
            "entidad": f["entidad"],
            "telefono": f["telefono"],
            "email_institucional": f["email_institucional"],
            "email_secundario": f["email_secundario"],
            "origen_personal": f["origen_personal"],
        })

    return JSONResponse(
        content={"campana": cfg.campana, "respuestas": filas_json},
        headers={"X-Session-Token": _firmar_token(usuario)},
    )
