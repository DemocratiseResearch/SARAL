"""API key storage — encrypted keys per user per provider."""

from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class ApiKey(SQLModel, table=True):
    __tablename__ = "api_keys"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    provider: str  # "gemini" | "sarvam" | "openai"
    encrypted_key: str  # Fernet-encrypted API key
    is_valid: bool = True  # Validated once on submission
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
