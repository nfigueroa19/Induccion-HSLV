"""Prueba el prompt y el router SIN base de datos.

Sirve para verificar que las llaves gratuitas funcionan y que el modelo respeta
el contrato JSON, antes de montar nada en Supabase.

    cd backend
    python scripts/probar_llm.py
    python scripts/probar_llm.py --perfil asistencial --area Enfermería
    python scripts/probar_llm.py --texto "mi respuesta de prueba..."

No escribe nada en ningún lado: imprime el resultado en pantalla.
"""

import argparse
import asyncio
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.worker.prompt import PROMPT_VERSION, construir_mensajes   # noqa: E402
from app.worker.puntaje import calcular_porcentaje, nivel_cualitativo  # noqa: E402
from app.worker.router import Router  # noqa: E402

# Ejemplo real de la reunión fundacional: obtuvo 82% / "talento en
# consolidación". Sirve de calibración: si el resultado se aleja mucho de ahí,
# revisar la rúbrica antes que el modelo.
TEXTO_EJEMPLO = (
    "Me encargo del análisis de bases de datos y del desarrollo de las "
    "actividades que respaldan la toma de decisiones y el cumplimiento de los "
    "objetivos institucionales. En cada una de mis funciones procuro que "
    "nuestros colaboradores cuenten con información y herramientas que permitan "
    "brindar la atención segura, humanizada y centrada en la necesidad de "
    "nuestros usuarios y sus familias."
)


async def principal(perfil: str, area: str, texto: str) -> int:
    router = Router()
    mensajes = construir_mensajes(perfil=perfil, area=area, texto=texto)

    print(f"prompt: {PROMPT_VERSION}")
    print(f"perfil: {perfil} | area: {area}")
    print(f"tamaño del system prompt: {len(mensajes[0]['content'])} caracteres\n")

    try:
        datos, ruta = await router.completar(mensajes)
    finally:
        await router.cerrar()

    porcentaje = calcular_porcentaje(datos["componentes"])

    print(f"ruta usada : {ruta.id} ({ruta.modelo})")
    print(f"porcentaje : {porcentaje}%  ->  {nivel_cualitativo(porcentaje)}\n")

    for c in datos["componentes"]:
        marca = "·" if c["nivel"] == 0 else "#" * c["nivel"]
        print(f"  {c['id']}  {c['nivel']}  {marca:<4}  {c.get('nombre', '')}")
        if c.get("evidencia"):
            print(f"          \"{c['evidencia'][:90]}\"")

    print(f"\nfortaleza    : {datos['fortaleza']['texto']}")
    print(f"próximo paso : {datos['proximo_paso']['micro_practica']}")
    print(f"frecuencia   : {datos['proximo_paso']['frecuencia']}")
    print(f"cierre       : {datos.get('mensaje_cierre', '')}")
    print(f"\nbanderas: {json.dumps(datos['banderas'], ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")

    ap = argparse.ArgumentParser()
    ap.add_argument("--perfil", default="administrativo",
                    choices=["administrativo", "asistencial"])
    ap.add_argument("--area", default="Sistemas de Información")
    ap.add_argument("--texto", default=TEXTO_EJEMPLO)
    args = ap.parse_args()

    raise SystemExit(asyncio.run(principal(args.perfil, args.area, args.texto)))
