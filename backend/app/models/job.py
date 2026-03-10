"""Job model — tracks background task progress for async operations."""

from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime


class Job(SQLModel, table=True):
    __tablename__ = "jobs"

    id: Optional[int] = Field(default=None, primary_key=True)
    paper_id: int = Field(foreign_key="papers.id", index=True)

    job_type: str  # "script_generation" | "slide_generation" | "audio_generation" | "video_generation"
    status: str = "pending"  # "pending" | "running" | "completed" | "failed"
    progress: int = 0  # 0-100 percentage
    error_message: str = ""
    result_json: str = "{}"  # JSON blob with task-specific output

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
