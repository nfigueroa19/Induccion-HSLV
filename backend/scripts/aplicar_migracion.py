"""Aplica un archivo .sql de backend/sql/ directo contra la base de datos
configurada en .env, sin pasar por el panel web de Supabase.

Uso:
    python aplicar_migracion.py 004_asistencia.sql
"""

import asyncio
import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(_BACKEND_DIR)  # Config() busca .env relativo al cwd
sys.path.insert(0, str(_BACKEND_DIR))

from app import db  # noqa: E402


async def main(nombre_archivo: str) -> None:
    ruta = _BACKEND_DIR / "sql" / nombre_archivo
    sql = ruta.read_text(encoding="utf-8")
    p = await db.pool()
    async with p.acquire() as con:
        await con.execute(sql)
    print(f"Aplicado: {ruta}")
    await db.cerrar()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python aplicar_migracion.py <archivo.sql en backend/sql/>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
