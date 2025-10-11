from fastapi import APIRouter, HTTPException, Body, Depends
from app.models.request_models import FlashcardGenerationRequest, FlashcardResponse
from app.services.flashcard_generator import generate_flashcards_from_paper
from app.routes.papers import papers_storage
from app.routes.scripts import scripts_storage
from app.routes.api_keys import get_api_keys
from app.services.storage_manager import storage_manager
import os
import json
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.post("/papers/{paper_id}/flashcards", response_model=FlashcardResponse)
def generate_paper_flashcards(
    paper_id: str, 
    request: FlashcardGenerationRequest = Body(...),
    api_keys: dict = Depends(get_api_keys)
):
    """Generate flashcards from actual paper content and scripts."""
    paper_id_str = str(paper_id)
    
    # Get paper info
    paper_info = storage_manager.get_paper(paper_id_str)
    if not paper_info:
        if paper_id_str not in papers_storage:
            raise HTTPException(status_code=404, detail=f"Paper ID {paper_id_str} not found")
        paper_info = papers_storage[paper_id_str]
    
    # Get scripts if available
    scripts_info = None
    if paper_id_str in scripts_storage:
        scripts_info = scripts_storage[paper_id_str]
    else:
        # Try to load scripts from file
        scripts_file = f"temp/scripts/{paper_id_str}_scripts.json"
        if os.path.exists(scripts_file):
            try:
                with open(scripts_file, 'r', encoding='utf-8') as f:
                    scripts_info = json.load(f)
                    scripts_storage[paper_id_str] = scripts_info
            except Exception as e:
                logger.warning(f"Could not load scripts for {paper_id_str}: {e}")
    
    if not api_keys.get("gemini_key"):
        raise HTTPException(status_code=400, detail="Gemini API key required for flashcard generation")
    
    try:
        flashcards = generate_flashcards_from_paper(
            paper_info=paper_info,
            scripts_info=scripts_info,
            api_key=api_keys["gemini_key"],
            num_flashcards=request.num_flashcards
        )
        return FlashcardResponse(flashcards=flashcards, paper_id=paper_id)
    except Exception as e:
        logger.error(f"Error generating flashcards: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error generating flashcards: {str(e)}")

@router.get("/papers/{paper_id}/flashcards", response_model=FlashcardResponse)
def get_paper_flashcards(paper_id: str, api_keys: dict = Depends(get_api_keys)):
    """Get flashcards for a paper (generates if not exists)."""
    # For now, regenerate flashcards each time since we don't store them yet
    request = FlashcardGenerationRequest(num_flashcards=8)
    return generate_paper_flashcards(paper_id, request, api_keys)
