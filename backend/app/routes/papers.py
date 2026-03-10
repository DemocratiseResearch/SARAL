"""
Paper routes — upload / scrape / list / download.
"""

import os
import shutil
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.database import get_session
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.papers import PaperResponse, PaperMetadata, ArxivRequest
from app.services.paper_service import ingest_arxiv, ingest_zip, ingest_pdf, get_paper, list_papers

router = APIRouter(prefix="/papers", tags=["papers"])


def _paper_response(paper) -> PaperResponse:
    return PaperResponse(
        paper_id=paper.paper_uid,
        metadata=PaperMetadata(
            title=paper.title or "",
            authors=paper.authors or "",
            date=paper.date or "",
            arxiv_id=paper.arxiv_id,
        ),
        image_files=[os.path.basename(f) for f in (paper.image_files or [])],
        status=paper.status or "processed",
    )


@router.post("/upload-zip", response_model=PaperResponse)
async def upload_zip(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(400, "Only ZIP files are allowed")
    content = await file.read()
    paper = ingest_zip(file.filename, content, user, session)
    return _paper_response(paper)


@router.post("/upload-pdf", response_model=PaperResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are allowed")
    content = await file.read()
    paper = ingest_pdf(file.filename, content, user, session)
    return _paper_response(paper)


@router.post("/scrape-arxiv", response_model=PaperResponse)
async def scrape_arxiv(
    request: ArxivRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    paper = ingest_arxiv(request.arxiv_url, user, session)
    return _paper_response(paper)


@router.get("", response_model=list[PaperResponse])
async def get_papers(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    papers = list_papers(user, session)
    return [_paper_response(p) for p in papers]


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper_detail(
    paper_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    paper = get_paper(paper_id, user, session)
    return _paper_response(paper)


@router.get("/{paper_id}/images/{filename}")
async def serve_image(
    paper_id: str,
    filename: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Serve an extracted image file."""
    paper = get_paper(paper_id, user, session)
    # Find the image file in the list
    for img_path in paper.image_files or []:
        if os.path.basename(img_path) == filename and os.path.isfile(img_path):
            return FileResponse(img_path)
    raise HTTPException(404, "Image not found")
