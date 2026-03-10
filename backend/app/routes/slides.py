"""
Slide routes — generate / download.
"""

import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.database import get_session
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.slides import SlideResponse
from app.services.slide_service import generate_slides, get_slide

router = APIRouter(prefix="/slides", tags=["slides"])


@router.post("/{paper_id}/generate", response_model=SlideResponse)
async def generate(
    paper_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    slide = generate_slides(paper_id, user, session)
    return SlideResponse(
        paper_id=paper_id,
        pptx_path=slide.pptx_path,
        image_paths=[
            f"/api/slides/{paper_id}/images/{os.path.basename(p)}"
            for p in (slide.image_paths or [])
        ],
    )


@router.get("/{paper_id}", response_model=SlideResponse)
async def get_slides(
    paper_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    slide = get_slide(paper_id, user, session)
    if not slide:
        raise HTTPException(404, "Slides not found")
    return SlideResponse(
        paper_id=paper_id,
        pptx_path=slide.pptx_path,
        image_paths=[
            f"/api/slides/{paper_id}/images/{os.path.basename(p)}"
            for p in (slide.image_paths or [])
        ],
    )


@router.get("/{paper_id}/images/{filename}")
async def serve_slide_image(
    paper_id: str,
    filename: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    slide = get_slide(paper_id, user, session)
    if not slide:
        raise HTTPException(404, "Slides not found")
    for path in slide.image_paths or []:
        if os.path.basename(path) == filename and os.path.isfile(path):
            return FileResponse(path)
    raise HTTPException(404, "Image not found")


@router.get("/{paper_id}/download-pptx")
async def download_pptx(
    paper_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    slide = get_slide(paper_id, user, session)
    if not slide or not slide.pptx_path or not os.path.isfile(slide.pptx_path):
        raise HTTPException(404, "PPTX file not found")
    return FileResponse(
        slide.pptx_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=f"presentation_{paper_id}.pptx",
    )
