"""Router de proveedores: combos, circuit breaker y límite de tasa.

Es la versión en código de lo que OmniRoute hace con sus "Combos", para poder
correr en el plan gratuito de Render (que no tiene disco persistente donde
OmniRoute pudiera guardar su configuración).

Diseño: Segundo Cerebro/05 - Motor IA/Router de LLM - OmniRoute y NVIDIA NIM.md
"""

import asyncio
import json
import logging
import random
import re
import time

import httpx

from .proveedores import Proveedor, catalogo

log = logging.getLogger("router")


class SinRutasDisponibles(Exception):
    """Todas las rutas están en cooldown o sin cuota."""


class RespuestaInvalida(Exception):
    """El modelo no respetó el contrato JSON."""


class Ruta:
    """Un proveedor con su ventana de tasa y su circuit breaker."""

    def __init__(self, p: Proveedor):
        self.p = p
        self.id = p.id
        self.modelo = p.modelo
        self._marcas: list[float] = []      # ventana deslizante de 60 s
        self._fallos = 0
        self._abierta_hasta = 0.0
        self._lock = asyncio.Lock()

    @property
    def sana(self) -> bool:
        return time.monotonic() >= self._abierta_hasta

    async def reservar(self) -> bool:
        """Toma un cupo del minuto actual.

        Reservar ANTES de llamar evita quemar cuota solo para descubrir que no
        había cuota: el 429 pasa a ser red de seguridad, no mecanismo de control.
        """
        async with self._lock:
            ahora = time.monotonic()
            if ahora < self._abierta_hasta:
                return False
            self._marcas = [m for m in self._marcas if ahora - m < 60.0]
            if len(self._marcas) >= self.p.rpm:
                return False
            self._marcas.append(ahora)
            return True

    def exito(self) -> None:
        self._fallos = 0
        self._abierta_hasta = 0.0

    def fallo(self, espera_seg: float | None = None) -> None:
        self._fallos += 1
        espera = espera_seg if espera_seg is not None else min(2 ** self._fallos, 120)
        self._abierta_hasta = time.monotonic() + espera
        log.warning("ruta %s en cooldown %.0fs (fallos=%d)", self.id, espera, self._fallos)


def _retry_after(resp: httpx.Response) -> float | None:
    valor = resp.headers.get("retry-after")
    try:
        return float(valor) if valor else None
    except ValueError:
        return None


def _extraer_json(contenido: str) -> dict:
    """Tolera bloques <think> y vallas ```json que emiten varios modelos abiertos."""
    limpio = re.sub(r"<think>.*?</think>", "", contenido, flags=re.S).strip()
    valla = re.search(r"```(?:json)?\s*(.+?)\s*```", limpio, flags=re.S)
    if valla:
        limpio = valla.group(1)
    inicio, fin = limpio.find("{"), limpio.rfind("}")
    if inicio == -1 or fin == -1:
        raise RespuestaInvalida("sin objeto JSON en la respuesta")
    try:
        return json.loads(limpio[inicio:fin + 1])
    except json.JSONDecodeError as e:
        raise RespuestaInvalida(f"JSON malformado: {e}") from e


def _validar(datos: dict) -> dict:
    """Contrato de salida. Ver System Prompt - Diagnostico ADN Susana."""
    for clave in ("componentes", "fortaleza", "proximo_paso", "banderas"):
        if clave not in datos:
            raise RespuestaInvalida(f"falta la clave '{clave}'")

    comps = datos["componentes"]
    if not isinstance(comps, list) or len(comps) != 7:
        n = len(comps) if isinstance(comps, list) else "?"
        raise RespuestaInvalida(f"se esperaban 7 componentes, llegaron {n}")

    for c in comps:
        try:
            nivel = float(c["nivel"])
        except (KeyError, TypeError, ValueError) as e:
            raise RespuestaInvalida(f"nivel ilegible en {c.get('id')}") from e
        if not 0 <= nivel <= 4:
            raise RespuestaInvalida(f"nivel fuera de rango en {c.get('id')}: {nivel}")
        # La rúbrica r5 solo define 9 anclajes (0, 0.5, ..., 4). Si el modelo
        # manda algo entre dos anclajes (ej. 3.2), se ajusta al más cercano
        # en vez de rechazar toda la respuesta por un redondeo del proveedor.
        c["nivel"] = round(nivel * 2) / 2

    datos.setdefault("mensaje_cierre", "")
    return datos


class Router:
    def __init__(self, proveedores: list[Proveedor] | None = None):
        self.rutas = [Ruta(p) for p in (proveedores or catalogo())]
        self.cliente = httpx.AsyncClient(
            timeout=httpx.Timeout(90.0, connect=10.0),
            limits=httpx.Limits(max_connections=20),
        )
        log.info("router con %d rutas: %s",
                 len(self.rutas), ", ".join(r.id for r in self.rutas))

    def _candidatas(self) -> list[Ruta]:
        sanas = [r for r in self.rutas if r.sana]
        random.shuffle(sanas)                                  # reparte entre iguales
        return sorted(sanas, key=lambda r: r.p.prioridad)      # ordenación estable

    async def completar(self, mensajes: list[dict], vueltas: int = 3):
        ultimo: Exception | None = None

        for vuelta in range(vueltas):
            for ruta in self._candidatas():
                if not await ruta.reservar():
                    continue
                try:
                    datos = await self._llamar(ruta, mensajes)
                    ruta.exito()
                    return datos, ruta

                except httpx.HTTPStatusError as e:
                    codigo = e.response.status_code
                    espera = _retry_after(e.response)
                    ultimo = e
                    if codigo == 429:
                        ruta.fallo(espera or 60)          # cuota agotada
                    elif codigo in (401, 402, 403, 410):
                        # Llave mala/sin saldo, o modelo retirado (410 Gone:
                        # pasó de moda, ej. NIM 2026-08-26) — no se arregla
                        # solo, cooldown largo para no desperdiciar intentos.
                        ruta.fallo(3600)
                    elif codigo >= 500:
                        ruta.fallo(espera)
                    else:
                        # 4xx nuestro (bug de payload/esquema): reintentar la
                        # MISMA ruta no ayuda, pero abortar completar() entero
                        # tampoco — antes este `raise` tumbaba el intento
                        # completo y nunca llegaba a probar las demás rutas
                        # sanas de la lista. Cooldown corto y se sigue probando.
                        ruta.fallo(30)

                except (httpx.TimeoutException, httpx.TransportError) as e:
                    ultimo = e
                    ruta.fallo()

                except RespuestaInvalida as e:
                    ultimo = e
                    log.warning("ruta %s devolvió JSON inválido: %s", ruta.id, e)
                    ruta.fallo(5)   # este modelo no respeta el contrato: probar otro

            await asyncio.sleep(2 * (vuelta + 1))

        raise SinRutasDisponibles(f"agotadas tras {vueltas} vueltas: {ultimo!r}")

    async def _llamar(self, ruta: Ruta, mensajes: list[dict]) -> dict:
        r = await self.cliente.post(
            f"{ruta.p.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {ruta.p.api_key}"},
            json={
                "model": ruta.p.modelo,
                "messages": mensajes,
                "temperature": ruta.p.temperatura,
                "max_tokens": ruta.p.max_tokens,
                "response_format": {"type": "json_object"},
                **ruta.p.extra,
            },
            timeout=ruta.p.timeout_s,
        )
        r.raise_for_status()
        contenido = r.json()["choices"][0]["message"]["content"]
        return _validar(_extraer_json(contenido))

    async def cerrar(self) -> None:
        await self.cliente.aclose()
