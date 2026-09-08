"""Borra los registros de asistencia de la campaña actual (.env, hoy
CAMPANA=carga-prueba). NO toca `dispositivos_autorizados` — esa lista de
staff sobrevive entre reinicios de prueba.
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
    borradas = await p.fetchval(
        "with b as (delete from asistencia where campana = $1 returning 1) select count(*) from b",
        cfg.campana,
    )
    print(f"Borrados {borradas} registro(s) de asistencia (campaña={cfg.campana}).")
    print("dispositivos_autorizados NO se tocó.")
    await db.cerrar()


if __name__ == "__main__":
    asyncio.run(main())
