"""
Poster Generation Routes
API endpoints for creating academic posters from research papers
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import logging
import os
import shutil
import uuid
from pathlib import Path
from datetime import datetime

from ..services.poster_service import get_poster_service
from ..routes.api_keys import get_api_keys
from ..auth.dependencies import get_current_user

router = APIRouter()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Storage for poster jobs (in production, use a database)
poster_jobs = {}


class PosterConfig(BaseModel):
    width: int = 48  # inches
    height: int = 36  # inches
    style: str = "academic"
    include_figures: bool = True
    include_tables: bool = True


class PosterGenerateRequest(BaseModel):
    paper_id: Optional[str] = None
    config: Optional[PosterConfig] = None


class PosterResponse(BaseModel):
    success: bool
    poster_id: str
    status: str
    message: str
    html_url: Optional[str] = None
    download_url: Optional[str] = None


class PosterStatusResponse(BaseModel):
    success: bool
    poster_id: str
    status: str
    progress: int
    message: str
    html_url: Optional[str] = None
    download_url: Optional[str] = None
    error: Optional[str] = None


class PosterListResponse(BaseModel):
    success: bool
    posters: List[dict]
    count: int


async def generate_poster_background(
    poster_id: str, pdf_path: str, config: dict, gemini_api_key: str
):
    """Background task to generate poster"""
    try:
        logger.info(f"Starting background poster generation: {poster_id}")
        poster_jobs[poster_id] = {
            "status": "processing",
            "progress": 10,
            "message": "Extracting paper content...",
        }

        poster_service = get_poster_service(gemini_api_key)

        # Update progress
        poster_jobs[poster_id]["progress"] = 30
        poster_jobs[poster_id]["message"] = "Generating poster outline..."

        # Generate poster
        result = await poster_service.generate_poster(pdf_path, config)

        # Update job status
        poster_jobs[poster_id] = {
            "status": "completed",
            "progress": 100,
            "message": "Poster generated successfully!",
            "result": result,
            "html_path": result["html_path"],
            "poster_dir": result["poster_dir"],
        }

        logger.info(f"✅ Poster generation completed: {poster_id}")

    except Exception as e:
        logger.error(f"❌ Error in background poster generation: {e}", exc_info=True)
        poster_jobs[poster_id] = {
            "status": "failed",
            "progress": 0,
            "message": "Failed to generate poster",
            "error": str(e),
        }


@router.post("/upload", response_model=PosterResponse)
async def upload_and_generate_poster(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    width: int = 48,
    height: int = 36,
    style: str = "academic",
    api_keys: dict = Depends(get_api_keys),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a PDF and generate a poster from it

    Args:
        file: PDF file upload
        width: Poster width in inches (default: 48)
        height: Poster height in inches (default: 36)
        style: Poster style (default: academic)
    """
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400, detail="Gemini API key required for poster generation"
            )

        if not file.filename.endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")

        # Create unique poster ID
        poster_id = str(uuid.uuid4())
        poster_upload_dir = Path(f"temp/posters/uploads/{poster_id}")
        poster_upload_dir.mkdir(parents=True, exist_ok=True)

        # Save uploaded PDF
        pdf_path = poster_upload_dir / "paper.pdf"
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        logger.info(f"📄 PDF uploaded for poster generation: {poster_id}")

        # Prepare configuration
        config = {
            "width": width,
            "height": height,
            "style": style,
        }

        # Initialize job status
        poster_jobs[poster_id] = {
            "status": "queued",
            "progress": 0,
            "message": "Poster generation queued",
            "user_id": current_user.get("user_id"),
            "created_at": datetime.now().isoformat(),
        }

        # Start background task
        background_tasks.add_task(
            generate_poster_background,
            poster_id,
            str(pdf_path),
            config,
            api_keys["gemini_key"],
        )

        return PosterResponse(
            success=True,
            poster_id=poster_id,
            status="queued",
            message="Poster generation started. Use the poster_id to check status.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading PDF for poster: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error uploading PDF: {str(e)}")


