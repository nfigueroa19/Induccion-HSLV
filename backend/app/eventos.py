"""Pub/sub en memoria para avisar al dashboard cuando hay un diagnóstico nuevo.

Vive en un solo proceso (WORKER_EMBEBIDO=true: worker y API comparten proceso
en el plan gratuito de Render) — no hace falta Redis ni nada externo. Si algún
día el worker vuelve a correr aparte (ver render.yaml), esto deja de avisar
entre procesos y el stream cae de vuelta a su propio ping de keep-alive cada
pocos segundos, que ya sirve como polling silencioso de respaldo.
"""

import asyncio

_suscriptores: set[asyncio.Queue] = set()


def suscribirse() -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=1)
    _suscriptores.add(q)
    return q


def desuscribirse(q: asyncio.Queue) -> None:
    _suscriptores.discard(q)


def avisar_diagnostico_nuevo() -> None:
    for q in _suscriptores:
        # maxsize=1 y descarta si ya hay un aviso pendiente: no importa
        # cuántos diagnósticos se acumulen entre un vistazo del cliente y el
        # siguiente, un solo aviso alcanza para que vuelva a pedir el estado
        # completo.
        if q.empty():
            try:
                q.put_nowait(None)
            except asyncio.QueueFull:
                pass
