"""Borra TODAS las respuestas/diagnósticos/identidades de la campaña actual
(.env, hoy CAMPANA=carga-prueba) para volver a correr una simulación de carga
desde cero. NO toca `personal` (el roster real de RR.HH. sobrevive).

`identidades` se borra directo; `respuestas`, `diagnosticos` y `eventos_worker`
caen solos por los "on delete cascade" del esquema (001_schema.sql).
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
    if cfg.campana == "2026":
        print("AVISO: CAMPANA='2026' (la real). Este script no corre contra la "
              "campaña real. Cambia CAMPANA en .env antes de continuar.")
        raise SystemExit(1)

    p = await db.pool()
    borradas = await p.fetchval(
        "with b as (delete from identidades where campana = $1 returning 1) select count(*) from b",
        cfg.campana,
    )
    print(f"Borradas {borradas} identidad(es) — respuestas/diagnosticos/eventos_worker "
          f"cayeron en cascada (campaña={cfg.campana}).")
    print("`personal` NO se tocó.")
    await db.cerrar()


if __name__ == "__main__":
    asyncio.run(main())
