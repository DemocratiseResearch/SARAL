"""
Slide service — generate PPTX presentation and convert to images.
"""

import logging
from sqlmodel import Session, select

from app.models.paper import Paper
from app.models.script import Script
from app.models.slide import Slide
from app.models.user import User
from app.utils.slides import create_presentation, pptx_to_images
from app.utils.files import ensure_paper_dirs

logger = logging.getLogger(__name__)


def generate_slides(paper_uid: str, user: User, session: Session) -> Slide:
    """
    Build a PPTX from the paper's scripts (bullet points + optional images),
    convert to slide images, and persist a Slide row.
    """
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        raise ValueError("Paper not found")

    scripts = list(
        session.exec(select(Script).where(Script.paper_id == paper.id)).all()
    )
    if not scripts:
        raise ValueError("Scripts not generated yet")

    dirs = ensure_paper_dirs(paper.paper_uid)

    # Build section data from scripts
    sections: dict[str, dict] = {}
    for script in scripts:
        sections[script.section_name] = {
            "bullet_points": script.bullet_points or [],
            "assigned_image": script.assigned_image,
        }

    metadata = {
        "title": paper.title or "Research Presentation",
        "authors": paper.authors or "",
        "date": paper.date or "",
    }

    # Create PPTX
    pptx_path = create_presentation(metadata, sections, dirs["slides"], paper.paper_uid)

    # Convert to images
    image_paths = pptx_to_images(pptx_path, dirs["slides"])
    if not image_paths:
        raise RuntimeError("Slide image conversion produced no images")

    # Upsert Slide row
    existing = session.exec(select(Slide).where(Slide.paper_id == paper.id)).first()
    if existing:
        existing.pptx_path = pptx_path
        existing.image_paths = image_paths
        existing.status = "generated"
        slide = existing
    else:
        slide = Slide(
            paper_id=paper.id,
            pptx_path=pptx_path,
            image_paths=image_paths,
            status="generated",
        )
    session.add(slide)
    session.commit()
    session.refresh(slide)
    return slide


def get_slide(paper_uid: str, user: User, session: Session) -> Slide | None:
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        raise ValueError("Paper not found")
    return session.exec(select(Slide).where(Slide.paper_id == paper.id)).first()
