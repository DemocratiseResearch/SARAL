"""Request / response schemas for authentication endpoints."""

from typing import Optional
from pydantic import BaseModel


class GoogleLoginRequest(BaseModel):
    id_token: str  # Firebase ID token from the frontend


class AuthResponse(BaseModel):
    user: "UserResponse"
    message: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    picture: Optional[str] = None
