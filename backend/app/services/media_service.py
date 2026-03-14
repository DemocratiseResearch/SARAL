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

    # Build section text map (preserving DB order)
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

    # Synthesize audio (parallelized for speed)
    from concurrent.futures import ThreadPoolExecutor, as_completed

    # Build list of (output_path, text) tuples to synthesize
    synth_tasks: list[tuple[str, str]] = []

    # Title intro
    title_path = os.path.join(audio_dir, "00_title_intro.wav")
    synth_tasks.append((title_path, title_intro))

    # Section audio
    for i, section_name in enumerate(sections_text):
        text = sections_text[section_name]
        out_path = os.path.join(audio_dir, f"{i + 1:02d}_{section_name.lower()}.wav")
        synth_tasks.append((out_path, text))

    # Run TTS calls in parallel (max 4 concurrent to respect API rate limits)
    audio_files: list[str] = []
    successful_paths: set[str] = set()

    def _synth(path_text: tuple[str, str]) -> str | None:
        path, text = path_text
        if synthesize_long_text(sarvam_api_key, text, path, lang_code, voice, language):
            return path
        return None

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(_synth, task): task[0] for task in synth_tasks}
        for future in as_completed(futures):
            result = future.result()
            if result:
                successful_paths.add(result)

    # Preserve original ordering
    for path, _ in synth_tasks:
        if path in successful_paths:
            audio_files.append(path)

    if not audio_files:
        raise ValueError("No audio files were generated")

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
            audio_files_json="[]",
            status="audio_ready",
        )
        media.audio_files = audio_files
    paper.status = "audio_generated"
    session.add(paper)
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
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Paper not found")

    slide = session.exec(select(Slide).where(Slide.paper_id == paper.id)).first()
    if not slide or not slide.image_paths:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Slides not generated yet")

    media = session.exec(
        select(Media).where(Media.paper_id == paper.id, Media.language == language)
    ).first()
    if not media or not media.audio_files:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Audio not generated yet")

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
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Paper not found")
    return session.exec(
        select(Media).where(Media.paper_id == paper.id, Media.language == language)
    ).first()


def get_media_by_audio_file(paper_uid: str, user: User, session: Session, filename: str) -> Media | None:
    """Find the Media record that contains a specific audio file, regardless of language."""
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Paper not found")
    
    all_media = session.exec(
        select(Media).where(Media.paper_id == paper.id)
    ).all()
    
    for media in all_media:
        if media.audio_dir and os.path.isfile(os.path.join(media.audio_dir, filename)):
            return media
    return None


def get_latest_media(paper_uid: str, user: User, session: Session) -> Media | None:
    """Return the most recently created media for a paper, regardless of language."""
    paper = session.exec(
        select(Paper).where(Paper.paper_uid == paper_uid, Paper.user_id == user.id)
    ).first()
    if not paper:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Paper not found")
    return session.exec(
        select(Media).where(Media.paper_id == paper.id).order_by(Media.id.desc())
    ).first()


def get_supported_languages() -> dict[str, str]:
    return SUPPORTED_LANGUAGES.copy()
