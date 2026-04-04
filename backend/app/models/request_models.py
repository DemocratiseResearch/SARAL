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

class PatentMetadata(BaseModel):
    title: Optional[str] = None
    patent_id: Optional[str] = None
    inventors: Optional[str] = None
    assignee: Optional[str] = None
    publication_date: Optional[str] = None

class SectionScript(BaseModel):
    script: str
    bullet_points: Optional[List[str]] = []
    assigned_image: Optional[str] = None

class ScriptUpdateRequest(BaseModel):
    sections: Optional[Dict[str, Union[SectionScript, Dict[str, Any]]]] = None

# REMOVED: BulletPointRequest

class AudioGenerationRequest(BaseModel):
    voice_selection: Dict[str, str] = {
        "English": "simran",
        "Hindi": "simran",
        "Bengali": "simran",
        "Gujarati": "simran",
        "Kannada": "simran",
        "Malayalam": "simran",
        "Marathi": "simran",
        "Odia": "simran",
        "Punjabi": "simran",
        "Tamil": "simran",
        "Telugu": "simran"
    }
    hinglish_iterations: int = 3
    show_hindi_debug: bool = False
    #selected_language: str

class VideoGenerationRequest(BaseModel):
    background_music_file: Optional[str] = None
    #selected_language: str


class SlideGenerationRequest(BaseModel):
    format: str = "beamer"  # "beamer" or "powerpoint"
    language: str = "English"


class PaperResponse(BaseModel):
    paper_id: str
    metadata: PaperMetadata
    image_files: List[str]
    tex_file_path: str
    status: str

class PatentResponse(BaseModel):
    paper_id: str 
    metadata: PatentMetadata
    image_files: List[str]
    text_file_path: str
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
    caption: Optional[str] = None


class GoogleTokenRequest(BaseModel):
    access_token: str
    refresh_token: str | None = None
    scope: str
    token_type: str
    expiry_date: str | None = None  # optional (frontend may send expiry)


# Reel Models
class ReelDialogueTurn(BaseModel):
    character: str  # "Aisha" or "Rohan"
    dialogue: str


class ReelScriptUpdate(BaseModel):
    script: List[ReelDialogueTurn]


class AvailableAvatarPair(BaseModel):
    id: str
    name: str
    male_avatar: str  # prof1.png or prof2.png (Rohan)
    female_avatar: str  # student1.png or student2.png (Aisha)
    description: Optional[str] = None


class ReelAvatarSelection(BaseModel):
    avatar_pair_id: str  # e.g., "prof1_student2"


class ReelScriptResponse(BaseModel):
    paper_id: str
    script: List[ReelDialogueTurn]
    language: str
    status: str


# Business Brief Models
class BusinessBriefResponse(BaseModel):
    paper_id: str
    sections: Dict[str, str]
    status: str

class BusinessBriefUpdateRequest(BaseModel):
    sections: Dict[str, str]


class WebpageGenerateRequest(BaseModel):
    variant_count: int = 1


class WebpageVariant(BaseModel):
    variant_id: str
    theme: str
    preview_url: str
    download_url: str
    created_at: str


class WebpageGenerateResponse(BaseModel):
    paper_id: str
    variants: List[WebpageVariant]