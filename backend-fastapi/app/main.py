import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.accounts.router import router as accounts_router
from app.core.config import settings
from app.core.database import Database
from app.core.migrations import ensure_database_is_current
from app.routers import (
    annotations,
    competency_questions,
    concepts,
    export,
    saved_queries,
    search,
    sparql_playground,
    texts,
    thesaurus,
    works,
)
from app.services.sparql_client import sparql_client
from app.services.staging_store import staging_store
from app.shared.errors import register_error_handlers

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Check that the database is migrated, seed the native questions, then serve.

    The schema belongs to Alembic: an application whose database is not at the latest
    revision refuses to start, with the command to run.
    """
    if not settings.SESSION_COOKIE_SECURE:
        logger.warning(
            "SESSION_COOKIE_SECURE is false: the session cookie is sent over plain HTTP. "
            "Only acceptable for local development."
        )
    database = Database(settings.DATABASE_URL)
    app.state.database = database
    try:
        await ensure_database_is_current(database)
        await asyncio.to_thread(staging_store.seed_builtin_queries)
        yield
    finally:
        await database.dispose()
        await sparql_client.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="API FastAPI moderne, sécurisée et asynchrone pour la plateforme Zoomathia",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    swagger_ui_parameters={
        "displayRequestDuration": True,
        "filter": True,
        "persistAuthorization": True,
    },
)

register_error_handlers(app)

# Configuration CORS propre
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routeurs
app.include_router(works.router)
app.include_router(texts.router)
app.include_router(concepts.router)
app.include_router(competency_questions.router)
app.include_router(search.router)
app.include_router(export.router)
app.include_router(thesaurus.router)
app.include_router(annotations.router)
app.include_router(sparql_playground.router)
app.include_router(saved_queries.router)
app.include_router(accounts_router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "sparql_endpoint": settings.SPARQL_ENDPOINT,
        "documentation": "/docs",
    }
