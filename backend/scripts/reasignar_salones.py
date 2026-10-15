"""Reasigna el salón de inscritos en `pre_test` según un CSV
(horario,cedula,nombre,servicio,salon_actual,salon_nuevo). Solo toca la
columna `salon`: no cambia día, horario ni respuestas.

Por defecto es SIMULACIÓN (no escribe). Con --aplicar actualiza en una sola
transacción, y solo las filas cuyo salón actual coincide con el del CSV; si
algo no coincide o los conteos finales no son los esperados, revierte todo.

Uso: python scripts/reasignar_salones.py <csv> --dia 2026-10-13 [--aplicar]
"""

import argparse
import asyncio
import csv
import os
import sys
from collections import Counter
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(_BACKEND_DIR)
sys.path.insert(0, str(_BACKEND_DIR))

from app import db  # noqa: E402
from app.config import cfg  # noqa: E402


async def contar(conn, dia: str) -> Counter:
    filas = await conn.fetch(
        "select horario, salon, count(*) n from pre_test "
        "where campana = $1 and dia = $2 group by 1, 2",
        cfg.campana, dia,
    )
    return Counter({(f["horario"], f["salon"]): f["n"] for f in filas})


def mostrar(titulo: str, c: Counter) -> None:
    print(titulo)
    for h in ("7:30", "13:30"):
        print(f"  {h:>5}  huella={c[(h, 'huella')]:>3}  memoria={c[(h, 'memoria')]:>3}")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--dia", required=True)
    ap.add_argument("--aplicar", action="store_true")
    args = ap.parse_args()

    with open(args.csv, encoding="utf-8-sig", newline="") as f:
        cambios = list(csv.DictReader(f))

    p = await db.pool()
    async with p.acquire() as conn:
        antes = await contar(conn, args.dia)
        esperado = Counter(antes)
        for c in cambios:
            esperado[(c["horario"], c["salon_actual"])] -= 1
            esperado[(c["horario"], c["salon_nuevo"])] += 1

        mostrar(f"Campaña {cfg.campana}, día {args.dia} — ACTUAL", antes)
        mostrar("ESPERADO tras el cambio", esperado)
        print(f"\n{len(cambios)} cambio(s) en el CSV")

        tx = conn.transaction()
        await tx.start()
        try:
            for c in cambios:
                r = await conn.execute(
                    "update pre_test set salon = $1 "
                    "where campana = $2 and dia = $3 and horario = $4 "
                    "and cedula = $5 and salon = $6",
                    c["salon_nuevo"], cfg.campana, args.dia,
                    c["horario"], int(c["cedula"]), c["salon_actual"],
                )
                if r != "UPDATE 1":
                    raise RuntimeError(f"cédula {c['cedula']}: esperaba 1 fila y fue '{r}'")
            despues = await contar(conn, args.dia)
            if despues != esperado:
                raise RuntimeError("los conteos finales no coinciden con lo esperado")
            if args.aplicar:
                await tx.commit()
                mostrar("\nAPLICADO — conteos reales", despues)
            else:
                await tx.rollback()
                print("\nSIMULACIÓN: la transacción se probó completa y se revirtió. No se escribió nada.")
                print("Para aplicar de verdad, repite el comando con --aplicar.")
        except Exception:
            await tx.rollback()
            raise


asyncio.run(main())
