from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "AI Fleet Route Optimizer"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api/v1"

    # Database: Defaults to SQLite for zero-config local run, seamlessly accepts PostgreSQL
    DATABASE_URL: str = "sqlite:///./fleet_opt.db"

    # Security & JWT
    SECRET_KEY: str = "supersecret_fleet_optimizer_jwt_key_development_only_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # Road routing (Track A): "osrm" draws and times routes on the real road network, "estimate" uses the
    # offline haversine model. Point OSRM_URL at a self-hosted OSRM for production traffic.
    ROAD_ROUTING: str = "osrm"
    OSRM_URL: str = "https://router.project-osrm.org"
    OSRM_TIMEOUT_S: float = 6.0
    # Time-of-day congestion (rush hours) applied to every drive time; see services/optimizer/traffic.py.
    TRAFFIC_MODEL: bool = True

    # CORS Whitelist
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://fleet-route-opt.vercel.app",
    ]

    # Only this project's Vercel deployments (production and previews), not every *.vercel.app site.
    BACKEND_CORS_ORIGIN_REGEX: str = r"https://fleet-route-opt(-[a-z0-9-]+)?\.vercel\.app"

    # API hardening (Week 14, Track B) - see app/core/http_security.py
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_AUTH_PER_MIN: int = 10        # login / register attempts per client
    RATE_LIMIT_AI_PER_MIN: int = 60          # copilot, disruption agent, RAG search
    RATE_LIMIT_EXPORT_PER_MIN: int = 20      # CSV / PDF generation
    RATE_LIMIT_DEFAULT_PER_MIN: int = 600    # everything else under /api/v1
    TRUST_PROXY_HEADERS: bool = False        # true only behind the bundled Nginx, which sets X-Real-IP
    MAX_REQUEST_BYTES: int = 10 * 1024 * 1024
    # POST /auth/seed-demo-users creates accounts with a published password. Unset = on in development, off in
    # production (APP_ENV=production); set true/false to override.
    DEMO_ACCOUNTS_ENABLED: Optional[bool] = None

    @property
    def demo_accounts_enabled(self) -> bool:
        if self.DEMO_ACCOUNTS_ENABLED is not None:
            return self.DEMO_ACCOUNTS_ENABLED
        return self.APP_ENV != "production"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
