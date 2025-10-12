from fastapi import APIRouter, HTTPException
from typing import List, Dict

from ..models.request_models import ReelScriptRequest
from ..services.paper_loader import load_paper_snippet
from ..services.shortform_script import generate_script
from pathlib import Path

from ..models.request_models import ReelAudioRequest
from ..services.tts_service import generate_dialogue_audio_bhashini

from ..models.request_models import ReelVideoRequest
from ..services.shortform_video import generate_dialogue_video

router = APIRouter(
    prefix="/reels",
    tags=["Reels"]
)

@router.post("/generate-script", status_code=200)
async def create_reel_script(request: ReelScriptRequest):
    question = "Summarize the key ideas from the provided material"
    snippets = []
    if request.args == "paper":
        try:
            paper_path = Path(request.path).resolve()
            print(f"Reading paper: {paper_path}")
            paper_snippet = load_paper_snippet(paper_path)
            if paper_snippet:
                snippets.append(paper_snippet)
                print("Added paper to context")
        except Exception as exc:
            print(f"Warning: could not process paper ({exc})")

    script = generate_script(question, snippets, language=request.language)
    return script


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
        video_path = generate_dialogue_video(paper_id = request.paper_id, audio_count = request.audio_count, dialogues = request.dialogues)

    except Exception as e:
        print(f"An unexpected error occurred in video generation: {e}")
        raise HTTPException(status_code=500, detail="An internal server error occurred during video generation.")

