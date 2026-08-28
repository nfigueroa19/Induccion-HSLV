"""Repite diagnósticos ya existentes hacia una campaña de prueba, a ritmo
aleatorio, SOLO para ver el dashboard (medallas, cambios de puesto, conteo
animado, pulso de "respuesta nueva") reaccionar en vivo sin gastar cuota de
los proveedores de LLM ni tocar datos reales.

No genera nada nuevo: copia filas de `diagnosticos`/`respuestas` que ya están
en la campaña de origen (por defecto "carga-prueba") hacia una campaña de
prueba nueva (por defecto "demo-local"), una por una, con esperas aleatorias
repartidas en la ventana de tiempo pedida. La API local, apuntando a esa
misma campaña de prueba, las va mostrando a medida que llegan.

SOLO CONTRA LOCAL. Nunca apuntar DATABASE_URL de este script a nada que no
sea la base con la que ya pruebas localmente.

Uso (tres terminales):

  1) API local, en la campaña de prueba (no hace falta el worker: no se
     genera nada nuevo, solo se copian diagnósticos ya hechos):

       cd backend
       CAMPANA=demo-local python -m uvicorn app.main:app --port 8000

  2) Servidor estático del dashboard (o usa el preview del proyecto):

       cd ../web  (o la config "hslv-dashboard" de .claude/launch.json)
       python -m http.server 8899

     Abrir http://localhost:8899/dashboard.html

  3) Este script:

       cd backend
       python scripts/simular_dashboard_local.py --origen carga-prueba --duracion-min 5

Al arrancar, limpia por completo la campaña de destino (DELETE), para que
cada corrida empiece del dashboard vacío. Al terminar, imprime el SQL para
limpiarla de nuevo cuando ya no la necesites.
"""

import argparse
import asyncio
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db  # noqa: E402


async def principal(origen: str, destino: str, duracion_min: float) -> None:
    if origen == destino:
        print("--origen y --destino no pueden ser la misma campaña.")
        return

    pool = await db.iniciar()

    pares = await pool.fetch(
        """
        select r.identidad_id, r.area, r.perfil, r.texto,
               d.porcentaje_global, d.nivel, d.payload, d.proveedor, d.modelo,
               d.prompt_version, d.rubrica_version, d.latencia_ms
          from diagnosticos d
          join respuestas r on r.id = d.respuesta_id
         where r.campana = $1
        """,
        origen,
    )
    if not pares:
        print(f"No hay diagnósticos en la campaña '{origen}'. Nada que simular "
              f"(¿corriste antes scripts/prueba_carga.py con esa campaña?).")
        return

    await pool.execute("delete from respuestas where campana = $1", destino)
    print(f"Campaña de prueba '{destino}' limpiada. Repartiendo {len(pares)} "
          f"diagnósticos de '{origen}' en {duracion_min} min...")

    random.shuffle(pares)
    duracion_seg = duracion_min * 60
    # Espacio parejo entre inserciones, con jitter aleatorio (0.4x-1.6x) para
    # que no lleguen a ritmo de metrónomo — se ve más parecido a respuestas
    # reales llegando que a un temporizador.
    espacio_medio = duracion_seg / len(pares)

    for i, fila in enumerate(pares):
        async with pool.acquire() as con, con.transaction():
            respuesta_id = await con.fetchval(
                """
                insert into respuestas
                       (identidad_id, campana, area, perfil, texto, estado)
                values ($1, $2, $3, $4, $5, 'listo')
                returning id
                """,
                fila["identidad_id"], destino, fila["area"], fila["perfil"], fila["texto"],
            )
            await con.execute(
                """
                insert into diagnosticos
                       (respuesta_id, porcentaje_global, nivel, payload, proveedor,
                        modelo, prompt_version, rubrica_version, latencia_ms)
                values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
                """,
                respuesta_id, fila["porcentaje_global"], fila["nivel"], fila["payload"],
                fila["proveedor"], fila["modelo"], fila["prompt_version"],
                fila["rubrica_version"], fila["latencia_ms"],
            )
        print(f"  [{i + 1}/{len(pares)}] {fila['area']} -> {fila['porcentaje_global']}%")

        if i < len(pares) - 1:
            await asyncio.sleep(random.uniform(espacio_medio * 0.4, espacio_medio * 1.6))

    print("\nListo. Cuando termines de mirar el dashboard, limpia la campaña de "
          f"prueba (en el SQL Editor de Supabase, o aquí mismo si apuntas a la "
          f"base local):\n\n  delete from respuestas where campana = '{destino}';\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origen", default="carga-prueba",
                         help="Campaña de la que se copian diagnósticos ya existentes.")
    parser.add_argument("--destino", default="demo-local",
                         help="Campaña de prueba a la que apunta tu API local (CAMPANA=...).")
    parser.add_argument("--duracion-min", type=float, default=5.0,
                         help="Minutos en los que se reparten las inserciones.")
    args = parser.parse_args()
    asyncio.run(principal(args.origen, args.destino, args.duracion_min))
