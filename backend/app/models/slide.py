"""Slide model — stores generated slide file paths for a paper."""

from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import json


class Slide(SQLModel, table=True):
    __tablename__ = "slides"

    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(foreign_key="papers.id", index=True)

    pptx_path: str = ""  # Path to generated .pptx file
    pdf_path: str = ""  # Path to exported PDF (if applicable)
    image_paths_json: str = "[]"  # JSON array of slide image paths (PNG)

    status: str = "pending"  # "pending" | "generated" | "failed"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def image_paths(self) -> list[str]:
        return json.loads(self.image_paths_json)

    @image_paths.setter
    def image_paths(self, value: list[str]):
        self.image_paths_json = json.dumps(value)
