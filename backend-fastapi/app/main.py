from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.services.sparql_client import sparql_client
from app.routers import (
    works,
    texts,
    concepts,
    competency_questions,
    search,
    export,
    thesaurus,
    annotations,
    sparql_playground,
    saved_queries,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
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

# Configuration CORS propre
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
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

@app.get("/", tags=["Health"])
async def root():
    return {
        "status": "online",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "sparql_endpoint": settings.SPARQL_ENDPOINT,
        "documentation": "/docs"
    }
