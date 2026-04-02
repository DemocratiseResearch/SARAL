"""
SARAL Audio Generation Worker

Handles all Sarvam TTS audio generation in a dedicated ARQ worker process,
isolating blocking Sarvam API calls from the FastAPI event loop and from
other pipeline workers (video, slides, etc.).

Queue  : audio_generation_queue
Tasks  :
  generate_paper_audio_task    — Full-paper audio for video pipeline & media.py
                                 Handles English, Hindi, and all other Sarvam-
                                 supported languages via the appropriate
                                 tts_service helper.
  generate_dialogue_audio_task — Per-segment dialogue audio for podcast & reels.

Logging:
  All output goes to stdout so that both
  - journalctl -u saral-audio-worker@1.service   (production / systemd)
  - tail -f logs/audio_worker.log                 (local / start_workers.sh)
  show the same log lines.
"""

import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from arq.connections import RedisSettings

from app.services.sarvam_sdk import SarvamTTS
from app.services.tts_service import (
    ensure_audio_is_generated,
    ensure_hindi_audio_is_generated,
    ensure_language_audio_is_generated,
)
from app.services.firestore_helpers import update_pipeline_step, mark_pipeline_failed
from app.utils.context import set_execution_context
from app.utils.timing import track_performance

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Language-code map (same as tts_service.sarvam_tts)
# ---------------------------------------------------------------------------

