"""Catálogo de proveedores de LLM.

Solo entran los que tengan llave configurada, así que se puede empezar con uno
solo (NVIDIA NIM) e ir sumando sin tocar código.

Los identificadores de modelo cambian con el tiempo: están aislados aquí a
propósito para que actualizarlos sea una línea.

ANTES DE PRODUCCIÓN: la lista final la aprueba jurídica, no la disponibilidad
técnica. Solo entran proveedores que garanticen no entrenar con las peticiones.
Ver el Paso 0 en Segundo Cerebro/01 - Arquitectura/Arquitectura de despliegue
y pipeline asincrono.md
"""

from dataclasses import dataclass

from ..config import cfg


@dataclass(frozen=True)
class Proveedor:
    id: str
    base_url: str
    api_key: str
    modelo: str
    rpm: int                  # límite local, por debajo del real del proveedor
    prioridad: int            # menor = se intenta primero
    temperatura: float = 0.2
    max_tokens: int = 900
    timeout_s: float = 90.0


NIM_URL = "https://integrate.api.nvidia.com/v1"
GROQ_URL = "https://api.groq.com/openai/v1"
CEREBRAS_URL = "https://api.cerebras.ai/v1"
OPENROUTER_URL = "https://openrouter.ai/api/v1"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai"


def catalogo() -> list[Proveedor]:
    rutas: list[Proveedor] = []

    # Prioridad 1-2: OmniRoute, si está corriendo (en local, o auto-hospedado).
    # Vacío en el despliegue gratuito de Render: allí los combos los hace
    # router.py directamente sobre las rutas de abajo.
    if cfg.omniroute_base_url and cfg.omniroute_api_key:
        rutas += [
            Proveedor(
                id="omniroute:adn-gratis",
                base_url=cfg.omniroute_base_url,
                api_key=cfg.omniroute_api_key,
                modelo="combo/adn-gratis",
                rpm=120,
                prioridad=1,
            ),
            Proveedor(
                id="omniroute:adn-respaldo",
                base_url=cfg.omniroute_base_url,
                api_key=cfg.omniroute_api_key,
                modelo="combo/adn-respaldo",
                rpm=60,
                prioridad=2,
            ),
        ]

    # Prioridad 3: rutas directas. Sobreviven a que OmniRoute esté caído.
    if cfg.nvidia_api_key:
        rutas += [
            Proveedor(
                id="nim:llama-3.3-70b",
                base_url=NIM_URL,
                api_key=cfg.nvidia_api_key,
                modelo="meta/llama-3.3-70b-instruct",
                rpm=18,                    # dos rutas NIM comparten el límite de ~40
                prioridad=3,
            ),
            Proveedor(
                id="nim:nemotron-70b",
                base_url=NIM_URL,
                api_key=cfg.nvidia_api_key,
                modelo="nvidia/llama-3.1-nemotron-70b-instruct",
                rpm=18,
                prioridad=3,
            ),
        ]

    if cfg.groq_api_key:
        rutas.append(Proveedor(
            id="groq:llama-3.3-70b",
            base_url=GROQ_URL,
            api_key=cfg.groq_api_key,
            modelo="llama-3.3-70b-versatile",
            rpm=25,
            prioridad=3,
        ))

    if cfg.cerebras_api_key:
        rutas.append(Proveedor(
            id="cerebras:llama-3.3-70b",
            base_url=CEREBRAS_URL,
            api_key=cfg.cerebras_api_key,
            modelo="llama-3.3-70b",
            rpm=25,
            prioridad=3,
        ))

    if cfg.gemini_api_key:
        rutas.append(Proveedor(
            id="gemini:flash",
            base_url=GEMINI_URL,
            api_key=cfg.gemini_api_key,
            modelo="gemini-2.0-flash",
            rpm=12,
            prioridad=4,
        ))

    # Prioridad 5: último recurso. Modelos ":free" de OpenRouter, más lentos
    # y con cuota diaria baja, pero sirven de colchón.
    if cfg.openrouter_api_key:
        rutas.append(Proveedor(
            id="openrouter:libre",
            base_url=OPENROUTER_URL,
            api_key=cfg.openrouter_api_key,
            modelo="meta-llama/llama-3.3-70b-instruct:free",
            rpm=10,
            prioridad=5,
        ))

    if not rutas:
        raise RuntimeError(
            "No hay proveedores configurados. Define al menos NVIDIA_API_KEY "
            "en el entorno (ver backend/.env.example)."
        )
    return rutas
