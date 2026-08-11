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

    # --- Worker ------------------------------------------------------------
    worker_embebido: bool = False
    worker_lote: int = 8
    worker_concurrencia: int = 4
    worker_pausa_seg: float = 2.0

    # --- Proveedores de LLM (todos opcionales: se usan los que estén) -------
    omniroute_base_url: str = ""
    omniroute_api_key: str = ""
    nvidia_api_key: str = ""
    groq_api_key: str = ""
    cerebras_api_key: str = ""
    openrouter_api_key: str = ""
    gemini_api_key: str = ""

    @property
    def lista_origenes(self) -> list[str]:
        return [o.strip() for o in self.origenes.split(",") if o.strip()]


cfg = Config()
