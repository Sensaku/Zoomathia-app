from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os

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
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost",
        "http://127.0.0.1"
    ]
    
    # Local paths for data, SPARQL queries and XML texts
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DATA_DIR: str = os.path.join(BASE_DIR, "data")
    XML_DATA_DIR: str = os.path.join(DATA_DIR, "files")
    QUERIES_DIR: str = os.path.join(DATA_DIR, "queries")
    STAGING_DB_PATH: str = os.path.join(DATA_DIR, "staging.db")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
