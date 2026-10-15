"""Prueba de carga de POST /v1/asistencia. Solo stdlib: se copia y corre en la Pi.

Se ejecuta DESDE la propia Pi contra localhost. Cada petición manda un
X-Forwarded-For distinto (uvicorn solo confía en ese header si viene de
127.0.0.1) para simular celulares con IP propia y no chocar con el límite
de 20/min por IP. Consecuencia: la MAC no se resuelve (IP inventada), así
que esta prueba NO ejercita el bloqueo por MAC, solo el resto del camino
(red a Supabase, pool, insert).

Cédulas sintéticas 9000000000+ (no existen en `personal`), campaña = la del
.env de la Pi. Limpieza al final (SQL, correr en Supabase):

    delete from asistencia where campana = '2026' and cedula::text like '90000%';

Uso:
    python3 prueba_carga_asistencia.py --n 150 --concurrencia 150
"""

import argparse
import json
import statistics
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = "http://127.0.0.1:8000/v1/asistencia"
BASE_CEDULA = 9000000000


def enviar(i: int, tag: int):
    cedula = str(BASE_CEDULA + tag * 100000 + i)
    cuerpo = json.dumps({"cedula": cedula, "encontrado": True, "nombre": "PRUEBA CARGA"}).encode()
    req = urllib.request.Request(
        URL, data=cuerpo, method="POST",
        headers={"Content-Type": "application/json", "X-Forwarded-For": f"10.99.{i // 250}.{i % 250 + 1}"},
    )
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            codigo = r.status
    except urllib.error.HTTPError as e:
        codigo = e.code
    except Exception as e:  # timeout, conexión rechazada
        codigo = type(e).__name__
    return codigo, time.monotonic() - t0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=150)
    ap.add_argument("--concurrencia", type=int, default=150)
    a = ap.parse_args()
    tag = int(time.time()) % 90  # evita chocar con corridas anteriores

    t0 = time.monotonic()
    with ThreadPoolExecutor(max_workers=a.concurrencia) as ex:
        res = list(ex.map(lambda i: enviar(i, tag), range(a.n)))
    total = time.monotonic() - t0

    codigos = {}
    for c, _ in res:
        codigos[c] = codigos.get(c, 0) + 1
    lat = sorted(t for c, t in res if c == 201)
    print(f"{a.n} peticiones, concurrencia {a.concurrencia}, total {total:.1f}s")
    print("códigos:", codigos)
    if lat:
        print(f"latencia 201 -> mediana {statistics.median(lat):.2f}s  "
              f"p95 {lat[int(len(lat) * 0.95) - 1]:.2f}s  máx {lat[-1]:.2f}s")
    print("\nLimpieza (Supabase SQL editor):")
    print("  delete from asistencia where campana = '2026' and cedula::text like '90%' and nombre = 'PRUEBA CARGA';")


if __name__ == "__main__":
    main()
