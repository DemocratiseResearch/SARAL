"""Shared FFmpeg / FFprobe subprocess helpers used across every render mode."""

import functools
import logging
import shlex
import subprocess
from pathlib import Path

log = logging.getLogger("ffmpeg-worker")

_ASSETS_DIR = Path(__file__).parent / "assets"


@functools.lru_cache(maxsize=1)
def _ffmpeg_has_subtitles_filter() -> bool:
    """True if ffmpeg was built with libass (`subtitles` / ASS burn-in).

    Homebrew FFmpeg is often shipped without `--enable-libass`, so the
    `subtitles=…` graph segment is rejected with a misleading parse error like
    "No option name near 'segment_000.ass'". Skip burn-in when unavailable;
    Debian/Ubuntu Docker images normally include libass.
    """
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-h", "filter=subtitles"],
        capture_output=True,
        text=True,
        timeout=30,
    )
    blob = ((proc.stderr or "") + (proc.stdout or "")).lower()
    if "unknown filter" in blob:
        log.warning(
            "ffmpeg subtitles filter unavailable (missing libass). "
            "Install ffmpeg with subtitle support or use Docker; captions on slide videos will be skipped."
        )
        return False
    return True


def _run(cmd: list[str], cwd: str | None = None):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"command failed ({' '.join(shlex.quote(c) for c in cmd)}): {proc.stderr[-4000:]}")


def _probe_duration(audio_path: str) -> float:
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {proc.stderr}")
    return max(float(proc.stdout.strip() or "0"), 0.1)


def _ffmpeg_loop_static_image_to_mp4(
    image_path: str | Path,
    output_path: str | Path,
    duration_sec: float,
    *,
    framerate: int = 30,
    scale_to: tuple[int, int] | None = None,
) -> None:
    """Encode one image as an H.264 MP4 of fixed duration.

    Same building block as podcast `_create_waveform_video` (background PNG + -loop 1)
    and reel title cards — avoids ffmpeg drawtext / libfreetype.

    scale_to=(w, h) downscales the still to that size (e.g. a 2x-rendered title
    PNG → the reel canvas) with crisp lanczos sampling.
    """
    cmd = ["ffmpeg", "-y", "-loop", "1", "-i", str(image_path)]
    if scale_to is not None:
        cmd += ["-vf", f"scale={scale_to[0]}:{scale_to[1]}:flags=lanczos"]
    cmd += [
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", str(framerate),
        "-t", str(duration_sec),
        str(output_path),
    ]
    _run(cmd)
