"""Request / response schemas for slide endpoints."""

from pydantic import BaseModel


class SlideResponse(BaseModel):
    paper_id: str
    pptx_path: str = ""
    image_paths: list[str] = []
    status: str = "generated"
