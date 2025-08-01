from datetime import datetime,timezone
from app.models.db_models import Feedback 

async def save_feedback(user_id: str,paper_id: str, feedback):
    # skip saving if all fields are empty
    if (
        feedback.audio == 0
        and feedback.video == 0
        and feedback.slides == 0
        and not feedback.remarks.strip()
    ):
        return  # do nothing
    
    # Check for existing feedback to avoid duplicates
    existing = await Feedback.find_one({"userId": user_id, "paperId": paper_id})
    if existing:
        raise Exception("Feedback on this paper is already submitted")

    doc = Feedback(
        userId=user_id,
        paperId=feedback.paperId,
        audio=feedback.audio,
        video=feedback.video,
        slides=feedback.slides,
        remarks=feedback.remarks,
        timestamp=datetime.now(timezone.utc),
    )
    await doc.insert()
    return {"message": "Feedback submitted successfully for the paper "}
