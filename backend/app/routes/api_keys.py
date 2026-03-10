"""
API-key routes — save / retrieve / check status.
"""

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.api_keys import ApiKeysRequest, ApiKeysStatus
from app.services.api_key_service import save_keys, get_keys_status

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


@router.post("")
async def set_api_keys(
    request: ApiKeysRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    keys: dict[str, str] = {}
    if request.llm_key:
        keys["llm"] = request.llm_key
    if request.sarvam_key:
        keys["sarvam"] = request.sarvam_key
    save_keys(user, session, keys)
    return {"message": "API keys saved"}


@router.get("/status", response_model=ApiKeysStatus)
async def api_keys_status(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    status = get_keys_status(user, session)
    return ApiKeysStatus(
        llm_configured=status.get("llm", False),
        sarvam_configured=status.get("sarvam", False),
    )
