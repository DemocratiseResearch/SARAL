from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union

class APIKeysRequest(BaseModel):
    gemini_key: Optional[str] = None
    sarvam_key: Optional[str] = None
    openai_key: Optional[str] = None

class ArxivRequest(BaseModel):
    arxiv_url: str

class PaperMetadata(BaseModel):
    title: str
    authors: str
    date: str
    arxiv_id: Optional[str] = None

class SectionScript(BaseModel):
    script: str
    bullet_points: Optional[List[str]] = []
    assigned_image: Optional[str] = None

class ScriptUpdateRequest(BaseModel):
    sections: Optional[Dict[str, Union[SectionScript, Dict[str, Any]]]] = None

# REMOVED: BulletPointRequest

class AudioGenerationRequest(BaseModel):
    voice_selection: Dict[str, str] = {
        "English": "vidya",
        "Hindi": "vidya",
        "Bengali": "vidya",
        "Gujarati": "vidya",
        "Kannada": "vidya",
        "Malayalam": "vidya",
        "Marathi": "vidya",
        "Odia": "vidya",
        "Punjabi": "vidya",
        "Tamil": "vidya",
        "Telugu": "vidya"
    }
    hinglish_iterations: int = 3
    show_hindi_debug: bool = False
    selected_language: str

class VideoGenerationRequest(BaseModel):
    background_music_file: Optional[str] = None
    selected_language: str


class PaperResponse(BaseModel):
    paper_id: str
    metadata: PaperMetadata
    image_files: List[str]
    tex_file_path: str
    status: str

class ScriptResponse(BaseModel):
    sections_scripts: Dict[str, str]
    paper_id: str

class SlideResponse(BaseModel):
    pdf_path: str
    image_paths: List[str]
    paper_id: str

class MediaResponse(BaseModel):
    audio_files: List[str]
    video_path: Optional[str] = None
    paper_id: str


class GoogleTokenRequest(BaseModel):
    access_token: str
    refresh_token: str | None = None
    scope: str
    token_type: str
    expiry_date: str | None = None  # optional (frontend may send expiry)

# reel audio generation
class ReelAudioRequest(BaseModel):
    paper_id: str
    language: str
    dialogue_script: List[Dict[str, str]]