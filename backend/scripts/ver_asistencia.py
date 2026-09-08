"""Lista los registros de asistencia guardados para la campaña actual
(la de .env — CAMPANA=carga-prueba en este momento). Solo lectura.
"""

import asyncio
import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(_BACKEND_DIR)
sys.path.insert(0, str(_BACKEND_DIR))

from app import db  # noqa: E402
from app.config import cfg  # noqa: E402


async def main() -> None:
    p = await db.pool()
    filas = await p.fetch(
        """
        select cedula, encontrado, nombre, area, servicio,
               dispositivo_mac, dispositivo_ip, creado_en
          from asistencia
         where campana = $1
         order by creado_en desc
        """,
        cfg.campana,
    )
    print(f"Campaña: {cfg.campana} — {len(filas)} registro(s)\n")
    for f in filas:
        print(dict(f))
    await db.cerrar()


if __name__ == "__main__":
    asyncio.run(main())
