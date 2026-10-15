"""Regenera la tabla `certificacion` (foto de la Reinducción 2026).

Reutiliza `_respuestas_en_vivo` (la misma lógica del panel de gestión interna),
así que las cifras coinciden con lo que ven los jefes. Entra quien tenga al
menos uno de: inscripción, asistencia, puntaje pre-test, puntaje post-test o
diagnóstico. No modifica ninguna otra tabla.

Uso (desde backend/, con el .env cargado):
    python scripts/generar_certificacion.py
"""
import asyncio
import json
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, ".")
from app import db  # noqa: E402
from app.main import _respuestas_en_vivo  # noqa: E402

DIAS = {"2026-10-13": "Mar 13 oct", "2026-10-14": "Mié 14 oct"}
HORARIOS = {"7:30": "7:30 a.m.", "13:30": "1:30 p.m."}


def inscripcion(d):
    if not d.get("salon"):
        return None
    return f"{DIAS.get(d['dia'], d['dia'])} · {HORARIOS.get(d['horario'], d['horario'])} · {d['salon'].capitalize()}"


async def main() -> None:
    resp = await _respuestas_en_vivo(usuario="script")
    filas = json.loads(resp.body)["respuestas"]
    sql = """
        insert into certificacion (cedula, nombre, cargo, proceso, entidad, inscripcion,
            asistencia, puntaje_pretest, total_pretest, puntaje_posttest, total_posttest,
            adn_susana, origen)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    """
    json_total_pre = json.loads(resp.body)["total_preguntas_pretest"]
    registros = []
    for d in filas:
        if not (d.get("salon") or d.get("asistencia_en") or d.get("puntaje_pretest") is not None
                or d.get("puntaje_posttest") is not None or d.get("porcentaje") is not None):
            continue
        registros.append((
            int(d["cedula"]), d["nombre"], d.get("cargo"), d.get("servicio"), d.get("entidad"),
            inscripcion(d),
            datetime.fromisoformat(d["asistencia_en"]) if d.get("asistencia_en") else None,
            d.get("puntaje_pretest"), json_total_pre if d.get("puntaje_pretest") is not None else None,
            d.get("puntaje_posttest"),
            (d.get("total_posttest") or json_total_pre) if d.get("puntaje_posttest") is not None else None,
            d.get("porcentaje"), d.get("origen_personal"),
        ))
    p = await db.pool()
    async with p.acquire() as con:
        async with con.transaction():
            await con.execute("truncate certificacion")
            await con.executemany(sql, registros)
    print(f"certificacion: {len(registros)} personas")
    await db.cerrar()


if __name__ == "__main__":
    asyncio.run(main())
