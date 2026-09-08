"""Arranca la API local tal cual queda configurada en `.env`, sin forzar
ninguna variable — a diferencia de correr_api_demo.py / correr_api_carga_prueba.py,
que existen para pisar CAMPANA/WORKER_EMBEBIDO en escenarios puntuales.

Esta es la forma normal de levantar el backend local: usa CAMPANA y
WORKER_EMBEBIDO como estén en el .env real (worker embebido incluido, para
que las respuestas nuevas sí se procesen), con recarga automática al guardar
cambios en el código.
"""

import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
# Puede lanzarse desde cualquier directorio: se para en backend/ para que
# Config() encuentre el .env real (ruta relativa) y para que uvicorn.run()
# resuelva "app.main:app" por sys.path. Mismo patrón que correr_api_demo.py.
os.chdir(_BACKEND_DIR)
sys.path.insert(0, str(_BACKEND_DIR))

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
