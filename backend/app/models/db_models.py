# app/models/db_models.py
from beanie import Document
from pydantic import Field
from datetime import datetime

class Feedback(Document):
    userId: str = Field(...)
    paperId: str = Field(...)
    audio: int
    video: int
    slides: int
    remarks: str | None = None
    timestamp: datetime
    
    class Settings:
        name = "saral_feedback"