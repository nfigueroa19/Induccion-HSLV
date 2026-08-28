"""Arranca la API local apuntando a la campaña de prueba `demo-local`, para
usar con scripts/simular_dashboard_local.py sin editar el .env real.

Fuerza WORKER_EMBEBIDO=false: esta campaña solo recibe filas ya resueltas
que el script de simulación copia directamente en estado 'listo', así que el
worker no tiene nada legítimo que reclamar — apagarlo evita que, por error,
llegue a intentar procesar algo con las llaves de LLM reales.
"""

import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
# Puede lanzarse desde cualquier directorio: se para en backend/ para que
# Config() encuentre el .env real (ruta relativa) y para que uvicorn.run()
# resuelva "app.main:app" por sys.path.
os.chdir(_BACKEND_DIR)
sys.path.insert(0, str(_BACKEND_DIR))

os.environ["CAMPANA"] = "demo-local"
os.environ["WORKER_EMBEBIDO"] = "false"

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
