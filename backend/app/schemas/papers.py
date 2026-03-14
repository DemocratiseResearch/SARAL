"""Request / response schemas for paper endpoints."""

from pydantic import BaseModel
from typing import Optional


class ArxivRequest(BaseModel):
    arxiv_url: str


class PaperMetadata(BaseModel):
    title: str = "Research Paper"
    authors: str = "Author"
    date: str = ""
    arxiv_id: Optional[str] = None


class PaperResponse(BaseModel):
    paper_id: str
    metadata: PaperMetadata
    image_files: list[str] = []
    status: str = "processed"
    has_scripts: bool = False
    has_audio: bool = False
