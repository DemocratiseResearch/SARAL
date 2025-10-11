from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from app.services import poster_service
from app.auth.dependencies import get_current_user
import os

router = APIRouter()

@router.post("/papers/{paper_id}/poster")
async def generate_poster_endpoint(
    paper_id: str,
    language: str = Query("en", description="Language for the poster content"),
    current_user: dict = Depends(get_current_user)
):
    """
    Triggers the generation of a poster PDF for a given paper.
    """
    try:
        await poster_service.create_poster_pdf(paper_id, language)
        
        # THIS IS THE FIX: The URL should start with /api/...
        # The base URL (http://localhost:8000) is added by the frontend.
        download_url = f"/api/papers/{paper_id}/poster/download?language={language}"
        
        return JSONResponse(
            content={
                "message": "Poster generated successfully.",
                "download_url": download_url
            }
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


@router.get("/papers/{paper_id}/poster/download")
async def download_poster(
    paper_id: str,
    language: str = Query("en", description="Language of the poster to download")
):
    """
    Serves the generated poster PDF for download.
    """
    poster_path = f"temp/posters/{paper_id}/poster_{language}.pdf"
    if not os.path.exists(poster_path):
        raise HTTPException(status_code=404, detail="Poster not found.")
    
    return FileResponse(
        path=poster_path,
        filename=f"{paper_id}_poster_{language}.pdf",
        media_type='application/pdf'
    )