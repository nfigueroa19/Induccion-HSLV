"""Marca una MAC como dispositivo autorizado (staff): queda exento del
bloqueo de "misma MAC, otra cédula" en /v1/asistencia.

Uso:
    python autorizar_dispositivo.py AA:BB:CC:DD:EE:FF "Nicolas (staff)"

La MAC se obtiene desde el propio celular: en iPhone, Ajustes > General >
Información > Dirección Wi‑Fi (con la "dirección privada" de esa red
desactivada, si no la MAC cambia). En Android, Ajustes > Acerca del
teléfono > Estado > Dirección Wi‑Fi.
"""

import asyncio
import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(_BACKEND_DIR)  # Config() busca .env relativo al cwd
sys.path.insert(0, str(_BACKEND_DIR))

from app import db  # noqa: E402


async def main(mac: str, etiqueta: str) -> None:
    mac = mac.strip().lower().replace("-", ":")
    p = await db.pool()
    await p.execute(
        """
        insert into dispositivos_autorizados (mac, etiqueta)
        values ($1, $2)
        on conflict (mac) do update set etiqueta = excluded.etiqueta
        """,
        mac, etiqueta,
    )
    print(f"Autorizado: {mac} ({etiqueta})")
    await db.cerrar()


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print('Uso: python autorizar_dispositivo.py AA:BB:CC:DD:EE:FF "Etiqueta"')
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
