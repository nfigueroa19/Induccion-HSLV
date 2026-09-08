"""Prueba manual del correo de diagnóstico, sin tocar la base de datos.

Manda un correo con datos de ejemplo (misma forma que devuelve
GET /v1/respuestas/{id}/diagnostico) al destinatario que se le pase, para
validar dos cosas antes de conectarlo al flujo real:
  1. Que el correo llega (usando RESEND_API_KEY del .env).
  2. Que la plantilla se ve bien en un cliente de correo real.

Sin dominio verificado en Resend, solo puede llegar a la dirección con la
que se creó la cuenta de Resend (limitación de su modo sandbox).

Uso:
    python scripts/probar_correo.py tu-correo@ejemplo.com
"""
import asyncio
import os
import sys
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parents[1]
os.chdir(_BACKEND_DIR)
sys.path.insert(0, str(_BACKEND_DIR))

from app.correo import enviar_diagnostico_email  # noqa: E402

DIAGNOSTICO_EJEMPLO = {
    "listo": True,
    "revision": False,
    "insuficiente": False,
    "porcentaje": 82,
    "nivel": "Talento en consolidación",
    "fortaleza": (
        "Tu respuesta muestra un compromiso claro con la calidad del "
        "servicio y una buena capacidad de adaptación ante los cambios "
        "del día a día en tu proceso."
    ),
    "proximo_paso": {
        "micro_practica": (
            "Profundiza en el componente de comunicación asertiva: revisa "
            "el material de re-inducción sobre manejo de conversaciones "
            "difíciles con pacientes y familias."
        ),
        "frecuencia": "Una vez por semana durante el próximo mes.",
    },
    "mensaje_cierre": (
        "Este es un punto de partida. Gracias por tomarte el tiempo de "
        "responder con honestidad."
    ),
    "componentes": [
        {"id": "vocacion", "nombre": "Vocación de servicio", "nivel": 3, "porcentaje": 85,
         "sugerencia": "Sigue destacando en la atención cercana a pacientes y familias."},
        {"id": "trabajo_equipo", "nombre": "Trabajo en equipo", "nivel": 3, "porcentaje": 80,
         "sugerencia": "Busca más espacios de retroalimentación con tu equipo directo."},
        {"id": "comunicacion", "nombre": "Comunicación asertiva", "nivel": 2, "porcentaje": 60,
         "sugerencia": "Practica técnicas de escucha activa en situaciones de tensión."},
        {"id": "mejora_continua", "nombre": "Mejora continua", "nivel": 3, "porcentaje": 82,
         "sugerencia": "Propone al menos una mejora concreta en tu proceso este trimestre."},
    ],
}


async def main(destinatario: str) -> None:
    ok = await enviar_diagnostico_email(destinatario, DIAGNOSTICO_EJEMPLO)
    if ok:
        print(f"Enviado a {destinatario}. Revisa la bandeja (y spam).")
    else:
        print("No se envió — revisa el log de arriba (RESEND_API_KEY vacío o Resend lo rechazó).")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python scripts/probar_correo.py tu-correo@ejemplo.com")
        sys.exit(1)
    asyncio.run(main(sys.argv[1]))
