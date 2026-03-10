"""
Script service — generate presentation scripts and bullet points from paper text.
"""

import logging
from sqlmodel import Session, select

from app.models.paper import Paper
from app.models.script import Script
from app.models.user import User
from app.providers.llm import generate_script, generate_bullet_points
from app.utils.latex import extract_text_from_file

logger = logging.getLogger(__name__)

SECTION_ORDER = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]


def generate_scripts(
    paper_uid: str,
    user: User,
    session: Session,
    model: str,
    api_key: str | None = None,
) -> list[Script]:
    """
    Generate section scripts + bullet points for a paper.
    1. Read paper text from the tex/text file.
    2. Call LLM to generate a full script, then split into sections.
    3. Call LLM to generate bullet points per section.
    4. Persist Script rows in DB.
    """
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        raise ValueError("Paper not found")

    # Read paper text
    file_path = paper.tex_file_path or paper.text_file_path
    if not file_path:
        raise ValueError("No text file available for this paper")
    paper_text = extract_text_from_file(file_path)

    # Generate full script → split into sections
    full_script = generate_script(paper_text, model=model, api_key=api_key)
    sections_scripts = _split_script(full_script)

    # Generate bullet points for all sections
    bullet_map = generate_bullet_points(sections_scripts, model=model, api_key=api_key)

    # Delete old scripts for this paper
    old = session.exec(select(Script).where(Script.paper_id == paper.id)).all()
    for o in old:
        session.delete(o)

    # Create new Script rows
    scripts: list[Script] = []
    for section_name in SECTION_ORDER:
        content = sections_scripts.get(section_name, "")
        bullets = bullet_map.get(section_name, [])
        if not content:
            continue
        script = Script(
            paper_id=paper.id,
            section_name=section_name,
            content=content,
            bullet_points=bullets,
        )
        session.add(script)
        scripts.append(script)

    session.commit()
    for s in scripts:
        session.refresh(s)
    return scripts


def get_scripts(paper_uid: str, user: User, session: Session) -> list[Script]:
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        raise ValueError("Paper not found")
    return list(session.exec(select(Script).where(Script.paper_id == paper.id)).all())


def update_script(
    script_id: int,
    user: User,
    session: Session,
    content: str | None = None,
    bullet_points: list[str] | None = None,
    assigned_image: str | None = None,
) -> Script:
    script = session.get(Script, script_id)
    if not script:
        raise ValueError("Script not found")
    # Verify ownership
    paper = session.get(Paper, script.paper_id)
    if not paper or paper.user_id != user.id:
        raise ValueError("Not authorized")

    if content is not None:
        script.content = content
    if bullet_points is not None:
        script.bullet_points = bullet_points
    if assigned_image is not None:
        script.assigned_image = assigned_image

    session.add(script)
    session.commit()
    session.refresh(script)
    return script


def assign_images(paper_uid: str, assignments: dict[str, str], user: User, session: Session):
    """Assign images to script sections. assignments: {section_name: image_path}"""
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        raise ValueError("Paper not found")

    scripts = session.exec(select(Script).where(Script.paper_id == paper.id)).all()
    for script in scripts:
        if script.section_name in assignments:
            script.assigned_image = assignments[script.section_name]
            session.add(script)
    session.commit()


# ── Internal helpers ──────────────────────────────────────────────────────────

def _split_script(full_script: str) -> dict[str, str]:
    """Split a full script into sections by header."""
    import re

    sections: dict[str, str] = {}
    # Match section headers like **Introduction:** or ## Methodology or Introduction:
    pattern = r"(?:^|\n)\s*(?:\*\*|#{1,3}\s*)?(" + "|".join(SECTION_ORDER) + r")(?:\*\*)?[:\s]*\n"
    parts = re.split(pattern, full_script, flags=re.IGNORECASE)

    # parts = [preamble, "Introduction", intro_text, "Methodology", method_text, ...]
    i = 1
    while i < len(parts) - 1:
        name = parts[i].strip()
        # Normalise to our canonical names
        for canonical in SECTION_ORDER:
            if canonical.lower() == name.lower():
                name = canonical
                break
        text = parts[i + 1].strip()
        # Clean markdown artifacts
        text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
        text = re.sub(r"\*([^*]+)\*", r"\1", text)
        text = re.sub(r"#+\s*", "", text)
        sections[name] = text
        i += 2

    return sections
