"""Variante de prueba_carga.py que usa cédulas REALES del roster `personal`
en vez de cédulas inventadas — para probar el sistema con datos reales de
verdad (cargo/proceso/perfil llegando al prompt del LLM y al panel), no con
gente sintética que nunca existió en `personal`.

SOLO CONTRA LOCAL, igual que prueba_carga.py (misma protección --url).

Reutiliza los bancos de texto y la mecánica de envío de prueba_carga.py —
solo cambia de dónde sale cada persona (roster real, sample sin reemplazo,
en vez de generar cédula/nombre al vuelo).

Uso:
    cd backend
    CAMPANA=carga-prueba python scripts/limpiar_respuestas_prueba.py
    CAMPANA=carga-prueba python scripts/prueba_carga_roster.py --n 650
"""

import argparse
import asyncio
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db  # noqa: E402
from app.config import cfg  # noqa: E402
from app.main import AREAS_ASISTENCIALES  # noqa: E402

from prueba_carga import (  # noqa: E402
    BANCOS, TONOS, PESOS_TONO, enviar, generar_llegadas_realistas,
    esperar_drenaje,
)

import httpx  # noqa: E402
from datetime import datetime, timezone  # noqa: E402


async def elegir_roster(n: int) -> list[dict]:
    """n personas al azar y sin repetir de `personal` (roster real de RR.HH.,
    solo origen='rrhh' — no arrastra autorregistros de corridas anteriores)."""
    p = await db.pool()
    filas = await p.fetch(
        """
        select cedula, nombre_completo, area
          from personal
         where origen = 'rrhh' and area is not null and nombre_completo is not null
         order by random()
         limit $1
        """,
        n,
    )
    return [dict(f) for f in filas]


def generar_payload_roster(persona: dict) -> dict:
    area = persona["area"]
    perfil = "asistencial" if area in AREAS_ASISTENCIALES or area.strip().lower() == "asistencial" else "administrativo"
    tono = random.choices(TONOS, weights=PESOS_TONO, k=1)[0]
    texto = random.choice(BANCOS[(perfil, tono)])
    return {
        "nombre": persona["nombre_completo"],
        "cedula": str(persona["cedula"]),
        "area": area,
        "texto": texto,
    }


async def enviar_todas_roster(
    url: str, personas: list[dict], concurrencia: int, patron: str, duracion_min: float,
) -> None:
    n = len(personas)
    sem = asyncio.Semaphore(concurrencia)

    if patron == "rafaga":
        llegadas = [0.0] * n
    else:
        llegadas = generar_llegadas_realistas(n, duracion_min * 60)
        print(f"patrón realista: {n} respuestas repartidas en {duracion_min:.0f} min "
              f"(goteo inicial, pico ~{0.55 * duracion_min:.0f} min, rezagados al final)")

    async with httpx.AsyncClient() as cliente:
        t0 = time.monotonic()
        resultados = await asyncio.gather(*(
            enviar(cliente, url, generar_payload_roster(persona), sem, espera=llegadas[i], t0=t0)
            for i, persona in enumerate(personas)
        ))
        dt = time.monotonic() - t0

    conteo: dict = {}
    for codigo in resultados:
        conteo[codigo] = conteo.get(codigo, 0) + 1

    print(f"\nenvío de {n} respuestas en {dt:.1f}s ({n / dt:.1f} req/s promedio)")
    for codigo, cnt in sorted(conteo.items(), key=lambda x: str(x[0])):
        print(f"  {codigo}: {cnt}")


async def principal(
    url: str, n: int, concurrencia: int, solo_enviar: bool,
    patron: str, duracion_min: float,
) -> None:
    if cfg.campana == "2026":
        print("AVISO: CAMPANA sigue en '2026' (la real). Cambia a carga-prueba "
              "antes de seguir. Ctrl+C para cancelar.")
        await asyncio.sleep(5)

    personas = await elegir_roster(n)
    print(f"{len(personas)} persona(s) reales tomadas de `personal` (roster RR.HH.)")
    if len(personas) < n:
        print(f"AVISO: se pidieron {n} pero el roster solo dio {len(personas)} filas útiles.")

    desde = datetime.now(timezone.utc)
    await enviar_todas_roster(url, personas, concurrencia, patron, duracion_min)

    if not solo_enviar:
        await esperar_drenaje(desde)

    print(f"""
Para limpiar y volver a correr desde cero:
  CAMPANA={cfg.campana} python scripts/limpiar_respuestas_prueba.py
""")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:8000")
    ap.add_argument("--n", type=int, default=650, help="cantidad de personas del roster a simular")
    ap.add_argument("--concurrencia", type=int, default=50, help="POSTs simultáneos máximos")
    ap.add_argument(
        "--patron", choices=["realista", "rafaga"], default="realista",
        help="realista = goteo/pico/rezagados repartido en --duracion-min; "
             "rafaga = todo de una vez (techo de capacidad)",
    )
    ap.add_argument(
        "--duracion-min", type=float, default=90.0,
        help="ventana de tiempo (minutos) en la que llegan las --n respuestas, "
             "solo aplica con --patron realista",
    )
    ap.add_argument(
        "--solo-enviar", action="store_true",
        help="no esperar el drenaje de la cola, solo medir el envío",
    )
    args = ap.parse_args()

    if "render.com" in args.url or "onrender.com" in args.url:
        print("Este script no corre contra producción/Render. Usa --url http://localhost:8000")
        raise SystemExit(1)

    asyncio.run(principal(
        args.url, args.n, args.concurrencia, args.solo_enviar,
        args.patron, args.duracion_min,
    ))