@router.post("/generate-from-paper", response_model=PosterResponse)
async def generate_from_existing_paper(
    background_tasks: BackgroundTasks,
    request: PosterGenerateRequest,
    api_keys: dict = Depends(get_api_keys),
    current_user: dict = Depends(get_current_user),
):
    """
    Generate a poster from an already uploaded/scraped paper

    Args:
        request: Contains paper_id and optional configuration
    """
    try:
        if not api_keys.get("gemini_key"):
            raise HTTPException(
                status_code=400, detail="Gemini API key required for poster generation"
            )

        if not request.paper_id:
            raise HTTPException(status_code=400, detail="paper_id is required")

        # Find the PDF for this paper
        pdf_path = Path(f"temp/papers/{request.paper_id}.pdf")

        if not pdf_path.exists():
            # Try alternative locations
            pdf_path = Path(f"temp/papers/{request.paper_id}/paper.pdf")

        if not pdf_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"PDF not found for paper_id: {request.paper_id}",
            )

        # Create unique poster ID
        poster_id = str(uuid.uuid4())

        # Prepare configuration
        config = (
            request.config.dict()
            if request.config
            else {
                "width": 48,
                "height": 36,
                "style": "academic",
            }
        )

        # Initialize job status
        poster_jobs[poster_id] = {
            "status": "queued",
            "progress": 0,
            "message": "Poster generation queued",
            "paper_id": request.paper_id,
            "user_id": current_user.get("user_id"),
        }

        # Start background task
        background_tasks.add_task(
            generate_poster_background,
            poster_id,
            str(pdf_path),
            config,
            api_keys["gemini_key"],
        )

        return PosterResponse(
            success=True,
            poster_id=poster_id,
            status="queued",
            message="Poster generation started. Use the poster_id to check status.",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating poster from paper: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Error generating poster: {str(e)}"
        )


@router.get("/status/{poster_id}", response_model=PosterStatusResponse)
async def get_poster_status(
    poster_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Check the status of a poster generation job

    Args:
        poster_id: The unique poster ID
    """
    try:
        if poster_id not in poster_jobs:
            raise HTTPException(status_code=404, detail="Poster job not found")

        job = poster_jobs[poster_id]

        # Build response
        response = PosterStatusResponse(
            success=True,
            poster_id=poster_id,
            status=job.get("status", "unknown"),
            progress=job.get("progress", 0),
            message=job.get("message", ""),
            error=job.get("error"),
        )

        # Add download URLs if completed
        if job.get("status") == "completed":
            response.html_url = f"/api/posters/download/{poster_id}/html"
            response.download_url = f"/api/posters/download/{poster_id}/html"

        logger.info(
            f"Returning poster status for {poster_id}: status={response.status}, progress={response.progress}"
        )
        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking poster status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error checking status: {str(e)}")


@router.get("/download/{poster_id}/html")
async def download_poster_html(
    poster_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Download the generated poster HTML file

    Args:
        poster_id: The unique poster ID
    """
    try:
        if poster_id not in poster_jobs:
            raise HTTPException(status_code=404, detail="Poster job not found")

        job = poster_jobs[poster_id]

        if job.get("status") != "completed":
            raise HTTPException(
                status_code=400,
                detail=f"Poster is not ready. Current status: {job.get('status')}",
            )

        html_path = job.get("html_path")
        if not html_path or not os.path.exists(html_path):
            raise HTTPException(status_code=404, detail="Poster HTML file not found")

        return FileResponse(
            path=html_path,
            media_type="text/html",
            filename=f"poster_{poster_id}.html",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading poster: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Error downloading poster: {str(e)}"
        )


@router.get("/list", response_model=PosterListResponse)
async def list_user_posters(
    current_user: dict = Depends(get_current_user),
):
    """
    List all posters for the current user

    Returns:
        List of user's posters with their status
    """
    try:
        user_id = current_user.get("user_id")

        # Filter posters for current user
        user_posters = []
        for poster_id, job in poster_jobs.items():
            if job.get("user_id") == user_id:
                poster_info = {
                    "poster_id": poster_id,
                    "status": job.get("status"),
                    "progress": job.get("progress", 0),
                    "message": job.get("message", ""),
                    "paper_id": job.get("paper_id"),
                    "created_at": job.get("created_at", ""),
                }

                if job.get("status") == "completed":
                    poster_info["html_url"] = f"/api/posters/download/{poster_id}/html"

                user_posters.append(poster_info)

        return PosterListResponse(
            success=True,
            posters=user_posters,
            count=len(user_posters),
        )

    except Exception as e:
        logger.error(f"Error listing posters: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error listing posters: {str(e)}")


@router.delete("/{poster_id}")
async def delete_poster(
    poster_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Delete a poster and its associated files

    Args:
        poster_id: The unique poster ID
    """
    try:
        if poster_id not in poster_jobs:
            raise HTTPException(status_code=404, detail="Poster job not found")

        job = poster_jobs[poster_id]

        # Check ownership
        if job.get("user_id") != current_user.get("user_id"):
            raise HTTPException(
                status_code=403, detail="Not authorized to delete this poster"
            )

        # Delete files
        if job.get("poster_dir"):
            poster_dir = Path(job["poster_dir"])
            if poster_dir.exists():
                shutil.rmtree(poster_dir)

        # Remove from jobs
        del poster_jobs[poster_id]

        return JSONResponse(
            content={
                "success": True,
                "message": f"Poster {poster_id} deleted successfully",
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting poster: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error deleting poster: {str(e)}")
