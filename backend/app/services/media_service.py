"""
Media service — audio (TTS) generation and video composition.
"""

import os
import logging
from pathlib import Path

from sqlmodel import Session, select

from app.models.paper import Paper
from app.models.script import Script
from app.models.slide import Slide
from app.models.media import Media
from app.models.user import User
from app.utils.tts import (
    get_language_code,
    synthesize_long_text,
    translate_text,
    SUPPORTED_LANGUAGES,
)
from app.utils.video import create_video
from app.utils.files import ensure_paper_dirs

logger = logging.getLogger(__name__)

SECTION_ORDER = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]


def _title_intro(paper: Paper) -> str:
    """Generate a simple title introduction narration."""
    parts = [f"This presentation covers the paper titled {paper.title}."]
    if paper.authors:
        parts.append(f"By {paper.authors}.")
    if paper.date:
        parts.append(f"Published in {paper.date}.")
    return " ".join(parts)


def generate_audio(
    paper_uid: str,
    user: User,
    session: Session,
    sarvam_api_key: str,
    language: str = "English",
    voice: str = "vidya",
) -> Media:
    """
    Generate per-section TTS audio.
    1. Translate scripts if language ≠ English.
    2. Synthesize each section + title intro via Sarvam.
    3. Persist Media row.
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

    lang_code = get_language_code(language)
    if not lang_code:
        raise ValueError(f"Unsupported language: {language}")

    dirs = ensure_paper_dirs(paper.paper_uid)
    audio_dir = dirs["audio"]

    # Build section text map
    sections_text: dict[str, str] = {}
    for script in scripts:
        sections_text[script.section_name] = script.content

    title_intro = _title_intro(paper)

    # Translate if needed
    if language != "English":
        title_intro = translate_text(sarvam_api_key, title_intro, language) or title_intro
        for name in list(sections_text.keys()):
            translated = translate_text(sarvam_api_key, sections_text[name], language)
            if translated:
                sections_text[name] = translated

    # Synthesize audio
    audio_files: list[str] = []

    # Title intro
    title_path = os.path.join(audio_dir, "00_title_intro.wav")
    if synthesize_long_text(sarvam_api_key, title_intro, title_path, lang_code, voice, language):
        audio_files.append(title_path)

    # Section audio
    for i, section_name in enumerate(SECTION_ORDER):
        text = sections_text.get(section_name)
        if not text:
            continue
        out_path = os.path.join(audio_dir, f"{i + 1:02d}_{section_name.lower()}.wav")
        if synthesize_long_text(sarvam_api_key, text, out_path, lang_code, voice, language):
            audio_files.append(out_path)
        else:
            logger.warning(f"Audio generation failed for section: {section_name}")

    if not audio_files:
        raise RuntimeError("No audio files were generated")

    # Upsert Media row
    existing = session.exec(
        select(Media).where(Media.paper_id == paper.id, Media.language == language)
    ).first()

    if existing:
        existing.audio_dir = audio_dir
        existing.audio_files = audio_files
        existing.voice = voice
        existing.status = "audio_ready"
        media = existing
    else:
        media = Media(
            paper_id=paper.id,
            language=language,
            voice=voice,
            audio_dir=audio_dir,
            audio_files=audio_files,
            status="audio_ready",
        )
    session.add(media)
    session.commit()
    session.refresh(media)
    return media


def generate_video_for_paper(
    paper_uid: str,
    user: User,
    session: Session,
    language: str = "English",
) -> Media:
    """
    Combine slide images + audio into an mp4 video.
    """
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        raise ValueError("Paper not found")

    slide = session.exec(select(Slide).where(Slide.paper_id == paper.id)).first()
    if not slide or not slide.image_paths:
        raise ValueError("Slides not generated yet")

    media = session.exec(
        select(Media).where(Media.paper_id == paper.id, Media.language == language)
    ).first()
    if not media or not media.audio_files:
        raise ValueError("Audio not generated yet")

    dirs = ensure_paper_dirs(paper.paper_uid)
    output_path = os.path.join(dirs["video"], f"presentation_{language.lower()}.mp4")

    create_video(
        slide_images=slide.image_paths,
        audio_files=media.audio_files,
        output_path=output_path,
    )

    media.video_path = output_path
    media.status = "video_ready"
    session.add(media)
    session.commit()
    session.refresh(media)
    return media


def get_media(paper_uid: str, user: User, session: Session, language: str = "English") -> Media | None:
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        raise ValueError("Paper not found")
    return session.exec(
        select(Media).where(Media.paper_id == paper.id, Media.language == language)
    ).first()


def get_supported_languages() -> dict[str, str]:
    return SUPPORTED_LANGUAGES.copy()
