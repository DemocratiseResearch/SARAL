from fastapi import FastAPI, Form, APIRouter
from fastapi.responses import JSONResponse
import csv
import os
import logging
from datetime import datetime
from app.utils.timing import track_performance
# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

CSV_FILE = "feedback_data.csv"

# Ensure CSV has headers if created first time
@track_performance
def init_csv():
    if not os.path.exists(CSV_FILE):
        with open(CSV_FILE, mode="w", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow(["timestamp", "feedbackfor", "feedback"])  # Header row


@router.post("/submit_feedback")
async def submit_feedback(
    # feedbackfor: str = Form(...), 
    fb_question: str = Form(...),
    feedback: str = Form(...),
    rating: str = Form(...),
):
    try:
        init_csv()

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        with open(CSV_FILE, mode="a", newline="", encoding="utf-8") as file:
            writer = csv.writer(file)
            writer.writerow([timestamp,fb_question,feedback,rating])

        return JSONResponse(
            content={
                "status": "success",
                "message": "Feedback recorded successfully",
                "data": {"fb_question": fb_question, "rating": rating, "feedback": feedback},
            },
            status_code=200,
        )
    except Exception as e:
        return JSONResponse(
            content={
                "status": "error",
                "message": f"Failed to store feedback: {str(e)}",
            },
            status_code=500,
        )