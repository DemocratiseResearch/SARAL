"""
Centralized configuration — every environment variable the backend needs is declared here.
Uses pydantic-settings so values are validated on startup (fast-fail if something is missing).
"""

from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # ── Project paths ──────────────────────────────────────────────────
    BASE_DIR: Path = Path(__file__).resolve().parent.parent  # backend/
    DATA_DIR: Path = Path(__file__).resolve().parent.parent.parent / "data"
    TEMP_DIR: Path = Path(__file__).resolve().parent.parent.parent / "temp"

    # ── Database ───────────────────────────────────────────────────────
    # PostgreSQL: postgresql://user:password@localhost:5432/saral
    # No default — must be set explicitly in .env so new developers don't
    # accidentally connect to the wrong database.
    DATABASE_URL: str = ""

    # ── Firebase ───────────────────────────────────────────────────────
    FIREBASE_SERVICE_ACCOUNT_BASE64: str = ""
    FIREBASE_SERVICE_ACCOUNT_PATH: str = ""

    # ── API keys (optional server-level defaults) ─────────────────────
    SARVAM_API_KEY: str = ""

    # ── LLM (any provider via LiteLLM) ──────────────────────────────
    # Model format: "provider/model" e.g. gemini/gemini-2.0-flash, gpt-4o-mini,
    # anthropic/claude-3-haiku-20240307, groq/llama3-8b-8192, ollama/llama3
    # See https://docs.litellm.ai/docs/providers for full list.
    LLM_MODEL: str = ""
    LLM_API_KEY: str = ""

    # ── Auth ──────────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # ── YouTube upload ────────────────────────────────────────────────
    YOUTUBE_CLIENT_ID: str = ""
    YOUTUBE_CLIENT_SECRET: str = ""

    # ── CORS ──────────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # ── General ───────────────────────────────────────────────────────
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }

    def model_post_init(self, __context):
        if not self.DATABASE_URL:
            raise ValueError(
                "DATABASE_URL is not set. Add it to your .env file.\n"
                "Example: DATABASE_URL=postgresql://youruser@localhost:5432/saral\n"
                "See backend/.env.example for details."
            )

        if not self.LLM_MODEL:
            raise ValueError(
                "LLM_MODEL is not set. Add it to your .env file.\n"
                "Example: LLM_MODEL=gpt-4o-mini\n"
                "See backend/.env.example for details."
            )


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton — read once, reuse everywhere."""
    return Settings()
