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

from dataclasses import dataclass, field

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
    extra: dict = field(default_factory=dict)  # parámetros extra del body, por proveedor


OPENAI_URL = "https://api.openai.com/v1"
NIM_URL = "https://integrate.api.nvidia.com/v1"
GROQ_URL = "https://api.groq.com/openai/v1"
CEREBRAS_URL = "https://api.cerebras.ai/v1"
OPENROUTER_URL = "https://openrouter.ai/api/v1"
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
SAMBANOVA_URL = "https://api.sambanova.ai/v1"
MISTRAL_URL = "https://api.mistral.ai/v1"


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

    # Prioridad 1: OpenAI de pago (recarga de 5 USD, 2026-09-11) — modelo
    # principal. gpt-4o-mini: 0.15 USD/1M tokens entrada, 0.60 USD/1M salida;
    # con el tamaño del prompt de este proyecto un diagnóstico cuesta
    # fracciones de centavo, así que 5 USD alcanzan para miles. Todas las
    # demás rutas (prioridad 3+) quedan de respaldo automático: el router
    # (ver router.py Router._candidatas/completar) solo pasa a la siguiente
    # ruta sana cuando esta falla o se queda sin cupo del minuto.
    if cfg.openai_api_key:
        rutas.append(Proveedor(
            id="openai:gpt-4o-mini",
            base_url=OPENAI_URL,
            api_key=cfg.openai_api_key,
            modelo="gpt-4o-mini",
            rpm=60,                # conservador frente al límite real de tier 1
            prioridad=1,
        ))

    # Prioridad 4: rutas directas de NIM — DESHABILITADAS 2026-09-07.
    # Los dos modelos (meta/llama-3.3-70b-instruct y
    # nvidia/llama-3.3-nemotron-super-49b-v1) llegaron a su end-of-life el
    # 2026-08-26 (confirmado: NIM responde 410 Gone a cualquier request).
    # Antes de este hallazgo, router.py abortaba el intento COMPLETO cuando
    # tocaba una ruta con 410 en vez de saltar a la siguiente — eso causó
    # varios `fallido` permanentes en la prueba de carga con roster real del
    # 2026-09-07 (ver diagnóstico). El bug del router ya se corrigió, pero
    # estas dos rutas siguen sin servir para nada: si se reactivan, hay que
    # primero poner IDs de modelo NIM vigentes.
    # if cfg.nvidia_api_key:
    #     rutas += [
    #         Proveedor(
    #             id="nim:llama-3.3-70b",
    #             base_url=NIM_URL,
    #             api_key=cfg.nvidia_api_key,
    #             modelo="meta/llama-3.3-70b-instruct",
    #             rpm=18,                    # dos rutas NIM comparten el límite de ~40
    #             prioridad=4,
    #         ),
    #         Proveedor(
    #             id="nim:nemotron-super-49b",
    #             base_url=NIM_URL,
    #             api_key=cfg.nvidia_api_key,
    #             modelo="nvidia/llama-3.3-nemotron-super-49b-v1",
    #             rpm=18,
    #             prioridad=4,
    #         ),
    #     ]

    # Reemplazo de las rutas NIM retiradas — mismo endpoint/llave de arriba,
    # modelo nuevo (2026-08-11, Free Endpoint confirmado "Available", a
    # diferencia de los dos de arriba). MoE 30B con solo 3B activos por
    # token: responde tan rápido como un modelo chico pese al nombre "30b".
    # Es un modelo de razonamiento — reasoning_budget en un punto medio
    # (ni 0 = sin pensar, ni el default 16384 = puede comerse max_tokens
    # completo pensando y cortar el JSON, el mismo problema que ya se vio
    # con qwen en Groq). max_tokens subido para dejarle aire a la respuesta
    # después de razonar. temperature/top_p: los que NVIDIA recomienda para
    # este modelo en su ficha, no el 0.2 por defecto de las demás rutas.
    if cfg.nvidia_api_key:
        rutas.append(Proveedor(
            id="nim:nemotron-3.5-lightning-30b",
            base_url=NIM_URL,
            api_key=cfg.nvidia_api_key,
            modelo="nvidia/nemotron-3.5-lightning-30b-a3b",
            rpm=30,
            prioridad=3,
            temperatura=1.0,
            max_tokens=3000,
            extra={"top_p": 0.95, "reasoning_budget": 2048},
        ))

    if cfg.groq_api_key:
        # llama-3.3-70b-versatile se retiró el 2026-08-16 (aviso de Groq).
        # Reemplazo recomendado por Groq: qwen/qwen3.6-27b (27B) en vez de
        # openai/gpt-oss-120b (120B) — más liviano, alcanza para evaluar un
        # texto corto contra una rúbrica, no hace falta el modelo grande.
        # A su vez, qwen3.6-27b se deprecó el 2026-09-07 y se apaga el
        # 2026-09-14 (aviso de Groq por correo); reemplazo: qwen/qwen3.8-27b,
        # mismo tamaño y mismo soporte de reasoning_effort.
        # reasoning_effort="none": es un modelo de razonamiento — sin esto,
        # gasta max_tokens "pensando" y corta el JSON a mitad (probado
        # 2026-08-15: json_validate_failed sin este parámetro).
        rutas.append(Proveedor(
            id="groq:qwen3.8-27b",
            base_url=GROQ_URL,
            api_key=cfg.groq_api_key,
            modelo="qwen/qwen3.8-27b",
            rpm=25,
            prioridad=3,
            extra={"reasoning_effort": "none"},
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

    if cfg.sambanova_api_key:
        rutas.append(Proveedor(
            id="sambanova:llama-3.3-70b",
            base_url=SAMBANOVA_URL,
            api_key=cfg.sambanova_api_key,
            modelo="Meta-Llama-3.3-70B-Instruct",
            rpm=100,               # real: 600 rpm en el tier gratuito; conservador
            prioridad=3,
        ))

    if cfg.mistral_api_key:
        rutas.append(Proveedor(
            id="mistral:small",
            base_url=MISTRAL_URL,
            api_key=cfg.mistral_api_key,
            modelo="mistral-small-latest",
            rpm=50,                # real: ~1 req/s; conservador
            prioridad=3,
        ))

    if cfg.gemini_api_key:
        rutas.append(Proveedor(
            id="gemini:flash",
            base_url=GEMINI_URL,
            api_key=cfg.gemini_api_key,
            modelo="gemini-flash-lite-latest",
            rpm=12,
            prioridad=3,        # subida desde 4 el 2026-08-13, junto con bajar NIM
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
