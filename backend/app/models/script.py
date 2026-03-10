"""Script model — one row per paper section (5 sections per paper)."""

from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import json


class Script(SQLModel, table=True):
    __tablename__ = "scripts"

    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(foreign_key="papers.id", index=True)

    section_name: str  # "Introduction" | "Methodology" | "Results" | "Discussion" | "Conclusion"
    content: str = ""  # The narration script text
    bullet_points_json: str = "[]"  # JSON array of bullet point strings
    assigned_image: str = ""  # Filename of image assigned to this section

    # Title intro script is stored as section_name = "title_intro"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    @property
    def bullet_points(self) -> list[str]:
        return json.loads(self.bullet_points_json)

    @bullet_points.setter
    def bullet_points(self, value: list[str]):
        self.bullet_points_json = json.dumps(value)
