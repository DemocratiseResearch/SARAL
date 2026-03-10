"""Media model — audio and video files generated for a paper."""

from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import json


class Media(SQLModel, table=True):
    __tablename__ = "media"

    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(foreign_key="papers.id", index=True)

    language: str = "English"
    voice: str = "vidya"
    audio_dir: str = ""  # Directory containing audio WAV files
    audio_files_json: str = "[]"  # JSON array of audio filenames
    video_path: str = ""  # Path to final MP4

    status: str = "pending"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def audio_files(self) -> list[str]:
        return json.loads(self.audio_files_json)

    @audio_files.setter
    def audio_files(self, value: list[str]):
        self.audio_files_json = json.dumps(value)
