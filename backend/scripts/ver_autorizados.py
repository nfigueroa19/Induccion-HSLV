"""Lista los dispositivos autorizados (staff)."""

import asyncio
import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(_BACKEND_DIR)
sys.path.insert(0, str(_BACKEND_DIR))

from app import db  # noqa: E402


async def main() -> None:
    p = await db.pool()
    filas = await p.fetch("select mac, etiqueta, creado_en from dispositivos_autorizados order by creado_en")
    for f in filas:
        print(dict(f))
    await db.cerrar()


if __name__ == "__main__":
    asyncio.run(main())
