import os

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    PROJECT_NAME: str = "Zoomathia API"
    VERSION: str = "1.0.0"
    API_PREFIX: str = ""

    # Endpoint SPARQL distant I3S par défaut (surchargeable via la variable SPARQL_ENDPOINT)
    SPARQL_ENDPOINT: str = "http://zoomathia.i3s.unice.fr/sparql"
    SPARQL_TIMEOUT: float = 30.0

    # Server & CORS
    PORT: int = 3001
    HOST: str = "0.0.0.0"
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost",
        "http://127.0.0.1",
    ]
    # The deployment is same-origin (nginx serves the SPA and proxies /api; Vite proxies /api in
    # development), so no credentialed cross-origin request is needed.
    CORS_ALLOW_CREDENTIALS: bool = False

    # Local paths for data, SPARQL queries and XML texts
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DATA_DIR: str = os.path.join(BASE_DIR, "data")
    XML_DATA_DIR: str = os.path.join(DATA_DIR, "files")
    QUERIES_DIR: str = os.path.join(DATA_DIR, "queries")
    STAGING_DB_PATH: str = os.path.join(DATA_DIR, "staging.db")

    # Accounts and sessions (docs/security.md, "Authentication and accounts").
    SESSION_COOKIE_NAME: str = "zoomathia_session"
    # False only for local development over plain HTTP, never on a deployment: the cookie is
    # then sent on any connection.
    SESSION_COOKIE_SECURE: bool = True
    SESSION_IDLE_DAYS: int = 7
    SESSION_MAX_DAYS: int = 30
    # Registrations stay closed until the privacy notice exists (docs/security.md, "Personal data").
    REGISTRATION_ENABLED: bool = False

    @property
    def DATABASE_URL(self) -> str:  # noqa: N802 - named like the other settings
        """URL of the application database for the async engine (aiosqlite)."""
        url = URL.create("sqlite+aiosqlite", database=self.STAGING_DB_PATH)
        return url.render_as_string(hide_password=False)

    @property
    def ALEMBIC_DATABASE_URL(self) -> str:  # noqa: N802 - named like the other settings
        """URL of the same database for Alembic, which runs on a synchronous engine."""
        url = URL.create("sqlite", database=self.STAGING_DB_PATH)
        return url.render_as_string(hide_password=False)

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
