"""Crea o actualiza un usuario del panel de administración.

Uso (desde backend/, con el .env local cargado):
    python scripts/crear_admin.py admin admin

La contraseña nunca se guarda en texto plano: solo su hash bcrypt.
"""
import asyncio
import sys

import bcrypt

sys.path.insert(0, ".")
from app import db  # noqa: E402


async def main(usuario: str, contrasena: str) -> None:
    hash_ = bcrypt.hashpw(contrasena.encode(), bcrypt.gensalt()).decode()
    p = await db.pool()
    await p.execute(
        """
        insert into admins (usuario, password_hash)
        values ($1, $2)
        on conflict (usuario) do update set password_hash = excluded.password_hash,
                                             activo = true
        """,
        usuario, hash_,
    )
    await db.cerrar()
    print(f"Usuario '{usuario}' listo.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Uso: python scripts/crear_admin.py <usuario> <contraseña>")
        sys.exit(1)
    asyncio.run(main(sys.argv[1], sys.argv[2]))
