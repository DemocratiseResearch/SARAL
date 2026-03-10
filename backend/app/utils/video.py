"""
Video composition — stitches slide images + audio into an mp4 using MoviePy.
"""

import os
import wave
import shutil
import logging
import subprocess
from typing import Optional

from moviepy.editor import (
    ImageClip,
    AudioFileClip,
    concatenate_videoclips,
    CompositeAudioClip,
)

logger = logging.getLogger(__name__)


def validate_audio(path: str) -> bool:
    """Check that a WAV file is valid and has content."""
    if not os.path.isfile(path):
        return False
    if os.path.getsize(path) < 1000:
        return False
    try:
        with wave.open(path, "rb") as wf:
            return wf.getnframes() > 0 and wf.getframerate() > 0
    except wave.Error:
        return False


def repair_audio(path: str) -> bool:
    """Re-encode a possibly corrupt WAV file via ffmpeg."""
    backup = path + ".bak"
    tmp = path + ".tmp.wav"
    try:
        os.rename(path, backup)
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-err_detect", "ignore_err",
                "-i", backup,
                "-c:a", "pcm_s16le", "-ar", "22050", "-ac", "1",
                tmp,
            ],
            check=True,
            capture_output=True,
        )
        os.rename(tmp, path)
        os.remove(backup)
        return True
    except Exception:
        if os.path.exists(backup):
            if os.path.exists(path):
                os.remove(path)
            os.rename(backup, path)
        return False


def _safe_audio_clip(path: str) -> Optional[AudioFileClip]:
    """Load an AudioFileClip, repairing if needed."""
    if not validate_audio(path):
        if not repair_audio(path):
            return None
    try:
        clip = AudioFileClip(path)
        if clip.duration and clip.duration > 0:
            return clip
        clip.close()
    except Exception:
        pass

    # One more repair attempt
    if repair_audio(path):
        try:
            clip = AudioFileClip(path)
            if clip.duration and clip.duration > 0:
                return clip
            clip.close()
        except Exception:
            pass
    return None


def create_video(
    slide_images: list[str],
    audio_files: list[str],
    output_path: str,
    background_music: Optional[str] = None,
) -> str:
    """
    Create an mp4 from slide images + per-slide audio files.

    Each slide is displayed for the duration of its corresponding audio.
    Returns the output file path.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Pair slides to valid audio
    valid_audio = [p for p in audio_files if validate_audio(p)]
    if not valid_audio:
        raise RuntimeError("No valid audio files")

    count = min(len(slide_images), len(valid_audio))
    clips: list = []

    for i in range(count):
        slide = slide_images[i]
        if not os.path.isfile(slide):
            logger.warning(f"Slide image missing: {slide}")
            continue

        audio_clip = _safe_audio_clip(valid_audio[i])
        if audio_clip is None:
            logger.warning(f"Audio unusable: {valid_audio[i]}")
            continue

        img_clip = ImageClip(slide, duration=audio_clip.duration).set_audio(audio_clip)
        clips.append(img_clip)

    if not clips:
        raise RuntimeError("No valid slide+audio pairs produced")

    final = concatenate_videoclips(clips, method="compose")

    # Background music
    if background_music and os.path.isfile(background_music):
        try:
            bg = AudioFileClip(background_music)
            if bg.duration < final.duration:
                bg = bg.loop(n=int(final.duration / bg.duration) + 1)
            bg = bg.volumex(0.1).subclip(0, final.duration)
            final = final.set_audio(CompositeAudioClip([final.audio, bg]))
        except Exception as e:
            logger.warning(f"Background music skipped: {e}")

    final.write_videofile(
        output_path,
        fps=1,
        codec="libx264",
        audio_codec="aac",
        temp_audiofile="temp-audio.m4a",
        remove_temp=True,
        verbose=False,
        logger=None,
    )

    for clip in clips:
        clip.close()
    final.close()

    return output_path
