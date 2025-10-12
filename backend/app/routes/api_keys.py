from fastapi import APIRouter, HTTPException, Depends, status
from app.firebase import db
from app.auth.dependencies import get_current_user
from app.models.request_models import APIKeysRequest
import os

router = APIRouter()

@router.post("/setup")
async def setup_api_keys(
    request: APIKeysRequest,
    current_user: dict = Depends(get_current_user),
):
    """Store API keys for the authenticated user."""
    user_ref = db.collection('users').document(current_user["id"])
    user_doc = user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    updates = {}
    if request.gemini_key:
        updates['gemini_key'] = request.gemini_key
    if request.sarvam_key:
        updates['sarvam_key'] = request.sarvam_key
    if request.openai_key:
        updates['openai_key'] = request.openai_key
    if updates:
        user_ref.update(updates)
    return {"message": "API keys updated successfully"}

@router.get("/status")
async def get_api_keys_status(
    current_user: dict = Depends(get_current_user)
):
    """Get status of configured API keys for the authenticated user."""
    user_ref = db.collection('users').document(current_user["id"])
    user_doc = user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    user = user_doc.to_dict()
    return {
        "gemini_configured": bool(user.get('gemini_key')),
        "sarvam_configured": bool(user.get('sarvam_key')),
        "openai_configured": bool(user.get('openai_key'))
    }

def get_api_keys(
    current_user: dict = Depends(get_current_user)
):
    user_ref = db.collection('users').document(current_user["id"])
    user_doc = user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    user = user_doc.to_dict()
    api_keys = {
        "gemini_key": user.get('gemini_key') or os.getenv("GOOGLE_API_KEY"),
        "sarvam_key": user.get('sarvam_key') or os.getenv("SARVAM_API_KEY"),
        "openai_key": user.get('openai_key') or os.getenv("OPENAI_API_KEY")
    }
    if not api_keys["gemini_key"]:
         raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Gemini API key not configured."
        )
    return api_keys
