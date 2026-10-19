"""Atajo: la marca de agua vive en app/marca_agua.py (la usan la API y estos scripts)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.marca_agua import *   # noqa: F401,F403,E402
