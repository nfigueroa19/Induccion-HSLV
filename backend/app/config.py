from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Base de datos -----------------------------------------------------
    database_url: str

    # --- Cifrado -----------------------------------------------------------
    clave_datos: str          # llave de pgp_sym_encrypt (nombre y cédula)
    pepper_cedula: str        # sal del HMAC; si cambia, se rompe la deduplicación
    campana: str = "2026"

    # --- HTTP --------------------------------------------------------------
    origenes: str = "http://localhost:8899"
    admin_token: str = ""     # protege /v1/estado; vacío = endpoint deshabilitado

    # --- Panel de administración (jefes de servicio) ------------------------
    jwt_secret: str = ""      # firma los tokens de sesión del login; vacío = endpoints deshabilitados
    admin_sesion_min: int = 15  # vida del token; el frontend además cierra sesión por inactividad

    # --- Correo (Resend) -----------------------------------------------------
    # Vacío = envío deshabilitado (no revienta, solo no manda nada).
    resend_api_key: str = ""
    # Antes de verificar el dominio en Resend, solo puede ser
    # "onboarding@resend.dev" (y solo llega a la cuenta dueña de la API key).
    resend_from: str = "Unidad de Inteligencia Artificial HSLV <onboarding@resend.dev>"
    # Base pública de esta misma API — el correo referencia
    # {api_base_url}/v1/gauge/{porcentaje} como <img src>. Tiene que ser una
    # URL real y alcanzable desde internet: Gmail (web y app) bloquea
    # imágenes data:base64 incrustadas, así que el logo-medidor no puede ir
    # embebido en el HTML, tiene que sevirse desde una URL aparte.
    api_base_url: str = "https://induccion-hslv-api.onrender.com"

    # --- Worker ------------------------------------------------------------
    worker_embebido: bool = False
    # Antes en 8/4: con NIM tardando 20-55s por llamada, un lote tan chico
    # marcaba el ritmo de TODO el ciclo al del proveedor más lento, sin
    # importar cuánta concurrencia hubiera. Subido tras medir con
    # prueba_carga.py — ver minuta 2026-08-11.
    worker_lote: int = 30
    worker_concurrencia: int = 30
    worker_pausa_seg: float = 2.0

    # --- Proveedores de LLM (todos opcionales: se usan los que estén) -------
    omniroute_base_url: str = ""
    omniroute_api_key: str = ""
    openai_api_key: str = ""
    nvidia_api_key: str = ""
    groq_api_key: str = ""
    cerebras_api_key: str = ""
    openrouter_api_key: str = ""
    gemini_api_key: str = ""
    sambanova_api_key: str = ""
    mistral_api_key: str = ""

    @property
    def lista_origenes(self) -> list[str]:
        return [o.strip() for o in self.origenes.split(",") if o.strip()]


cfg = Config()
