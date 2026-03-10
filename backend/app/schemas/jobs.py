"""Request / response schemas for background job polling."""

from pydantic import BaseModel
from typing import Optional


class JobResponse(BaseModel):
    id: int
    paper_id: int
    job_type: str
    status: str
    progress: int = 0
    error_message: str = ""
    result: Optional[dict] = None
