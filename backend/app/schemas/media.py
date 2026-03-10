"""Request / response schemas for media (audio / video) endpoints."""

from pydantic import BaseModel
from typing import Optional


class AudioGenerationRequest(BaseModel):
    selected_language: str = "English"
    voice_selection: dict[str, str] = {}  # language → voice name
    hinglish_iterations: int = 3
    show_hindi_debug: bool = False


class VideoGenerationRequest(BaseModel):
    selected_language: str = "English"
    background_music_file: Optional[str] = None


class MediaResponse(BaseModel):
    paper_id: str
    audio_files: list[str] = []
    video_path: Optional[str] = None
