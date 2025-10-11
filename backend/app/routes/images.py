from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os
import mimetypes
from typing import List
# from app.auth.dependencies import get_current_user  # Commented out for local use
from app.routes.papers import papers_storage
from app.routes.slides import slides_storage

router = APIRouter()

@router.get("/{paper_id}/available")
async def get_available_images(paper_id: str) -> List[str]:
    """Get all available images for a paper."""
    
    if paper_id not in papers_storage:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    paper_info = papers_storage[paper_id]
    image_files = paper_info.get("image_files", [])
    
    # Return just the filenames for the frontend
    return [os.path.basename(img) for img in image_files if os.path.exists(img)]

@router.get("/{paper_id}/{image_name}")
async def get_image_file(paper_id: str, image_name: str):
    """Serve individual image files."""
    
    if paper_id not in papers_storage:
        raise HTTPException(status_code=404, detail="Paper not found")
    
    paper_info = papers_storage[paper_id]
    image_files = paper_info.get("image_files", [])
    
    # Find the requested image
    image_path = None
    for img_file in image_files:
        if os.path.basename(img_file) == image_name:
            image_path = img_file
            break
    
    if not image_path or not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Determine media type
    media_type, _ = mimetypes.guess_type(image_path)
    if not media_type:
        media_type = 'application/octet-stream'
    
    return FileResponse(
        image_path, 
        media_type=media_type,
        filename=image_name
    )
