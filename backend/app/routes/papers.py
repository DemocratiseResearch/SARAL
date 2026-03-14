"""
Paper routes — upload / scrape / list / download.
"""

import io
import os
import re
import shutil
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select

from app.database import get_session
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.script import Script
from app.models.media import Media
from app.schemas.papers import PaperResponse, PaperMetadata, ArxivRequest
from app.services.paper_service import ingest_arxiv, ingest_zip, ingest_pdf, get_paper, list_papers

router = APIRouter(prefix="/papers", tags=["papers"])

# ── Upload limits ─────────────────────────────────────────────────────────────
MAX_ZIP_SIZE = 500 * 1024 * 1024   # 500 MB
MAX_PDF_SIZE = 100 * 1024 * 1024   # 100 MB
CHUNK_SIZE = 1024 * 1024           # 1 MB read chunks

ZIP_MAGIC = b"PK\x03\x04"  # ZIP local file header
PDF_MAGIC = b"%PDF"         # PDF header


async def _read_with_limit(file: UploadFile, max_bytes: int) -> bytes:
    """Read an upload in chunks, rejecting files that exceed *max_bytes*."""
    buf = io.BytesIO()
    total = 0
    while True:
        chunk = await file.read(CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(413, f"File too large (max {max_bytes // (1024 * 1024)} MB)")
        buf.write(chunk)
    return buf.getvalue()


def _paper_response(paper, session: Session) -> PaperResponse:
    has_scripts = session.exec(select(Script).where(Script.paper_id == paper.id)).first() is not None
    has_audio = session.exec(select(Media).where(Media.paper_id == paper.id)).first() is not None

    # Determine a logical "status" fallback from boolean flags.
    # We no longer overload the database paper.status field directly for this tracking.
    inferred_status = paper.status or "processed"
    if inferred_status in ["processing", "processed", "uploaded"]:
        if has_audio:
            inferred_status = "audio_generated"
        elif has_scripts:
            inferred_status = "scripts_generated"

    return PaperResponse(
        paper_id=paper.paper_uid,
        metadata=PaperMetadata(
            title=paper.title or "",
            authors=paper.authors or "",
            date=paper.date or "",
            arxiv_id=paper.arxiv_id,
        ),
        image_files=[os.path.basename(f) for f in (paper.image_files or [])],
        status=inferred_status,
        has_scripts=has_scripts,
        has_audio=has_audio,
    )


@router.post("/upload-zip", response_model=PaperResponse)
async def upload_zip(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(400, "Only ZIP files are allowed")
    content = await _read_with_limit(file, MAX_ZIP_SIZE)
    if not content[:4].startswith(ZIP_MAGIC):
        raise HTTPException(400, "Uploaded file is not a valid ZIP archive")
    try:
        zipfile.ZipFile(io.BytesIO(content)).testzip()
    except zipfile.BadZipFile:
        raise HTTPException(400, "Uploaded file is not a valid ZIP archive")
    paper = ingest_zip(file.filename, content, user, session)
    return _paper_response(paper, session)


@router.post("/upload-pdf", response_model=PaperResponse)
async def upload_pdf(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are allowed")
    content = await _read_with_limit(file, MAX_PDF_SIZE)
    if not content[:5].startswith(PDF_MAGIC):
        raise HTTPException(400, "Uploaded file is not a valid PDF")
    paper = ingest_pdf(file.filename, content, user, session)
    return _paper_response(paper, session)


@router.post("/scrape-arxiv", response_model=PaperResponse)
async def scrape_arxiv(
    request: ArxivRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    paper = ingest_arxiv(request.arxiv_url, user, session)
    return _paper_response(paper, session)


@router.get("", response_model=list[PaperResponse])
async def get_papers(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    papers = list_papers(user, session)
    return [_paper_response(p, session) for p in papers]


@router.get("/{paper_id}", response_model=PaperResponse)
async def get_paper_detail(
    paper_id: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    paper = get_paper(paper_id, user, session)
    return _paper_response(paper, session)


@router.get("/{paper_id}/images/{filename}")
async def serve_image(
    paper_id: str,
    filename: str,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Serve an extracted image file."""
    paper = get_paper(paper_id, user, session)
    # Reject path-traversal attempts
    safe_name = os.path.basename(filename)
    if safe_name != filename or ".." in filename:
        raise HTTPException(400, "Invalid filename")
    # Find the image file in the list
    for img_path in paper.image_files or []:
        if os.path.basename(img_path) == safe_name and os.path.isfile(img_path):
            return FileResponse(img_path)
    raise HTTPException(404, "Image not found")
