"""Paper model — stores uploaded/scraped paper metadata and file paths."""

from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import json


class Paper(SQLModel, table=True):
    __tablename__ = "papers"

    id: Optional[int] = Field(default=None, primary_key=True)
    paper_uid: str = Field(unique=True, index=True)  # UUID for URL-safe IDs
    user_id: int = Field(foreign_key="users.id", index=True)

    # Metadata
    title: str = "Research Paper"
    authors: str = "Author"
    date: str = ""
    arxiv_id: str = ""

    # Source info
    source_type: str = "pdf"  # "pdf" | "latex" | "arxiv"
    source_dir: str = ""  # Relative path inside temp/
    tex_file_path: str = ""
    text_file_path: str = ""

    # Images stored as JSON array of relative paths
    image_files_json: str = "[]"

    status: str = "processing"  # "processing" | "processed" | "failed"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def image_files(self) -> list[str]:
        return json.loads(self.image_files_json)

    @image_files.setter
    def image_files(self, value: list[str]):
        self.image_files_json = json.dumps(value)
