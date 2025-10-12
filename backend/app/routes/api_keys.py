from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from app.database import get_db, User
from app.auth.dependencies import get_current_user
from app.models.request_models import APIKeysRequest
import os

router = APIRouter()

@router.post("/setup")
async def setup_api_keys(
    request: APIKeysRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Store API keys for the authenticated user."""
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if request.gemini_key:
        user.gemini_key = request.gemini_key
    if request.sarvam_key:
        user.sarvam_key = request.sarvam_key
    if request.openai_key:
        user.openai_key = request.openai_key
    
    db.commit()
    return {"message": "API keys updated successfully"}

@router.get("/status")
async def get_api_keys_status(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Get status of configured API keys for the authenticated user."""
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "gemini_configured": bool(user.gemini_key),
        "sarvam_configured": bool(user.sarvam_key),
        "openai_configured": bool(user.openai_key)
    }

def get_api_keys(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    api_keys = {
        "gemini_key": user.gemini_key or os.getenv("GEMINI_API_KEY"),
        "sarvam_key": user.sarvam_key or os.getenv("SARVAM_API_KEY"),
        "openai_key": user.openai_key or os.getenv("OPENAI_API_KEY")
    }

    if not api_keys["gemini_key"]:
         raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Gemini API key not configured."
        )

    return api_keys
