"""Request / response schemas for media (audio / video) endpoints."""

from pydantic import BaseModel
from typing import Optional


class AudioGenerationRequest(BaseModel):
    language: str = "English"
    voice: str = "shubh"


class VideoGenerationRequest(BaseModel):
    selected_language: str = "English"
    background_music_file: Optional[str] = None


class MediaResponse(BaseModel):
    paper_id: str
    language: Optional[str] = None
    audio_files: list[str] = []
    video_path: Optional[str] = None
    status: Optional[str] = None
