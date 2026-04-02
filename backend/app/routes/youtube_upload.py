import os
import shutil
import logging
from fastapi import APIRouter, Depends, HTTPException, Form, Body
# from sqlalchemy.orm import Session
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from app.auth.dependencies import get_current_user
from app.models.request_models import GoogleTokenRequest
from app.utils.timing import track_performance

import requests
logger = logging.getLogger(__name__)
router = APIRouter()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")



@router.post("/google_upload")
async def google_upload(
    payload: dict = Body(...)
):
    paper_id = payload.get("paper_id")
    code = payload.get("code")

    if not code:
        raise HTTPException(status_code=400, detail="Missing Google auth code")
    if not paper_id:
        raise HTTPException(status_code=400, detail="Missing paper_id")

    temp_dir = f"temp/videos/{paper_id}"
    video_path = os.path.join(temp_dir, "final_video_english.mp4")
    print("videopath", video_path)
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video not found")
    print("videopath", video_path)

    try:
        # Step 1: Exchange code → tokens
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": "http://localhost:8000/oauth2callback",
        }
        r = requests.post(token_url, data=data)
        token_data = r.json()
        logger.info(f"Google token response: {token_data}")

        if "access_token" not in token_data:
            raise HTTPException(status_code=401, detail="Failed to exchange code for access token")

        access_token = token_data["access_token"]
        print("access_token", access_token)
        # Step 2: Upload to YouTube
        creds = Credentials(token=access_token)
        youtube = build("youtube", "v3", credentials=creds)

        media = MediaFileUpload(video_path, chunksize=-1, resumable=True)
        request = youtube.videos().insert(
            part="snippet,status",
            body={
                "snippet": {
                    "title": f"Paper {paper_id} Video",
                    "description": "Uploaded from FastAPI",
                    "tags": ["research", "paper", "auto-upload"]
                },
                "status": {
                    "privacyStatus": "public"
                }
            },
            media_body=media
        )
        response = request.execute()

        return {
            "success": True,
            "video_id": response.get("id"),
            "video_url": f"https://www.youtube.com/watch?v={response.get('id')}",
            # "token_info": token_data  # optional: return tokens too
        }

        # return {
        #     "success": True,

        #     "video_url": f"https://www.youtube.com/watch?v=IqUSwDCnQnk",
            
        #     # "video_id": response.get("id"),
        #     # "video_url": f"https://www.youtube.com/watch?v={response.get('id')}",
        #     # "token_info": token_data  # optional: return tokens too
        # }
    except Exception as e:
        logger.error(f"Error uploading video to YouTube: {str(e)}")
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Error uploading video to YouTube: {str(e)}")
