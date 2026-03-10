"""
Database engine and session factory.
SQLite for development, PostgreSQL for production — switch via DATABASE_URL.
"""

from sqlmodel import SQLModel, Session, create_engine
from app.config import get_settings

settings = get_settings()

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    connect_args=connect_args,
)


def create_db_and_tables():
    """Create all tables. Called once on app startup."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency — one DB session per request."""
    with Session(engine) as session:
        yield session
