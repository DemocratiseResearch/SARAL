"""Request / response schemas for script endpoints."""

from pydantic import BaseModel
from typing import Optional


class SectionScript(BaseModel):
    id: int
    section_name: str
    content: str = ""
    bullet_points: list[str] = []
    assigned_image: Optional[str] = None


class ScriptResponse(BaseModel):
    paper_id: str
    sections: list[SectionScript] = []
    title_intro_script: str = ""
    status: str = "generated"


class ScriptUpdateRequest(BaseModel):
    content: Optional[str] = None
    bullet_points: Optional[list[str]] = None
    assigned_image: Optional[str] = None