_LANG_CODE: Dict[str, str] = {
    "english":   "en-IN",
    "hindi":     "hi-IN",
    "tamil":     "ta-IN",
    "bengali":   "bn-IN",
    "odia":      "od-IN",
    "kannada":   "kn-IN",
    "telugu":    "te-IN",
    "marathi":   "mr-IN",
    "gujarati":  "gu-IN",
    "punjabi":   "pa-IN",
    "malayalam": "ml-IN",
}


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _load_scripts_from_disk(paper_id: str) -> Dict:
    """Read the scripts JSON written by the script-generation stage."""
    scripts_file = f"temp/scripts/{paper_id}_scripts.json"
    if not os.path.exists(scripts_file):
        raise FileNotFoundError(
            f"Scripts file not found for paper {paper_id}: {scripts_file}"
        )
    with open(scripts_file, "r", encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Task 1 — Paper-level audio  (video pipeline & media.py)
# ---------------------------------------------------------------------------

@track_performance
async def generate_paper_audio_task(
    ctx,
    paper_id: str,
    sarvam_api_key: str,
    language: str,
    voice_selections: Dict[str, str],
    section_order: List[str],
    title_intro_script: Optional[str] = None,
    sections_scripts: Optional[Dict[str, str]] = None,
    hinglish_iterations: int = 3,
    openai_api_key: Optional[str] = None,
    show_hindi_debug: bool = False,
    execution_context: str = "AUDIO_WORKER",
) -> Dict[str, Any]:
    """
    Generate Sarvam TTS audio for all sections of a paper.

    Handles English, Hindi, and all other Sarvam-supported languages by
    routing to the correct tts_service helper:
      - English  → ensure_audio_is_generated
      - Hindi    → ensure_hindi_audio_is_generated
      - Other    → ensure_language_audio_is_generated

    If ``title_intro_script`` / ``sections_scripts`` are *None* (the video
    worker path), they are read from disk at
    ``temp/scripts/{paper_id}_scripts.json``
    which the script-generation stage always writes before this task runs.

    Returns
    -------
    {
        "status":      "success",
        "paper_id":    paper_id,
        "audio_files": [filename_only, ...],   # names only, not full paths
        "audio_dir":   "temp/audio/{paper_id}"
    }
    """
    set_execution_context(execution_context)
    started_at = datetime.now()
    audio_dir = f"temp/audio/{paper_id}"

    logger.info(
        f"[{paper_id[:8]}] generate_paper_audio_task started | language={language}"
    )

    try:
        update_pipeline_step(
            paper_id, "audio_generation",
            metadata={"language": language, "tts_source": "sarvam"},
            started_at=started_at, status="in_progress",
        )
    except Exception as pe:
        logger.warning(f"[{paper_id[:8]}] Pipeline tracking error: {pe}")

    try:
        # -------------------------------------------------------------------
        # 1. Resolve scripts — injected (media.py) or read from disk (workers)
        # -------------------------------------------------------------------
        if title_intro_script is None or sections_scripts is None:
            logger.info(
                f"[{paper_id[:8]}] Reading scripts from disk: "
                f"temp/scripts/{paper_id}_scripts.json"
            )
            scripts_data = _load_scripts_from_disk(paper_id)
            if title_intro_script is None:
                title_intro_script = scripts_data.get("title_intro_script", "")
            if sections_scripts is None:
                raw_sections = scripts_data.get("sections", {})
                sections_scripts = {
                    name: (
                        data.get("script", "") if isinstance(data, dict) else str(data)
                    )
                    for name, data in raw_sections.items()
                }

        # -------------------------------------------------------------------
        # 2. TTS init + connection test (in this worker process)
        # -------------------------------------------------------------------
        logger.info(f"[{paper_id[:8]}] Testing Sarvam TTS connection...")
        tts_check = SarvamTTS(api_key=sarvam_api_key)
        if not tts_check.test_connection():
            raise RuntimeError(
                "Sarvam TTS connection test failed inside audio worker"
            )
        logger.info(f"[{paper_id[:8]}] Sarvam TTS connection verified")

        # -------------------------------------------------------------------
        # 3. Branch by language → appropriate tts_service function
        # -------------------------------------------------------------------
        if language == "Hindi":
            logger.info(
                f"[{paper_id[:8]}] Routing to ensure_hindi_audio_is_generated"
            )
            audio_response = ensure_hindi_audio_is_generated(
                sarvam_api_key=sarvam_api_key,
                paper_id=paper_id,
                title_intro_script=title_intro_script,
                sections_scripts=sections_scripts,
                voice_selections=voice_selections,
                section_order=section_order,
                hinglish_iterations=hinglish_iterations,
                openai_api_key=openai_api_key,
                show_hindi_debug=show_hindi_debug,
            )

        elif language == "English":
            logger.info(
                f"[{paper_id[:8]}] Routing to ensure_audio_is_generated (English)"
            )
            audio_response = ensure_audio_is_generated(
                sarvam_api_key=sarvam_api_key,
                language=language,
                paper_id=paper_id,
                title_intro_script=title_intro_script,
                sections_scripts=sections_scripts,
                voice_selections=voice_selections,
                section_order=section_order,
                hinglish_iterations=hinglish_iterations,
                openai_api_key=openai_api_key,
                show_hindi_debug=show_hindi_debug,
            )

        else:
            # Tamil, Bengali, Gujarati, Punjabi, Marathi, Telugu, Kannada, etc.
            logger.info(
                f"[{paper_id[:8]}] Routing to ensure_language_audio_is_generated "
                f"({language})"
            )
            audio_response = ensure_language_audio_is_generated(
                sarvam_api_key=sarvam_api_key,
                language=language,
                paper_id=paper_id,
                title_intro_script=title_intro_script,
                sections_scripts=sections_scripts,
                voice_selections=voice_selections,
                section_order=section_order,
                hinglish_iterations=hinglish_iterations,
                openai_api_key=openai_api_key,
            )

        audio_files = audio_response.get("audio_files", [])
        logger.info(
            f"[{paper_id[:8]}] Audio generation complete: {len(audio_files)} file(s)"
        )

        try:
            update_pipeline_step(
                paper_id, "audio_generation",
                metadata={
                    "language": language,
                    "audio_files_count": len(audio_files),
                    "audio_dir": audio_dir,
                },
                started_at=started_at, status="completed",
            )
        except Exception as pe:
            logger.warning(f"[{paper_id[:8]}] Pipeline tracking error: {pe}")

        return {
            "status": "success",
            "paper_id": paper_id,
            "audio_files": audio_files,
            "audio_dir": audio_dir,
        }

    except Exception as e:
        logger.error(
            f"[{paper_id[:8]}] generate_paper_audio_task FAILED: {e}",
            exc_info=True,
        )
        try:
            mark_pipeline_failed(paper_id, "audio_generation", e, started_at=started_at)
        except Exception as pe:
            logger.warning(f"[{paper_id[:8]}] Pipeline tracking error: {pe}")
        raise


# ---------------------------------------------------------------------------
# Task 2 — Dialogue-segment audio  (podcast & reels)
# ---------------------------------------------------------------------------

@track_performance
async def generate_dialogue_audio_task(
    ctx,
    paper_id: str,
    sarvam_api_key: str,
    language: str,
    segments: List[Dict[str, str]],
    output_dir: str,
    pipeline_step: str = "audio_generation",
    execution_context: str = "AUDIO_WORKER_DIALOGUE",
) -> Dict[str, Any]:
    """
    Generate Sarvam TTS audio for dialogue segments (podcast & reels).

    Parameters
    ----------
    segments : list of dicts, each with keys:
        "text"        — the line of dialogue to synthesise
        "voice"       — a Sarvam voice name, e.g. "simran", "aditya"
        "output_path" — absolute or relative path for the output .wav file

    Returns
    -------
    {
        "status":      "success",
        "paper_id":    paper_id,
        "audio_files": [output_path, ...]   # paths of files successfully written
    }
    """
    set_execution_context(execution_context)
    started_at = datetime.now()

    logger.info(
        f"[{paper_id[:8]}] generate_dialogue_audio_task started | "
        f"language={language} | segments={len(segments)}"
    )

    try:
        update_pipeline_step(
            paper_id, pipeline_step,
            metadata={
                "language": language,
                "segments": len(segments),
                "tts_source": "sarvam",
            },
            started_at=started_at, status="in_progress",
        )
    except Exception as pe:
        logger.warning(f"[{paper_id[:8]}] Pipeline tracking error: {pe}")

    try:
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        # TTS init + connection test (in this worker process)
        logger.info(f"[{paper_id[:8]}] Initialising Sarvam TTS client...")
        tts = SarvamTTS(api_key=sarvam_api_key)
        if not tts.test_connection():
            raise RuntimeError(
                "Sarvam TTS connection test failed inside audio worker"
            )
        logger.info(f"[{paper_id[:8]}] Sarvam TTS connection verified")

        target_language_code = _LANG_CODE.get(language.lower(), "en-IN")
        audio_files: List[str] = []

        for idx, seg in enumerate(segments):
            text = seg.get("text", "").strip()
            voice = seg.get("voice", "simran")
            output_path = seg.get("output_path", "")

            if not text or not output_path:
                logger.debug(
                    f"[{paper_id[:8]}] Skipping empty segment {idx}"
                )
                continue

            logger.info(
                f"[{paper_id[:8]}] Segment {idx + 1}/{len(segments)} | "
                f"voice={voice} | chars={len(text)}"
            )

            audio_bytes = tts.synthesize_text(
                text=text,
                target_language=target_language_code,
                voice=voice,
            )

            if audio_bytes:
                Path(output_path).parent.mkdir(parents=True, exist_ok=True)
                with open(output_path, "wb") as fh:
                    fh.write(audio_bytes)
                audio_files.append(output_path)
                logger.debug(
                    f"[{paper_id[:8]}] Written {len(audio_bytes)} bytes → {output_path}"
                )
            else:
                logger.warning(
                    f"[{paper_id[:8]}] No audio bytes returned for segment {idx}"
                )

        logger.info(
            f"[{paper_id[:8]}] Dialogue audio complete: "
            f"{len(audio_files)}/{len(segments)} segment(s) generated"
        )

        try:
            update_pipeline_step(
                paper_id, pipeline_step,
                metadata={"language": language, "audio_files_count": len(audio_files)},
                started_at=started_at, status="completed",
            )
        except Exception as pe:
            logger.warning(f"[{paper_id[:8]}] Pipeline tracking error: {pe}")

        return {
            "status": "success",
            "paper_id": paper_id,
            "audio_files": audio_files,
        }

    except Exception as e:
        logger.error(
            f"[{paper_id[:8]}] generate_dialogue_audio_task FAILED: {e}",
            exc_info=True,
        )
        try:
            mark_pipeline_failed(paper_id, pipeline_step, e, started_at=started_at)
        except Exception as pe:
            logger.warning(f"[{paper_id[:8]}] Pipeline tracking error: {pe}")
        raise


# ---------------------------------------------------------------------------
# Startup / Shutdown hooks
# ---------------------------------------------------------------------------

async def startup(ctx):
    # force=True overrides any root-logger config set by imported modules
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
        force=True,
    )
    logger.info("SARAL Audio Worker starting up")


async def shutdown(ctx):
    logger.info("SARAL Audio Worker shutting down")


# ---------------------------------------------------------------------------
# Worker settings
# ---------------------------------------------------------------------------

class AudioWorkerSettings:
    """ARQ worker configuration for the audio generation queue."""

    redis_settings = RedisSettings(host='localhost', port=6379, database=0)
    functions = [generate_paper_audio_task, generate_dialogue_audio_task]
    on_startup = startup
    on_shutdown = shutdown
    queue_name = 'audio_generation_queue'
    max_jobs = 4        # I/O-bound — safe to run 4 concurrent TTS jobs
    job_timeout = 600   # 10 minutes per job
    keep_result = 7200  # keep job results in Redis for 2 hours
    allow_abort_jobs = True
    max_tries = 2       # TTS jobs are expensive; limit auto-retries


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    from arq import run_worker
    sys.exit(run_worker(AudioWorkerSettings))
