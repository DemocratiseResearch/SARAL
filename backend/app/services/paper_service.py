"""
Paper service — handles paper ingestion from arXiv URLs, ZIP uploads, and PDF uploads.
"""

import os
import uuid
import shutil
import zipfile
import logging
from pathlib import Path

from sqlmodel import Session, select

from app.models.paper import Paper
from app.models.user import User
from app.models.script import Script
from app.models.media import Media
from app.models.slide import Slide
from app.models.job import Job
from app.utils.arxiv import extract_arxiv_id, download_source, get_arxiv_metadata
from app.utils.latex import find_tex_file, extract_metadata_from_tex, extract_text_from_file, find_image_files
from app.utils.pdf import process_pdf
from app.utils.files import ensure_paper_dirs

logger = logging.getLogger(__name__)


def ingest_arxiv(arxiv_url: str, user: User, session: Session) -> Paper:
    """Download arXiv source, extract metadata and images, persist to DB."""
    paper_uid = str(uuid.uuid4())
    dirs = ensure_paper_dirs(paper_uid)

    arxiv_id = extract_arxiv_id(arxiv_url)
    extracted_dir = download_source(arxiv_url, dirs["source"])
    arxiv_meta = get_arxiv_metadata(arxiv_url)

    tex_path = find_tex_file(extracted_dir)
    latex_meta = extract_metadata_from_tex(tex_path) if tex_path else {}
    metadata = {**latex_meta, **arxiv_meta}

    images: list[str] = []
    text_path: str | None = None

    if tex_path:
        images = find_image_files(extracted_dir)
        text_path = tex_path  # we'll extract text via the tex file
    else:
        # Fallback: look for PDF
        for f in Path(extracted_dir).rglob("*.pdf"):
            result = process_pdf(str(f), dirs["source"])
            text_path = result["text_file"]
            images = result.get("images", [])
            break

    paper = Paper(
        paper_uid=paper_uid,
        user_id=user.id,
        title=metadata.get("title", "Untitled"),
        authors=metadata.get("authors", "Unknown"),
        date=metadata.get("date", ""),
        arxiv_id=arxiv_id,
        source_type="arxiv",
        source_dir=extracted_dir,
        tex_file_path=tex_path,
        text_file_path=text_path,
        image_files=images,
        status="processed",
    )
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


def ingest_zip(filename: str, file_bytes: bytes, user: User, session: Session) -> Paper:
    """Extract a ZIP containing LaTeX source, persist to DB."""
    paper_uid = str(uuid.uuid4())
    dirs = ensure_paper_dirs(paper_uid)

    zip_path = os.path.join(dirs["source"], filename)
    with open(zip_path, "wb") as f:
        f.write(file_bytes)

    extract_dir = os.path.join(dirs["source"], "extracted")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)

    tex_path = find_tex_file(extract_dir)
    metadata = extract_metadata_from_tex(tex_path) if tex_path else {}
    images = find_image_files(extract_dir) if tex_path else []

    paper = Paper(
        paper_uid=paper_uid,
        user_id=user.id,
        title=metadata.get("title", "Untitled"),
        authors=metadata.get("authors", "Unknown"),
        date=metadata.get("date", ""),
        source_type="latex",
        source_dir=extract_dir,
        tex_file_path=tex_path,
        image_files=images,
        status="processed",
    )
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


def ingest_pdf(filename: str, file_bytes: bytes, user: User, session: Session) -> Paper:
    """Process a PDF upload — extract text and images, persist to DB."""
    paper_uid = str(uuid.uuid4())
    dirs = ensure_paper_dirs(paper_uid)

    pdf_path = os.path.join(dirs["source"], filename)
    with open(pdf_path, "wb") as f:
        f.write(file_bytes)

    result = process_pdf(pdf_path, dirs["source"])

    paper = Paper(
        paper_uid=paper_uid,
        user_id=user.id,
        title=result["metadata"].get("title", Path(filename).stem),
        authors=result["metadata"].get("authors", "Unknown"),
        date=result["metadata"].get("date", ""),
        source_type="pdf",
        source_dir=dirs["source"],
        text_file_path=result["text_file_path"],
        image_files=result.get("image_files", []),
        status="processed",
    )
    session.add(paper)
    session.commit()
    session.refresh(paper)
    return paper


def get_paper(paper_uid: str, user: User, session: Session) -> Paper:
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        raise ValueError("Paper not found")
    return paper


def list_papers(user: User, session: Session) -> list[Paper]:
    return list(session.exec(select(Paper).where(Paper.user_id == user.id).order_by(Paper.created_at.desc())).all())


def delete_paper(paper_uid: str, user: User, session: Session) -> None:
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        raise ValueError("Paper not found")

    # Cascade deletes sequentially
    # Scripts
    for script in session.exec(select(Script).where(Script.paper_id == paper.id)).all():
        session.delete(script)
    # Media
    for media in session.exec(select(Media).where(Media.paper_id == paper.id)).all():
        session.delete(media)
    # Slides
    for slide in session.exec(select(Slide).where(Slide.paper_id == paper.id)).all():
        session.delete(slide)
    # Jobs
    for job in session.exec(select(Job).where(Job.paper_id == paper.id)).all():
        session.delete(job)

    # Note: paper.source_dir = "temp/papers/<uuid>/source", so dirname goes one up
    if paper.source_dir and os.path.exists(os.path.dirname(paper.source_dir)):
        shutil.rmtree(os.path.dirname(paper.source_dir), ignore_errors=True)

    session.delete(paper)
    session.commit()
