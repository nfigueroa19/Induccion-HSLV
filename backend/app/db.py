import asyncpg

from .config import cfg

_pool: asyncpg.Pool | None = None


async def iniciar() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            cfg.database_url,
            min_size=1,
            max_size=8,
            command_timeout=30,
            # Obligatorio con el pooler de Supabase en modo transacción:
            # pgbouncer no soporta prepared statements con nombre.
            statement_cache_size=0,
        )
    return _pool


async def pool() -> asyncpg.Pool:
    return _pool if _pool is not None else await iniciar()


async def cerrar() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
