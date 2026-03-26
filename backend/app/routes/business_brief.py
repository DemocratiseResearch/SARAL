from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse
from typing import Dict
import os
import json
import traceback
import logging
from datetime import datetime
from app.services.firestore_helpers import update_pipeline_step, mark_pipeline_failed
from app.services.metadata_tracker import track_output_generation

from app.models.request_models import BusinessBriefResponse, BusinessBriefUpdateRequest
from app.services.script_generator import extract_text_from_file, clean_text
from app.services.business_brief_generator import generate_business_brief_with_gemini
from app.services.business_brief_pdf import generate_business_brief_pdf
from app.routes.papers import papers_storage
from app.routes.api_keys import get_api_keys
from app.services.storage_manager import storage_manager
from app.auth.dependencies import get_current_user
from app.utils.timing import track_performance

router = APIRouter()

logger = logging.getLogger(__name__)

# ── In-memory + file-based storage (mirrors scripts pattern) ──────

briefs_storage: Dict[str, dict] = {}

BRIEFS_DIR = "temp/business_briefs"


@track_performance
def ensure_briefs_directory() -> str:
    os.makedirs(BRIEFS_DIR, exist_ok=True)
    return BRIEFS_DIR


@track_performance
def load_brief_from_file(paper_id: str) -> dict:
    ensure_briefs_directory()
    path = os.path.join(BRIEFS_DIR, f"{paper_id}_brief.json")
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                logger.info(f"Loaded business brief from file for paper {paper_id}")
                return data
        except Exception as e:
            logger.error(f"Error loading brief file {path}: {e}")
            return {}
    return {}


@track_performance
def save_brief_to_file(paper_id: str, data: dict) -> bool:
    try:
        ensure_briefs_directory()
        path = os.path.join(BRIEFS_DIR, f"{paper_id}_brief.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info(f"Saved business brief to {path}")
        return True
    except Exception as e:
        logger.error(f"Error saving brief file: {e}")
        return False


@track_performance
def get_or_load_brief(paper_id: str) -> dict:
    if paper_id not in briefs_storage:
        briefs_storage[paper_id] = load_brief_from_file(paper_id)
    return briefs_storage[paper_id]


# ── Endpoints ─────────────────────────────────────────────────────


@router.post("/{paper_id}/generate", response_model=BusinessBriefResponse)
async def generate_business_brief(
    paper_id: str,
    api_keys: dict = Depends(get_api_keys),
    current_user: dict = Depends(get_current_user),
):
    """Generate a structured business brief from the parsed paper content."""
    paper_id_str = str(paper_id)

    # Resolve paper info
    paper_info = storage_manager.get_paper(paper_id_str)
    if not paper_info:
        if paper_id_str not in papers_storage:
            raise HTTPException(
                status_code=404, detail=f"Paper ID {paper_id_str} not found"
            )
        paper_info = papers_storage[paper_id_str]

    if not api_keys.get("gemini_key"):
        raise HTTPException(status_code=400, detail="Gemini API key required")

    _step_started_at: datetime = datetime.now()
    try:
        _step_started_at = datetime.now()
        update_pipeline_step(
            paper_id_str, "business_brief_generation",
            metadata={"source_type": paper_info.get("source_type", "unknown")},
            started_at=_step_started_at, status="in_progress"
        )

        # --- Locate the parsed text file (same logic as script generation) ---
        if "tex_file_path" in paper_info:
            file_path = paper_info["tex_file_path"]
        elif "text_file_path" in paper_info:
            file_path = paper_info["text_file_path"]
        else:
            raise ValueError(
                f"No text/tex file path in paper info. Keys: {list(paper_info.keys())}"
            )

        logger.info(f"Generating business brief for paper {paper_id_str} from {file_path}")

        input_text = extract_text_from_file(file_path)
        input_text = clean_text(input_text)

        # --- Call Gemini ---
        sections = generate_business_brief_with_gemini(
            api_keys["gemini_key"], input_text
        )

        # --- Persist ---
        brief_data = {
            "sections": sections,
            "status": "generated",
            "paper_title": paper_info.get("metadata", {}).get("title", "Research Paper"),
        }
        briefs_storage[paper_id_str] = brief_data
        if not save_brief_to_file(paper_id_str, brief_data):
            logger.warning(f"Failed to persist business brief for {paper_id_str}")

        update_pipeline_step(
            paper_id_str, "business_brief_generation",
            metadata={"sections_count": len(sections), "source_type": paper_info.get("source_type", "unknown")},
            started_at=_step_started_at, status="completed"
        )

        # Track in paper_metadata.processing_outputs so analytics picks it up
        try:
            track_output_generation(
                paper_id_str,
                'business_brief',
                user_id=current_user.get('id') or current_user.get('uid'),
                additional_data={"sections_count": len(sections)}
            )
        except Exception as _te:
            logger.warning(f"Failed to track business_brief output: {_te}")

        return BusinessBriefResponse(
            paper_id=paper_id_str,
            sections=sections,
            status="generated",
        )

    except Exception as e:
        mark_pipeline_failed(paper_id_str, "business_brief_generation", e, started_at=_step_started_at)
        logger.error(f"Error generating business brief: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500, detail=f"Error generating business brief: {e}"
        )


@router.get("/{paper_id}/sections")
async def get_business_brief_sections(paper_id: str):
    """Retrieve all sections of an existing business brief for viewing/editing."""
    brief_data = get_or_load_brief(paper_id)
    if not brief_data or not brief_data.get("sections"):
        raise HTTPException(
            status_code=404, detail="Business brief not found for this paper"
        )

    return {
        "paper_id": paper_id,
        "sections": brief_data["sections"],
        "status": brief_data.get("status", "unknown"),
    }


@router.put("/{paper_id}/sections")
async def update_business_brief_sections(
    paper_id: str, request: BusinessBriefUpdateRequest
):
    """Update one or more sections of the business brief (user edits)."""
    try:
        brief_data = get_or_load_brief(paper_id)
        if not brief_data or not brief_data.get("sections"):
            raise HTTPException(
                status_code=404, detail="Business brief not found for this paper"
            )

        for section_name, new_content in request.sections.items():
            brief_data["sections"][section_name] = new_content

        brief_data["status"] = "edited"
        briefs_storage[paper_id] = brief_data

        if not save_brief_to_file(paper_id, brief_data):
            raise HTTPException(
                status_code=500, detail="Failed to save updated brief"
            )

        logger.info(f"Updated business brief sections: {list(request.sections.keys())}")

        return {
            "message": "Business brief updated successfully",
            "paper_id": paper_id,
            "updated_sections": list(request.sections.keys()),
            "sections": brief_data["sections"],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating business brief: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500, detail=f"Error updating business brief: {e}"
        )


@router.get("/{paper_id}/download-pdf")
async def download_business_brief_pdf(paper_id: str):
    """Generate a PDF from the (possibly edited) business brief and return it."""
    brief_data = get_or_load_brief(paper_id)
    if not brief_data or not brief_data.get("sections"):
        raise HTTPException(
            status_code=404, detail="Business brief not found for this paper"
        )

    try:
        paper_title = brief_data.get("paper_title", "Research Paper")
        pdf_path = generate_business_brief_pdf(
            paper_id, brief_data["sections"], paper_title
        )

        if not os.path.exists(pdf_path):
            raise HTTPException(
                status_code=500, detail="PDF generation failed — file not found"
            )

        return FileResponse(
            path=pdf_path,
            media_type="application/pdf",
            filename=f"{paper_id}_business_brief.pdf",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating business brief PDF: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500, detail=f"Error generating PDF: {e}"
        )
