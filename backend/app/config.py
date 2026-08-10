from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "sqlite:///./marcados_dev.db"
    secret_key: str = "dev-only-insecure-key-change-me"
    access_token_expire_minutes: int = 480
    cors_origins: str = "http://localhost:5500"
    environment: str = "development"
    # Sección 17 del handoff: el corte de "ficha incompleta" es configuración,
    # no una constante enterrada en el código.
    ficha_completa_umbral_porcentaje: float = 70.0
    # Ruta local (en el servidor) al libro real usado como plantilla de
    # export (sección 16.2). NUNCA vive en el repositorio: contiene datos
    # personales de menores de edad. Si no está configurada, /export/excel
    # responde 503 en vez de fallar de forma confusa.
    excel_template_path: str | None = None
    # Sección 15 (columnas AG-AJ) y sección 21 del handoff: parámetros del
    # semáforo operativo de asistencia. Mismos valores que trae el Excel
    # real (nombres definidos ParamVentanaDias/ParamUmbralVerde/
    # ParamUmbralAmarillo) — configurables, no una constante en el código.
    # Es una alerta OPERATIVA de asistencia, nunca una conclusión espiritual
    # (eso es 'semaforo_espiritual' en Persona, siempre manual).
    alertas_ventana_dias: int = 30
    alertas_umbral_verde: float = 0.85
    alertas_umbral_amarillo: float = 0.50

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
