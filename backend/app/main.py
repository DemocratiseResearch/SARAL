"""
SARAL — FastAPI application entry point.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import create_db_and_tables
from app.auth import init_firebase

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────
    settings = get_settings()
    logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
    logger.info("Creating database tables …")
    create_db_and_tables()
    init_firebase()
    logger.info("SARAL backend ready")
    yield
    # ── Shutdown ──────────────────────────────────────────────────────────
    logger.info("Shutting down …")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="SARAL API",
        description="Convert research papers into narrated video presentations",
        version="2.0.0",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routes ────────────────────────────────────────────────────────────
    from app.routes.auth import router as auth_router
    from app.routes.papers import router as papers_router
    from app.routes.scripts import router as scripts_router
    from app.routes.media import router as media_router

    app.include_router(auth_router, prefix="/api")
    app.include_router(papers_router, prefix="/api")
    app.include_router(scripts_router, prefix="/api")
    app.include_router(media_router, prefix="/api")

    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
