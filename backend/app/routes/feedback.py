from fastapi import APIRouter, Depends, HTTPException
from app.models.request_models import FeedbackRequest 
from app.auth.dependencies import get_current_user
from app.services.feedback_service import save_feedback

router = APIRouter()

@router.post("/{paper_id}")
async def submit_feedback(
    paper_id: str,
    feedback: FeedbackRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        return await save_feedback(current_user["id"], paper_id, feedback)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))