"""Arranca la API local apuntando a la campaña de prueba de siempre
("carga-prueba"), la que ya tenía datos antes de la demo del dashboard en
tiempo real. Mismo patrón que correr_api_demo.py, campaña distinta.
"""

import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(_BACKEND_DIR)
sys.path.insert(0, str(_BACKEND_DIR))

os.environ["CAMPANA"] = "carga-prueba"
os.environ["WORKER_EMBEBIDO"] = "false"

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000)
