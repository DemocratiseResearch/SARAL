from fastapi import APIRouter, HTTPException
from typing import List, Dict

from ..services.tts_service import generate_dialogue_audio_bhashini
from ..services.shortform_video import generate_dialogue_video
from ..models.request_models import ReelAudioRequest
from ..models.request_models import ReelVideoRequest

router = APIRouter(
    prefix="/reels",
    tags=["Reels"]
)

@router.post("/generate-audio", status_code=201)
async def create_reel_audio(request: ReelAudioRequest):
    """
    Receives a dialogue script and orchestrates the generation of audio files.
    """
    try:
        result = await generate_dialogue_audio_bhashini(
            language=request.language,
            paper_id=request.paper_id,
            dialogue_script=request.dialogue_script
        )
        return result
        
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        print(f"An unexpected error occurred in reel generation: {e}")
        raise HTTPException(status_code=500, detail="An internal server error occurred.")

@router.post("/generate-video", status_code=200)
async def create_reel_video(request: ReelVideoRequest):
    """
    Receives a list of audio filenames and generates a dialogue video.
    """
    try:
        # Call the video generation function with the list of full paths
        video_path = generate_dialogue_video(paper_id = request.paper_id, audio_count = request.audio_count)

    except Exception as e:
        print(f"An unexpected error occurred in video generation: {e}")
        raise HTTPException(status_code=500, detail="An internal server error occurred during video generation.")

