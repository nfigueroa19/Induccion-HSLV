"""Rellena cargo/servicio/perfil_profesional en las filas de `respuestas`
que ya existían antes de la migración 006 (columnas nuevas, no la tenían).
Cruza por cédula descifrada contra `personal`. Idempotente: solo toca filas
con cargo IS NULL.
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
        select r.id as respuesta_id,
               pgp_sym_decrypt(i.cedula_cifrada, $1) as cedula
          from respuestas r
          join identidades i on i.id = r.identidad_id
         where r.cargo is null
        """,
        cfg.clave_datos,
    )

    actualizadas = 0
    for f in filas:
        personal = await p.fetchrow(
            "select cargo, proceso, perfil from personal where cedula = $1",
            int(f["cedula"]),
        )
        if personal is None:
            continue
        await p.execute(
            """
            update respuestas
               set cargo = $2, servicio = $3, perfil_profesional = $4
             where id = $1
            """,
            f["respuesta_id"], personal["cargo"], personal["proceso"], personal["perfil"],
        )
        actualizadas += 1

    print(f"{actualizadas}/{len(filas)} fila(s) de respuestas actualizadas.")
    await db.cerrar()


if __name__ == "__main__":
    asyncio.run(main())
