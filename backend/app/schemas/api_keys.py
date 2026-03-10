"""Request / response schemas for API key management."""

from pydantic import BaseModel
from typing import Optional


class ApiKeysRequest(BaseModel):
    llm_key: Optional[str] = None
    sarvam_key: Optional[str] = None


class ApiKeysStatus(BaseModel):
    llm_configured: bool = False
    sarvam_configured: bool = False
