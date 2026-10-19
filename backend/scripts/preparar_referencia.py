"""Genera app/assets/cert_ref.npz: plantilla en baja resolución + máscara, que la API necesita para leer
la marca (así no hace falta subir la plantilla de 10 MB ni desplegar el fondo sin marca).
Repetir si cambia la plantilla.   python scripts/preparar_referencia.py [plantilla.pdf]"""
import sys
from pathlib import Path

import marca_agua_certificado as marca

P = Path(sys.argv[1]) if len(sys.argv) > 1 else marca.BACKEND.parent.parent / "Induccion" / "certificado reinduccion.pdf"
marca.guardar_referencia(marca.fondo_sin_marca(P))
print("listo:", marca.REFERENCIA, f"{marca.REFERENCIA.stat().st_size/1e3:.0f} KB")
