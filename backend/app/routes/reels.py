from fastapi import APIRouter, HTTPException
from typing import List, Dict

from ..models.request_models import ReelScriptRequest
from ..services.paper_loader import load_paper_snippet, load_latex_snippet, load_arxiv_snippet
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
    source_type = request.args.lower()
    
    try:
        snippet = None
        if source_type == "paper":
            paper_path = Path(request.path).resolve()
            print(f"Reading paper: {paper_path}")
            snippet = load_paper_snippet(paper_path)
            if snippet:
                print("Added paper to context")

        elif source_type == "latex":
            latex_path = Path(request.path).resolve()
            print(f"Reading LaTeX source: {latex_path}")
            snippet = load_latex_snippet(latex_path)
            if snippet:
                print("Added LaTeX summary to context.")

        elif source_type == "arxiv":
            print(f"Fetching arXiv entry: {request.path}")
            snippet = load_arxiv_snippet(request.arxiv_id)
            if snippet:
                print("Added arXiv abstract to context.")
        
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported source type '{request.args}'. Use 'paper', 'latex', or 'arxiv'."
            )

        if snippet:
            snippets.append(snippet)
        else:
            raise HTTPException(
                status_code=422,
                detail=f"Could not extract content from the provided {source_type} source."
            )

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"File not found at path: {request.path}")
    except Exception as exc:
        print(f"Error processing source '{request.path}' ({exc})")
        raise HTTPException(
            status_code=500,
            detail=f"An internal error occurred while processing the source: {exc}"
        )
    
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

