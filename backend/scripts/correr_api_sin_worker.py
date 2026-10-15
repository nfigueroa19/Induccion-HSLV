"""Arranca la API local con el `.env` real (misma base de datos) pero SIN el
worker embebido, para poder mirar el panel (/v1/admin/*) sin que este proceso
reclame ni procese respuestas reales de la cola, ni mande correos.

Úsalo cuando solo quieres ver datos en localhost. Para probar el pipeline
completo usa correr_api.py.
"""

import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(_BACKEND_DIR)
sys.path.insert(0, str(_BACKEND_DIR))
# Variable de entorno gana sobre el .env en pydantic-settings.
os.environ["WORKER_EMBEBIDO"] = "false"

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
