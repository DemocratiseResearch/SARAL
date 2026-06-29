import functools
import json
import logging
import os
import re
import shlex
import signal
import subprocess
import sys
import tempfile
import textwrap
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False

import redis as redis_lib
from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).parent.parent.parent / ".env.shared")

from saral_shared import storage_client as storage  # noqa: E402
from saral_shared import webhook_client as wh  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
log = logging.getLogger("ffmpeg-worker")

STREAM = "saral:jobs:ffmpeg"
GROUP = "saral-workers"
CONSUMER = f"ffmpeg-worker-{os.environ.get('HOSTNAME', str(os.getpid()))}"

_SUBTITLE_WORDS_PER_CUE = 8  # words per subtitle cue for slide videos

# Module-level state for SIGTERM handler
_rdb = None
_current_msg_id = None


def _sigterm_handler(sig, frame):
    log.info("[SIGTERM] shutting down, cleaning up consumer %s", CONSUMER)
    try:
        if _current_msg_id and _rdb:
            _rdb.xack(STREAM, GROUP, _current_msg_id)
        if _rdb:
            _rdb.xgroup_delconsumer(STREAM, GROUP, CONSUMER)
    except Exception as exc:
        log.warning("[SIGTERM] cleanup error: %s", exc)
    sys.exit(0)


signal.signal(signal.SIGTERM, _sigterm_handler)


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


def _download_frames(prefix: str, frames_dir: Path) -> list[Path]:
    frames_dir.mkdir(parents=True, exist_ok=True)
    frame_paths: list[Path] = []
    for frame_gcs_path in storage.list_objects(prefix):
        local_path = frames_dir / Path(frame_gcs_path).name
        storage.download_to_file(frame_gcs_path, str(local_path))
        frame_paths.append(local_path)
    return sorted(frame_paths)


def _download_audio_segments(audio_paths: list[str], audio_dir: Path) -> list[Path]:
    audio_dir.mkdir(parents=True, exist_ok=True)
    local_paths: list[Path] = []
    for idx, audio_gcs_path in enumerate(audio_paths):
        local_path = audio_dir / f"part_{idx:02d}.wav"
        storage.download_to_file(audio_gcs_path, str(local_path))
        local_paths.append(local_path)
    return local_paths


def _concat_audio(audio_files: list[Path], output_path: Path) -> Path | None:
    if not audio_files:
        return None
    if len(audio_files) == 1:
        return audio_files[0]

    concat_file = output_path.parent / f"{output_path.stem}.txt"
    concat_file.write_text(
        "\n".join(f"file '{audio_file.as_posix()}'" for audio_file in audio_files),
        encoding="utf-8",
    )
    _run(
        [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-c:a",
            "pcm_s16le",
            str(output_path),
        ]
    )
    return output_path


# ── Subtitle helpers ───────────────────────────────────────────────────────────
_SUBTITLE_LINE_WIDTH = 50

_ASS_STYLE_LINE = (
    # BackColour &H99000000 ≈ 40% visible black — softer than &H66 (60%)
    "Style: Default,Helvetica Neue,40,&H00FFFFFF,&H000000FF,&H00000000,&H99000000,"
    "1,0,0,0,100,100,0,0,4,0,0,2,180,180,120,1"
)

_SUBTITLE_PAD_HORIZONTAL = "        "       # 8 spaces ≈ 80px at fontsize 40
_SUBTITLE_PAD_VERTICAL = "\\N\\N"           # two blank lines top & bottom
_ASS_HEADER = (
    "[Script Info]\n"
    "ScriptType: v4.00+\n"
    "PlayResX: 1920\n"
    "PlayResY: 1080\n"
    "WrapStyle: 0\n"
    "ScaledBorderAndShadow: yes\n"
    "\n"
    "[V4+ Styles]\n"
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
    "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
    "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
    "Alignment, MarginL, MarginR, MarginV, Encoding\n"
    f"{_ASS_STYLE_LINE}\n"
    "\n"
    "[Events]\n"
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
    "Effect, Text\n"
)


def _format_ass_timestamp(seconds: float) -> str:
    """ASS uses H:MM:SS.cc (centiseconds, single-digit hour)."""
    if seconds < 0:
        seconds = 0.0
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centis = int(round((seconds - int(seconds)) * 100))
    if centis == 100:
        secs += 1
        centis = 0
    return f"{hours:d}:{minutes:02d}:{secs:02d}.{centis:02d}"


def _chunk_words(words: list[str], max_words: int) -> list[str]:
    """Split a flat word list into chunks of ≤ max_words, returning each as a
    single space-joined string. Used to break a long sentence into several
    cues so each cue is one short, easily-readable line."""
    if not words:
        return []
    return [
        " ".join(words[i : i + max_words])
        for i in range(0, len(words), max_words)
    ]


def _split_narration_into_cues(
    text: str,
    total_duration: float,
    max_words_per_cue: int = _SUBTITLE_WORDS_PER_CUE,
) -> list[tuple[float, float, str]]:
    """Split narration into time-distributed subtitle cues.

    Two-level split:
      1. Split on sentence boundaries.
      2. Split each sentence further into ≤ max_words_per_cue-word
         chunks so the on-screen text is one short line at a time, not a
         multi-line block. Defaults to _SUBTITLE_WORDS_PER_CUE (slide mode);
         the reel passes a smaller value for punchier captions.

    Time is distributed by total word count across all chunks, so each
    chunk's screen time is proportional to how many words it carries.

    Returns list of (start_sec, end_sec, text) tuples. [] if no text.
    """
    cleaned = (text or "").strip()
    if not cleaned or total_duration <= 0:
        return []

    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()]
    if not sentences:
        return []

    # Build flat list of (chunk_text, word_count) across all sentences.
    chunks: list[tuple[str, int]] = []
    for sentence in sentences:
        words = sentence.split()
        for piece in _chunk_words(words, max_words_per_cue):
            chunks.append((piece, max(1, len(piece.split()))))

    if not chunks:
        return []

    total_words = sum(wc for _, wc in chunks)

    cues: list[tuple[float, float, str]] = []
    cursor = 0.0
    for chunk_text, chunk_words in chunks:
        share = (chunk_words / total_words) * total_duration
        start = cursor
        end = min(total_duration, cursor + share)
        cursor = end
        # Soft fallback: if a chunk is somehow longer than the visual cap,
        # wrap it. With max=12 words this almost never triggers.
        wrapped = "\\N".join(
            textwrap.wrap(chunk_text, width=_SUBTITLE_LINE_WIDTH)
        ) or chunk_text
        cues.append((start, end, wrapped))

    # Pin the last cue to exactly total_duration to absorb float drift.
    if cues:
        s, _, t = cues[-1]
        cues[-1] = (s, total_duration, t)
    return cues


def _write_ass(cues: list[tuple[float, float, str]], path: Path) -> None:
    """Write an ASS subtitle file with embedded style.

    All styling is inside the file (Style: Default), so the ffmpeg filter
    is just `subtitles=foo.ass` — no force_style escaping needed.

    Each cue's text is wrapped with horizontal padding spaces and vertical
    padding blank lines so the translucent pill has visible breathing room
    around the text (libass has no real box-padding parameter).
    """
    lines = [_ASS_HEADER]
    for start, end, text in cues:
        # Strip CR/LF that could break the ASS Dialogue line; keep \N escapes.
        safe = text.replace("\r", " ").replace("\n", " ").strip()
        # Inject padding: pad every visual line, plus a blank line above & below.
        padded_lines = [
            f"{_SUBTITLE_PAD_HORIZONTAL}{ln}{_SUBTITLE_PAD_HORIZONTAL}"
            for ln in safe.split("\\N")
        ]
        padded = (
            _SUBTITLE_PAD_VERTICAL
            + "\\N".join(padded_lines)
            + _SUBTITLE_PAD_VERTICAL
        )
        lines.append(
            f"Dialogue: 0,{_format_ass_timestamp(start)},"
            f"{_format_ass_timestamp(end)},Default,,0,0,0,,{padded}\n"
        )
    path.write_text("".join(lines), encoding="utf-8")


def _render_segment(
    frame_path: Path,
    audio_path: Path | None,
    duration: float,
    output_path: Path,
    narration: str | None = None,
):
    video_filter = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"

    cwd: str | None = None
    if narration and narration.strip() and duration > 0 and _ffmpeg_has_subtitles_filter():
        ass_path = output_path.parent / f"{output_path.stem}.ass"
        cues = _split_narration_into_cues(narration, duration)
        if cues:
            _write_ass(cues, ass_path)
            video_filter = f"{video_filter},subtitles=filename={ass_path.name}"
            cwd = str(output_path.parent)
    fps_str = str(_SLIDE_FPS)
    threads_str = str(_FFMPEG_THREADS_PER_ENCODE)
    if audio_path is None:
        _run(
            [
                "ffmpeg",
                "-y",
                "-loop",
                "1",
                "-framerate",
                fps_str,
                "-i",
                str(frame_path),
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-t",
                f"{duration:.3f}",
                "-threads",
                threads_str,
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-tune",
                "stillimage",
                "-r",
                fps_str,
                "-pix_fmt",
                "yuv420p",
                "-vf",
                video_filter,
                "-c:a",
                "aac",
                "-shortest",
                str(output_path),
            ],
            cwd=cwd,
        )
        return

    _run(
        [
            "ffmpeg",
            "-y",
            "-loop",
            "1",
            "-framerate",
            fps_str,
            "-i",
            str(frame_path),
            "-i",
            str(audio_path),
            "-threads",
            threads_str,
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-tune",
            "stillimage",
            "-r",
            fps_str,
            "-pix_fmt",
            "yuv420p",
            "-vf",
            video_filter,
            "-c:a",
            "aac",
            "-shortest",
            str(output_path),
        ],
        cwd=cwd,
    )


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


def process_job(rdb, msg_id: str, data: dict):
    log.info("msg_id=%s: received job with keys=%s", msg_id, list(data.keys()))
    run_id = data["run_id"]
    step_id = data["step_id"]
    paper_id = data["paper_id"]
    user_id = data["user_id"]
    mode = data.get("mode", "frame-based")  # "frame-based" or "waveform"

    log.info("run_id=%s: mode=%s", run_id, mode)

    if mode == "waveform":
        return _process_waveform_video(rdb, msg_id, run_id, step_id, paper_id, user_id, data)
    elif mode == "reel":
        return _process_reel_video(rdb, msg_id, run_id, step_id, paper_id, user_id, data)
    else:
        return _process_frame_based_video(rdb, msg_id, run_id, step_id, paper_id, user_id, data)


def _process_waveform_video(rdb, msg_id: str, run_id: str, step_id: str, paper_id: str, user_id: str, data: dict):
    """Generate waveform visualization video from audio (podcast mode)"""
    audio_gcs_path = data.get("audio_gcs_path")
    paper_title    = data.get("paper_title", "Research Podcast")
    paper_authors  = data.get("paper_authors", "")
    mic_gcs_path   = data.get("mic_gcs_path", "")  # optional GCS override for mic image
    log.info("run_id=%s: waveform mode, audio_path=%s", run_id, audio_gcs_path)

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            local_audio = os.path.join(tmpdir, "podcast.wav")
            storage.download_to_file(audio_gcs_path, local_audio)

            # Resolve mic image: job-data override → bundled asset
            mic_path = _DEFAULT_MIC_PATH
            if mic_gcs_path:
                local_mic = os.path.join(tmpdir, "mic.png")
                try:
                    storage.download_to_file(mic_gcs_path, local_mic)
                    mic_path = local_mic
                except Exception as exc:
                    log.warning("Could not download mic override from GCS (%s): %s", mic_gcs_path, exc)

            video_path = os.path.join(tmpdir, "podcast_video.mp4")
            _create_waveform_video(local_audio, video_path,
                                   paper_title=paper_title,
                                   author=paper_authors,
                                   mic_path=mic_path)
            output_key = f"{user_id}/{paper_id}/runs/{run_id}/ffmpeg_stitch/podcast_video.mp4"
            output_path = storage.upload_file(video_path, output_key, content_type="video/mp4")

        wh.send_webhook({
            "run_id": run_id, "step_id": step_id, "step_name": "ffmpeg_stitch",
            "status": "completed", "gcs_output_path": output_path, "error_message": "",
            "next_step": "", "next_job_data": {},
        })
        rdb.xack("saral:jobs:ffmpeg", "saral-workers", msg_id)
        log.info("run_id=%s: waveform video complete", run_id)
    except Exception as exc:
        log.exception("run_id=%s: waveform video failed", run_id)
        try:
            wh.send_webhook({
                "run_id": run_id, "step_id": step_id, "step_name": "ffmpeg_stitch",
                "status": "failed", "gcs_output_path": "", "error_message": str(exc),
                "next_step": "", "next_job_data": {},
            })
        except Exception:
            pass


# ── Waveform video helpers ─────────────────────────────────────────────────────

_CANVAS_W = 1280
_CANVAS_H = 720
_WAVE_H = 160  # height of the waveform strip at the bottom

_FONT_CANDIDATES_BOLD = [
    # Linux (Docker)
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    # macOS
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]
_FONT_CANDIDATES_REGULAR = [
    # Linux (Docker)
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    # macOS
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]

_ASSETS_DIR = Path(__file__).parent / "assets"
_DEFAULT_MIC_PATH = str(_ASSETS_DIR / "mic.png")


def get_duration_label(audio_path: str) -> str:
    """Return a human-readable duration label, e.g. '8-Min'."""
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", audio_path],
        capture_output=True, text=True,
    )
    try:
        secs = float(proc.stdout.strip())
        mins = max(1, round(secs / 60))
        return f"{mins}-Min"
    except Exception:
        return "Short"


def _load_font(size: int, bold: bool = False):
    if not _PIL_AVAILABLE:
        return None
    candidates = _FONT_CANDIDATES_BOLD if bold else _FONT_CANDIDATES_REGULAR
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def _clean_dark_fringe(img):
    """Remove dark halo artifacts from removebg-processed PNGs."""
    img = img.convert("RGBA")
    threshold = 40
    data = list(img.getdata())
    cleaned = [
        (r, g, b, 0) if (r < threshold and g < threshold and b < threshold) else (r, g, b, a)
        for r, g, b, a in data
    ]
    result = Image.new("RGBA", img.size)
    result.putdata(cleaned)
    return result


def _fit_title_font_wrapped(title: str, available_width: int):
    """
    Return (font, wrapped_text) sized so the widest wrapped line fits within
    available_width pixels.
    """
    import textwrap
    for size in range(34, 15, -2):
        font = _load_font(size, bold=True)
        wrap_chars = max(28, int(38 * 34 / size))
        wrapped = textwrap.fill(title, width=wrap_chars)
        max_line_w = 0
        for line in wrapped.split("\n"):
            try:
                bbox = font.getbbox(line)
                line_w = bbox[2] - bbox[0]
            except AttributeError:
                line_w = int(len(line) * size * 0.6)
            max_line_w = max(max_line_w, line_w)
        if max_line_w <= available_width:
            return font, wrapped
    font = _load_font(16, bold=True)
    import textwrap as _tw
    return font, _tw.fill(title, width=70)


def generate_background(
    paper_title: str,
    author: str,
    duration_label: str,
    output_path: str,
    mic_path: str = _DEFAULT_MIC_PATH,
):
    """Render a 1280x720 styled background PNG for the podcast waveform video."""
    W, H = _CANVAS_W, _CANVAS_H
    WAVEFORM_H = _WAVE_H        # 160
    CONTENT_H  = H - WAVEFORM_H  # 560

    bg = Image.new("RGBA", (W, H), color=(220, 235, 245, 255))

    # ---- Mic image (left side) ----
    text_x = 120  # fallback if mic image missing
    if os.path.exists(mic_path):
        try:
            mic = _clean_dark_fringe(Image.open(mic_path).convert("RGBA"))
            mic_target_h = 280
            ratio = mic_target_h / mic.height
            mic_w = int(mic.width * ratio)
            mic = mic.resize((mic_w, mic_target_h), Image.LANCZOS)
            mic_x = 60
            mic_y = (CONTENT_H - mic_target_h) // 2 + 20
            bg.paste(mic, (mic_x, mic_y), mask=mic)
            text_x = mic_x + mic_w + 60
        except Exception as exc:
            log.warning("Could not load mic image from %s: %s", mic_path, exc)
    else:
        log.warning("Mic image not found at %s, skipping", mic_path)

    draw = ImageDraw.Draw(bg)

    # ---- Typography (left-aligned) ----
    font_headline = _load_font(52, bold=True)
    font_subtitle = _load_font(34, bold=True)
    font_small    = _load_font(26, bold=False)

    y = 90
    draw.text((text_x, y), f"{duration_label} Research Podcast",
              font=font_headline, fill=(10, 10, 10))
    y += 80
    draw.text((text_x, y), "Using SARAL AI",
              font=font_subtitle, fill=(40, 40, 40))
    y += 58
    draw.line([(text_x, y), (W - 60, y)], fill=(150, 170, 190), width=2)
    y += 20

    # Adaptive title font so long titles never clip
    title_font, wrapped_title = _fit_title_font_wrapped(paper_title, W - 60 - text_x)
    draw.multiline_text((text_x, y), wrapped_title,
                        font=title_font, fill=(20, 20, 20), spacing=10)

    # Author anchored near bottom of content area
    if author:
        draw.text((text_x, CONTENT_H - 70), author,
                  font=font_small, fill=(70, 70, 70))

    # Waveform placeholder strip
    draw.rectangle([(0, CONTENT_H), (W, H)], fill=(180, 205, 225, 255))

    bg = bg.convert("RGB")
    bg.save(output_path, "PNG")
    log.info("background PNG generated: %s", output_path)


def _create_waveform_video(
    audio_path: str,
    output_path: str,
    paper_title: str = "Research Podcast",
    author: str = "",
    mic_path: str = _DEFAULT_MIC_PATH,
):
    """Render a podcast waveform video: styled background + animated showwaves overlay."""
    bg_path = output_path.replace(".mp4", "_bg.png")
    duration_label = get_duration_label(audio_path)

    if _PIL_AVAILABLE:
        generate_background(paper_title, author, duration_label, bg_path,
                            mic_path=mic_path)
        filter_complex = (
            "[1:a]showwaves=s=1280x160:mode=cline:rate=30:colors=0x3A5A8C[waves];"
            "[0:v][waves]overlay=0:560[v]"
        )
        cmd = [
            "ffmpeg", "-y",
            "-loop", "1", "-i", bg_path,
            "-i", audio_path,
            "-filter_complex", filter_complex,
            "-map", "[v]", "-map", "1:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-shortest", output_path,
        ]
    else:
        # Fallback when PIL is not available: coloured background + showwaves, no text
        filter_complex = (
            "color=c=0xDCEBF5:s=1280x720[bg];"
            "[1:a]showwaves=s=1280x160:mode=cline:rate=30:colors=0x3A5A8C[waves];"
            "[bg][waves]overlay=0:560[v]"
        )
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "nullsrc=s=1280x720",
            "-i", audio_path,
            "-filter_complex", filter_complex,
            "-map", "[v]", "-map", "1:a",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-shortest", output_path,
        ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if os.path.exists(bg_path):
        os.remove(bg_path)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg waveform render failed: {result.stderr[-4000:]}")
    log.info("waveform video created: %s", output_path)



_MAX_ENCODE_WORKERS = min(max(2, (os.cpu_count() or 4) // 2), 4)
_FFMPEG_THREADS_PER_ENCODE = max(1, (os.cpu_count() or 4) // _MAX_ENCODE_WORKERS)

_SLIDE_FPS = 5


def _render_one_slide(
    idx: int,
    frame_path: "Path",
    slide: dict,
    audio_dir: "Path",
    segments_dir: "Path",
    run_id: str,
    total: int,
) -> "tuple[int, Path, float, str]":
    """Download, concat, probe, and encode a single slide segment.

    Designed to run inside a ThreadPoolExecutor; all heavy work is done via
    FFmpeg subprocesses so the GIL is released for the duration of the encode.

    Returns (idx, segment_path, duration_seconds, narration_text) so callers
    can re-sort into the original order AND build a global subtitle file
    later (after concat) with cumulative time offsets.

    Subtitles are NO LONGER burned into the per-segment video. Two finals
    get built downstream: a clean no-subs video, and a second pass that
    burns subs over the concatenated whole. This lets the frontend toggle
    between the two without re-rendering.
    """
    local_audio_parts = _download_audio_segments(
        slide.get("audio_paths", []), audio_dir / f"slide_{idx:03d}"
    )
    merged_audio = _concat_audio(local_audio_parts, audio_dir / f"slide_{idx:03d}.wav")
    duration = _probe_duration(str(merged_audio)) if merged_audio else 2.5

    segment_path = segments_dir / f"segment_{idx:03d}.mp4"
    _render_segment(
        frame_path,
        merged_audio,
        duration,
        segment_path,
        narration=None,  # subs are burned post-concat, not per-segment
    )
    log.info("run_id=%s: rendered segment %d/%d (%.2fs)", run_id, idx + 1, total, duration)
    return idx, segment_path, duration, slide.get("text") or ""


def _process_frame_based_video(rdb, msg_id: str, run_id: str, step_id: str, paper_id: str, user_id: str, data: dict):
    """Generate frame-based presentation video (video mode)"""
    frames_prefix = data["frames_prefix"]
    audio_manifest_path = data["audio_manifest_gcs_path"]
    log.info("run_id=%s: frame-based mode, frames_prefix=%s audio_manifest=%s", run_id, frames_prefix, audio_manifest_path)

    try:
        manifest = storage.download_json(audio_manifest_path)
        log.info("run_id=%s: manifest downloaded, slides=%d", run_id, len(manifest.get("slides", [])))

        with tempfile.TemporaryDirectory() as tmpdir:
            workdir = Path(tmpdir)
            frames_dir = workdir / "frames"
            audio_dir = workdir / "audio"
            segments_dir = workdir / "segments"
            audio_dir.mkdir(parents=True, exist_ok=True)
            segments_dir.mkdir(parents=True, exist_ok=True)

            frame_paths = _download_frames(frames_prefix, frames_dir)
            log.info("run_id=%s: downloaded %d frames", run_id, len(frame_paths))
            if not frame_paths:
                raise RuntimeError("no frame images found for ffmpeg stitching")

            slides = {slide["frame_index"]: slide for slide in manifest.get("slides", [])}

            workers = min(len(frame_paths), _MAX_ENCODE_WORKERS)
            log.info("run_id=%s: encoding %d segments with %d parallel workers", run_id, len(frame_paths), workers)

            segment_results: list[tuple[int, Path, float, str]] = []
            encode_errors: list[tuple[int, BaseException]] = []
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures: dict = {
                    pool.submit(
                        _render_one_slide,
                        idx, frame_path, slides.get(idx, {}),
                        audio_dir, segments_dir, run_id, len(frame_paths),
                    ): idx
                    for idx, frame_path in enumerate(frame_paths)
                }
                for future in as_completed(futures):
                    slide_idx = futures[future]
                    try:
                        segment_results.append(future.result())
                    except Exception as exc:
                        encode_errors.append((slide_idx, exc))
                        log.error("run_id=%s: slide %d encode failed: %s", run_id, slide_idx, exc)
                        for pending in futures:
                            pending.cancel()


            if encode_errors:
                failed_indices = sorted(idx for idx, _ in encode_errors)
                raise RuntimeError(
                    f"encoding failed for slide(s) {failed_indices}: {encode_errors[0][1]}"
                )


            segment_results.sort(key=lambda t: t[0])
            segment_paths = [t[1] for t in segment_results]

            concat_file = workdir / "segments.txt"
            concat_file.write_text(
                "\n".join(f"file '{segment.as_posix()}'" for segment in segment_paths),
                encoding="utf-8",
            )
            final_video = workdir / "final_video.mp4"
            _run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    str(concat_file),
                    "-c",
                    "copy",
                    "-movflags",
                    "+faststart",
                    str(final_video),
                ]
            )

            output_key = f"{user_id}/{paper_id}/runs/{run_id}/ffmpeg_stitch/final_video.mp4"
            output_path = storage.upload_file(str(final_video), output_key, content_type="video/mp4")
            log.info("run_id=%s: no-subs video uploaded to %s", run_id, output_path)


            global_cues: list[tuple[float, float, str]] = []
            cursor = 0.0
            for _idx, _seg_path, seg_duration, seg_narration in segment_results:
                if seg_narration.strip():
                    seg_cues = _split_narration_into_cues(
                        seg_narration, seg_duration
                    )
                    for s, e, t in seg_cues:
                        global_cues.append((cursor + s, cursor + e, t))
                cursor += seg_duration

            output_path_subs = output_path  # fallback if subs build fails
            if global_cues:
                global_ass = workdir / "global_subs.ass"
                _write_ass(global_cues, global_ass)
                final_video_subs = workdir / "final_video_subs.mp4"

                _run(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        "final_video.mp4",
                        "-vf",
                        # Use explicit key form for compatibility with newer ffmpeg parsers.
                        f"subtitles=filename={global_ass.name}",
                        "-c:a",
                        "copy",
                        "-movflags",
                        "+faststart",
                        "final_video_subs.mp4",
                    ],
                    cwd=str(workdir),
                )
                subs_key = f"{user_id}/{paper_id}/runs/{run_id}/ffmpeg_stitch/final_video_subs.mp4"
                output_path_subs = storage.upload_file(
                    str(final_video_subs), subs_key, content_type="video/mp4"
                )
                log.info(
                    "run_id=%s: with-subs video uploaded to %s", run_id, output_path_subs
                )

        wh.send_webhook(
            {
                "run_id": run_id,
                "step_id": step_id,
                "step_name": "ffmpeg_stitch",
                "status": "completed",
                "gcs_output_path": output_path,
                "gcs_output_path_with_subs": output_path_subs,
                "error_message": "",
                "next_step": "",
                "next_job_data": {},
            }
        )
        rdb.xack(STREAM, GROUP, msg_id)
        log.info("run_id=%s: frame-based video complete", run_id)
    except Exception as exc:
        log.exception("run_id=%s: frame-based video failed", run_id)
        try:
            wh.send_webhook(
                {
                    "run_id": run_id,
                    "step_id": step_id,
                    "step_name": "ffmpeg_stitch",
                    "status": "failed",
                    "gcs_output_path": "",
                    "error_message": str(exc),
                    "next_step": "",
                    "next_job_data": {},
                }
            )
        except Exception:
            pass



#
REEL_WIDTH = 480
REEL_HEIGHT = 850
REEL_BG_DURATION = 120  # seconds; longer than any reasonable reel; trimmed to audio
REEL_TITLE_TEXT_RGB = (245, 245, 250)
ReelPalette = dict  # {"top": (r,g,b), "bottom": (r,g,b), "glow": (r,g,b)}
REEL_PALETTES: list[dict] = [
    # 0 — indigo → plum (the original): luminous violet glow.
    {"top": (28, 27, 51),  "bottom": (88, 28, 92),  "glow": (120, 90, 200)},
    # 1 — midnight → teal: cool, technical; cyan glow.
    {"top": (15, 32, 48),  "bottom": (16, 70, 78),  "glow": (70, 180, 200)},
    # 2 — deep navy → royal blue: classic, trustworthy; sky glow.
    {"top": (18, 24, 56),  "bottom": (30, 52, 120), "glow": (90, 130, 230)},
    # 3 — charcoal → crimson: bold, energetic; warm amber glow.
    {"top": (34, 22, 28),  "bottom": (96, 26, 44),  "glow": (220, 110, 90)},
    # 4 — forest → emerald: calm, organic; mint glow.
    {"top": (16, 36, 30),  "bottom": (22, 78, 58),  "glow": (90, 200, 150)},
]


def _pick_reel_palette(seed: str) -> dict:
    """Deterministically choose a background palette from a stable seed.

    Keyed on run_id so a given reel always renders the same colours (stable
    across re-renders / retries) while different reels vary. Uses a hash rather
    than a counter so it needs no shared state. Swap this for a domain→palette
    lookup later without touching the renderer.
    """
    import hashlib

    digest = hashlib.sha1((seed or "").encode("utf-8")).hexdigest()
    return REEL_PALETTES[int(digest, 16) % len(REEL_PALETTES)]



REEL_LOOP_PERIOD = 8.0
REEL_BG_FPS = 25                    
REEL_GLOW_RADIUS = 360               # px radius of the soft blob (pre-blur)
REEL_GLOW_ORBIT_X = 90               # px horizontal orbit amplitude
REEL_GLOW_ORBIT_Y = 70               # px vertical orbit amplitude
REEL_GLOW_OPACITY = 0.38             # max blend strength of the glow
REEL_PARTICLE_COUNT = 26
REEL_PARTICLE_OPACITY = 0.16         # very faint
REEL_PARTICLE_DRIFT_PX = REEL_HEIGHT # one full upward scroll per loop period

REEL_VIGNETTE_ANGLE = "PI/5"         # mild darkening toward the corners
REEL_HUE_BREATH_DEG = 6              # ± degrees of slow hue rotation

_REEL_ACCENT_LOTTIE_PATH = _ASSETS_DIR / "reel_accent.json"
REEL_ACCENT_SIZE = 170               # px (square render of the lottie)
REEL_ACCENT_XY = "(W-w)/2:H*0.47-h/2" # h-centred; vertical centre at 47% of frame
REEL_ACCENT_OPACITY = 0.92           # nearly opaque so the icon reads clearly
REEL_ACCENT_FPS = 30                 # frames/sec to sample the lottie at

_REEL_SUBTITLE_WORDS_PER_CUE = 4     # short, calm lines — easy to read, no crowding
_REEL_ASS_STYLE_LINE = (
    "Style: Default,Helvetica Neue,28,&H00FFFFFF,&H000000FF,&H00000000,&HC8000000,"
    "1,0,0,0,100,100,0,0,4,0,0,2,46,46,230,1"
)
_REEL_ASS_HEADER = (
    "[Script Info]\n"
    "ScriptType: v4.00+\n"
    f"PlayResX: {REEL_WIDTH}\n"
    f"PlayResY: {REEL_HEIGHT}\n"
    "WrapStyle: 0\n"
    "ScaledBorderAndShadow: yes\n"
    "\n"
    "[V4+ Styles]\n"
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
    "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
    "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
    "Alignment, MarginL, MarginR, MarginV, Encoding\n"
    f"{_REEL_ASS_STYLE_LINE}\n"
    "\n"
    "[Events]\n"
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
    "Effect, Text\n"
)
# Padding spaces / blank lines for the translucent caption pill (libass has no
# real box-padding param), same trick as the slide captions.
_REEL_SUBTITLE_PAD_H = "   "       # 3 spaces
_REEL_SUBTITLE_PAD_V = "\\N"        # one blank line top & bottom


def _write_reel_ass(cues: list[tuple[float, float, str]], path: Path) -> None:
    """Write a reel-styled ASS subtitle file (vertical 480x850, centred pill)."""
    lines = [_REEL_ASS_HEADER]
    for start, end, text in cues:
        safe = text.replace("\r", " ").replace("\n", " ").strip()
        padded_lines = [
            f"{_REEL_SUBTITLE_PAD_H}{ln}{_REEL_SUBTITLE_PAD_H}"
            for ln in safe.split("\\N")
        ]
        padded = (
            _REEL_SUBTITLE_PAD_V
            + "\\N".join(padded_lines)
            + _REEL_SUBTITLE_PAD_V
        )
        lines.append(
            f"Dialogue: 0,{_format_ass_timestamp(start)},"
            f"{_format_ass_timestamp(end)},Default,,0,0,0,,{padded}\n"
        )
    path.write_text("".join(lines), encoding="utf-8")


def _wrap_title(title: str, max_chars: int = 22, max_lines: int = 8) -> list[str]:
    safe_title = (title or "Research Paper").strip()
    words = safe_title.split()
    lines, current = [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) > max_chars and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines[:max_lines]


def _draw_vertical_gradient(img, top_rgb: tuple[int, int, int], bottom_rgb: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(img)
    h = img.height
    tr, tg, tb = top_rgb
    br, bg_, bb = bottom_rgb
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(tr + (br - tr) * t)
        g = int(tg + (bg_ - tg) * t)
        b = int(tb + (bb - tb) * t)
        draw.line([(0, y), (img.width, y)], fill=(r, g, b))


def _render_glow_png(path: Path, scale: int, glow_rgb: tuple[int, int, int]) -> None:

    r = REEL_GLOW_RADIUS * scale
    side = r * 2
    blob = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    px = blob.load()
    gr, gg, gb = glow_rgb
    cx = cy = r
    for y in range(side):
        for x in range(side):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 / r
            if d >= 1.0:
                continue
            # Smooth quadratic falloff: bright core, soft edge.
            a = int(255 * (1.0 - d) ** 2)
            px[x, y] = (gr, gg, gb, a)
    blob.save(str(path), "PNG")


def _render_particle_tile_png(path: Path, scale: int) -> None:

    import random

    W = REEL_WIDTH * scale
    H = REEL_HEIGHT * 2 * scale
    tile = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(tile)
    rng = random.Random(20240602)  # fixed seed → reproducible particle field
    for _ in range(REEL_PARTICLE_COUNT * 2):  # *2 because the tile is 2x tall
        cx = rng.uniform(0, W)
        cy = rng.uniform(0, H)
        rad = rng.uniform(1.5, 4.0) * scale
        # Soft dot: a few concentric rings of decreasing alpha for a glow look.
        for ring in range(int(rad), 0, -1):
            a = int(200 * (ring / rad) ** 0.5 * (rng.uniform(0.5, 1.0)))
            draw.ellipse(
                [cx - ring, cy - ring, cx + ring, cy + ring],
                fill=(255, 255, 255, a),
            )
    tile.save(str(path), "PNG")


def _build_title_bg_video(
    title: str,
    out_path: Path,
    duration: int = REEL_BG_DURATION,
    seed: str = "",
) -> Path:

    if not _PIL_AVAILABLE:
        raise RuntimeError(
            "reel title rendering requires Pillow; pip install pillow (in services/ffmpeg-job venv)"
        )
    palette = _pick_reel_palette(seed)
    # Render at 2x for crisp text, then downscale once at encode time.
    scale = 2
    W, H = REEL_WIDTH * scale, REEL_HEIGHT * scale
    img = Image.new("RGB", (W, H))
    _draw_vertical_gradient(img, palette["top"], palette["bottom"])
    draw = ImageDraw.Draw(img)

    lines = _wrap_title(title)

    title_size = 36 * scale
    font = _load_font(title_size, bold=True)
    line_height = 50 * scale

    y_start = int(H * 0.13)

    shadow_off = 4 * scale       # heavier drop shadow (was 2) for punch
    bold_off = max(1, scale // 2)  # faux-bold double-draw offset
    for i, line in enumerate(lines):
        y = y_start + i * line_height
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (W - tw) // 2
        # 1) Heavy, slightly soft drop shadow (drawn twice, offset) for depth.
        draw.text((x + shadow_off, y + shadow_off), line, fill=(0, 0, 0), font=font)
        draw.text((x + shadow_off + 1, y + shadow_off + 1), line, fill=(0, 0, 0), font=font)
        # 2) The headline itself, double-drawn with a tiny offset → faux-bold
        #    weight so it stays punchy even on a regular fallback font.
        draw.text((x + bold_off, y), line, fill=REEL_TITLE_TEXT_RGB, font=font)
        draw.text((x, y), line, fill=REEL_TITLE_TEXT_RGB, font=font)

    base_png = out_path.with_suffix(".base.png")
    glow_png = out_path.with_suffix(".glow.png")
    particle_png = out_path.with_suffix(".particles.png")
    try:
        img.save(str(base_png), "PNG")
        _render_glow_png(glow_png, scale, palette["glow"])
        _render_particle_tile_png(particle_png, scale)
        _ffmpeg_animate_reel_bg(base_png, glow_png, particle_png, out_path)
    finally:
        base_png.unlink(missing_ok=True)
        glow_png.unlink(missing_ok=True)
        particle_png.unlink(missing_ok=True)
    return out_path


def _ffmpeg_animate_reel_bg(
    base_png: Path, glow_png: Path, particle_png: Path, out_path: Path
) -> None:

    T = REEL_LOOP_PERIOD
    W, H = REEL_WIDTH, REEL_HEIGHT

    # 2π·t/T appears everywhere; define once for readability in the expressions.
    wt = f"(2*PI*t/{T})"

 
    glow_w = REEL_GLOW_RADIUS * 2
    glow_cx = f"({W}/2 + {REEL_GLOW_ORBIT_X}*cos({wt}) - {glow_w}/2)"
    glow_cy = f"({H}/2 + {REEL_GLOW_ORBIT_Y}*sin({wt}) - {glow_w}/2)"


    part_y = f"-(mod(t\\,{T})/{T})*{H}"

    glow_aa = f"{REEL_GLOW_OPACITY}"
    part_aa = f"{REEL_PARTICLE_OPACITY}"
    # Hue rotation IS per-frame (hue=h supports `eval=frame`), giving the whole
    # frame a slow colour breath over the loop period.
    hue_expr = f"{REEL_HUE_BREATH_DEG}*sin({wt})"

    filter_complex = (
        # Base gradient+title → reel size.
        f"[0:v]scale={W}:{H}:flags=lanczos,format=rgba[base];"
        # Glow: scale to 2×radius, apply (static) overall opacity.
        f"[1:v]scale={glow_w}:{glow_w},format=rgba,"
        f"colorchannelmixer=aa={glow_aa}[glow];"
        # Particles: scale tile to frame width (keep 2× height), faint opacity.
        f"[2:v]scale={W}:{H*2},format=rgba,"
        f"colorchannelmixer=aa={part_aa}[parts];"
        # Orbit the glow over the base (a soft bright blob over the gradient reads
        # as moving light). overlay x/y DO support per-frame `eval=frame`.
        f"[base][glow]overlay=x='{glow_cx}':y='{glow_cy}':eval=frame[lit];"
        # Drift particles upward, wrapping seamlessly.
        f"[lit][parts]overlay=x=0:y='{part_y}':eval=frame[drift];"
        # Hue breathing + vignette focus, back to yuv420p for H.264. hue's `h`
        # expression is evaluated per-frame by default (it has no `eval` option).
        f"[drift]hue=h='{hue_expr}',"
        f"vignette=angle={REEL_VIGNETTE_ANGLE},format=yuv420p[outbg]"
    )

    _run([
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(base_png),
        "-loop", "1", "-i", str(glow_png),
        "-loop", "1", "-i", str(particle_png),
        "-filter_complex", filter_complex,
        "-map", "[outbg]",
        "-t", f"{T:.3f}",
        "-r", str(REEL_BG_FPS),
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        str(out_path),
    ])



_LOTTIE_WEB_CDN = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"


_LOTTIE_RENDER_HTML = """<!doctype html>
<html><head><meta charset="utf-8">
<style>html,body{{margin:0;padding:0;background:transparent}}
#c{{width:{size}px;height:{size}px}}</style>
<script src="{cdn}"></script></head>
<body><div id="c"></div>
<script>
let anim = null;
window.loadLottie = (data) => new Promise((resolve) => {{
  anim = lottie.loadAnimation({{
    container: document.getElementById('c'),
    renderer: 'svg', loop: false, autoplay: false, animationData: data,
  }});
  anim.addEventListener('DOMLoaded', () => resolve({{
    totalFrames: Math.round(anim.totalFrames),
    frameRate: anim.frameRate,
  }}));
}});
window.seekFrame = (f) => {{ anim.goToAndStop(f, true); }};
</script></body></html>"""


def _build_lottie_accent_video(lottie_path: Path, out_path: Path) -> Path | None:

    if not lottie_path.exists():
        log.info("reel accent: no lottie at %s, skipping decorative overlay", lottie_path)
        return None
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        log.warning(
            "reel accent: playwright not installed; skipping decorative overlay. "
            "Install with `pip install playwright && playwright install chromium`."
        )
        return None

    try:
        animation_data = json.loads(lottie_path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.warning("reel accent: could not parse lottie %s (%s); skipping", lottie_path, exc)
        return None

    frames_dir = out_path.parent / f"{out_path.stem}_frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    size = REEL_ACCENT_SIZE
    html = _LOTTIE_RENDER_HTML.format(size=size, cdn=_LOTTIE_WEB_CDN)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--no-sandbox"])
            # Transparent background so screenshots carry a real alpha channel.
            page = browser.new_page(
                viewport={"width": size, "height": size},
                device_scale_factor=2,  # crisp at the overlay size
            )
            page.emulate_media(color_scheme="dark")
            page.set_content(html, wait_until="networkidle")

            info = page.evaluate("(data) => window.loadLottie(data)", animation_data)
            total = int(info.get("totalFrames") or 0)
            src_fps = float(info.get("frameRate") or 30.0)
            if total <= 0:
                log.warning("reel accent: lottie reports no frames; skipping")
                browser.close()
                return None

            # Re-sample the lottie's own timeline at REEL_ACCENT_FPS so the
            # output clip plays at real time regardless of the source fps.
            duration_s = total / src_fps
            out_frames = max(1, int(round(duration_s * REEL_ACCENT_FPS)))
            locator = page.locator("#c")
            for i in range(out_frames):
                src_frame = (i / out_frames) * total
                page.evaluate("(f) => window.seekFrame(f)", src_frame)
                locator.screenshot(
                    path=str(frames_dir / f"f_{i:04d}.png"),
                    omit_background=True,  # keep transparency
                )
            browser.close()

        # PNG sequence → qtrle .mov (lossless, keeps alpha), played at our fps.
        _run([
            "ffmpeg", "-y",
            "-framerate", str(REEL_ACCENT_FPS),
            "-i", str(frames_dir / "f_%04d.png"),
            "-c:v", "qtrle",
            "-pix_fmt", "argb",
            str(out_path),
        ])
        log.info(
            "reel accent: rendered %d-frame lottie overlay (lottie-web) → %s",
            out_frames, out_path,
        )
        return out_path
    except Exception as exc:
        # Decorative-only: never let an accent failure break the reel.
        log.warning("reel accent: lottie render failed (%s); continuing without it", exc)
        return None


def _download_avatars(avatars: dict, dest_dir: Path) -> tuple[Path, Path]:

    person1_gcs = avatars.get("person1")
    person2_gcs = avatars.get("person2")
    if not person1_gcs or not person2_gcs:
        raise RuntimeError("reel manifest missing avatar gs:// paths")

    dest_dir.mkdir(parents=True, exist_ok=True)
    person1_local = dest_dir / "person1.png"
    person2_local = dest_dir / "person2.png"
    storage.download_to_file(person1_gcs, str(person1_local))
    storage.download_to_file(person2_gcs, str(person2_local))
    return person1_local, person2_local


def _render_reel_segment(
    title_bg_video: Path,
    avatar_path: Path,
    audio_path: Path,
    duration: float,
    overlay_position: str,
    out_path: Path,
    narration: str | None = None,
    accent_video: Path | None = None,
):

    avatar_size = 190  # px
    margin = 24
    if overlay_position == "left":
        overlay_xy = f"{margin}:H-h-{margin}"
    else:
        overlay_xy = f"W-w-{margin}:H-h-{margin}"

    # Avatar must be looped like slide frames. A single PNG decodes as ~1 frame; with
    # overlay=shortest=1 the composited video ends in a few ms while audio is still
    # playing — output -shortest then drops almost all audio (broken / unplayable MP4).
    #
    # No fade / motion: the avatar is placed flat and stays put (per the
    # "nothing should move" direction). format=rgba preserves its transparency.
    parts = [
        f"[1:v]scale={avatar_size}:{avatar_size},format=rgba[av]",
        f"[0:v][av]overlay={overlay_xy}:shortest=0[outv]",
    ]

    # Inputs after the fixed three (bg, avatar, audio). The optional Lottie
    # accent clip is appended as input #3 so its stream index is known.
    extra_inputs: list[str] = []
    last_label = "[outv]"
    if accent_video is not None and accent_video.exists():
        accent_idx = 3  # 0=bg, 1=avatar, 2=audio, 3=accent
        extra_inputs += ["-stream_loop", "-1", "-i", str(accent_video)]
        # Scale + apply overall opacity (colorchannelmixer aa) so the accent is
        # a subtle decoration, then overlay at the configured corner.
        parts.append(
            f"[{accent_idx}:v]scale={REEL_ACCENT_SIZE}:{REEL_ACCENT_SIZE},"
            f"format=rgba,colorchannelmixer=aa={REEL_ACCENT_OPACITY}[accent]"
        )
        parts.append(f"[outv][accent]overlay={REEL_ACCENT_XY}:shortest=0[outacc]")
        last_label = "[outacc]"

    # Per-turn captions: reuse the slide-mode cue splitter, reel-styled ASS.
    # We run ffmpeg from out_path's dir so the subtitles= arg is just a filename
    # (no path-escaping headaches), exactly like the frame-based mode does.
    cwd: str | None = None
    if (
        narration
        and narration.strip()
        and duration > 0
        and _ffmpeg_has_subtitles_filter()
    ):
        cues = _split_narration_into_cues(narration, duration, _REEL_SUBTITLE_WORDS_PER_CUE)
        if cues:
            ass_path = out_path.parent / f"{out_path.stem}.ass"
            _write_reel_ass(cues, ass_path)
            parts.append(f"{last_label}subtitles=filename={ass_path.name}[outsub]")
            last_label = "[outsub]"
            cwd = str(out_path.parent)

    filter_complex = ";".join(parts)

    _run(
        [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", str(title_bg_video),
            "-loop", "1",
            "-framerate", "30",
            "-i", str(avatar_path),
            "-i", str(audio_path),
            *extra_inputs,
            "-filter_complex", filter_complex,
            "-map", last_label,
            "-map", "2:a",
            "-t", f"{duration:.3f}",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            str(out_path),
        ],
        cwd=cwd,
    )


def _process_reel_video(rdb, msg_id: str, run_id: str, step_id: str, paper_id: str, user_id: str, data: dict):
    """Compose a 480x850 vertical reel: title bg + per-turn avatar overlays + per-turn audio."""
    manifest_path = data.get("audio_manifest_gcs_path") or data.get("manifest_gcs_path")
    if not manifest_path:
        raise RuntimeError("reel job missing audio_manifest_gcs_path")
    log.info("run_id=%s: reel mode, manifest=%s", run_id, manifest_path)

    try:
        manifest = storage.download_json(manifest_path)
        turns = manifest.get("turns", [])
        avatars = manifest.get("avatars") or {}
        title = manifest.get("title") or "Research Paper"
        if not turns:
            raise RuntimeError("reel manifest has no turns")
        if not avatars.get("person1") or not avatars.get("person2"):
            raise RuntimeError("reel manifest missing avatar selection")

        with tempfile.TemporaryDirectory() as tmpdir:
            workdir = Path(tmpdir)
            audio_dir = workdir / "audio"
            segments_dir = workdir / "segments"
            avatars_dir = workdir / "avatars"
            audio_dir.mkdir(parents=True, exist_ok=True)
            segments_dir.mkdir(parents=True, exist_ok=True)

            person1_path, person2_path = _download_avatars(avatars, avatars_dir)
            log.info("run_id=%s: avatars person1=%s person2=%s turns=%d",
                     run_id, avatars["person1"], avatars["person2"], len(turns))

            # Title background: PIL raster + ffmpeg (Homebrew ffmpeg often lacks drawtext/libfreetype).
            title_video = workdir / "title_bg.mp4"
            # Seed the palette pick on run_id so each reel gets a stable but
            # distinct background colour scheme (no Gemini/domain call yet).
            _build_title_bg_video(title, title_video, duration=REEL_BG_DURATION, seed=run_id)

            # Decorative Lottie accent (best-effort): rendered once, reused on
            # every turn. None if no asset / rlottie unavailable → reel renders
            # without it.
            accent_video = _build_lottie_accent_video(
                _REEL_ACCENT_LOTTIE_PATH, workdir / "accent.mov"
            )

            # Download per-turn WAVs and render per-turn segments
            segment_paths: list[Path] = []
            for idx, turn in enumerate(turns):
                audio_gcs = turn["audio_gcs_path"]
                speaker = turn.get("speaker", "Person1")
                local_audio = audio_dir / f"turn_{idx:02d}.wav"
                storage.download_to_file(audio_gcs, str(local_audio))
                duration = _probe_duration(str(local_audio))

                avatar_path = person1_path if speaker == "Person1" else person2_path
                overlay_position = "left" if speaker == "Person1" else "right"
                narration = turn.get("text") or ""

                segment_path = segments_dir / f"segment_{idx:02d}.mp4"
                _render_reel_segment(
                    title_video, avatar_path, local_audio, duration, overlay_position, segment_path,
                    narration=narration,
                    accent_video=accent_video,
                )
                segment_paths.append(segment_path)
                log.info("run_id=%s: rendered turn %d/%d speaker=%s (%.2fs)",
                         run_id, idx + 1, len(turns), speaker, duration)

            # Concat all turn segments — re-encode (different streams) for safety
            concat_file = workdir / "segments.txt"
            concat_file.write_text(
                "\n".join(f"file '{segment.as_posix()}'" for segment in segment_paths),
                encoding="utf-8",
            )
            final_video = workdir / "reel_output.mp4"
            _run([
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(concat_file),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-movflags", "+faststart",
                str(final_video),
            ])

            output_key = f"{user_id}/{paper_id}/runs/{run_id}/reel_video_gen/reel_output.mp4"
            output_path = storage.upload_file(str(final_video), output_key, content_type="video/mp4")
            log.info("run_id=%s: reel uploaded to %s", run_id, output_path)

        wh.send_webhook({
            "run_id": run_id, "step_id": step_id, "step_name": "reel_video_gen",
            "status": "completed", "gcs_output_path": output_path, "error_message": "",
            "next_step": "", "next_job_data": {},
        })
        rdb.xack(STREAM, GROUP, msg_id)
        log.info("run_id=%s: reel video complete", run_id)
    except Exception as exc:
        log.exception("run_id=%s: reel video failed", run_id)
        try:
            wh.send_webhook({
                "run_id": run_id, "step_id": step_id, "step_name": "reel_video_gen",
                "status": "failed", "gcs_output_path": "", "error_message": str(exc),
                "next_step": "", "next_job_data": {},
            })
        except Exception:
            pass


def main():
    global _rdb
    _rdb = redis_lib.from_url(os.environ["REDIS_URL"], decode_responses=True)

    try:
        _rdb.xgroup_create(STREAM, GROUP, id="$", mkstream=True)
    except redis_lib.exceptions.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise

    log.info("FFmpeg worker started, consumer=%s", CONSUMER)

    # ── Startup XAUTOCLAIM sweep: reclaim jobs from any previous crashed instance
    log.info("[startup] XAUTOCLAIM sweep for orphaned messages")
    try:
        next_id = "0-0"
        while True:
            next_id, claimed, _ = _rdb.xautoclaim(
                STREAM, GROUP, CONSUMER,
                min_idle_time=300000,  # 5 minutes in ms
                start_id=next_id,
                count=10,
            )
            if not claimed:
                break
            log.info("[startup] reclaimed %d orphaned messages", len(claimed))
            for msg_id, data in claimed:
                global _current_msg_id
                _current_msg_id = msg_id
                process_job(_rdb, msg_id, data)
                _current_msg_id = None
            if next_id == "0-0":
                break
    except Exception as exc:
        log.warning("[startup] XAUTOCLAIM sweep error: %s", exc)

    while True:
        try:
            messages = _rdb.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=1, block=5000)
            if not messages:
                continue
            _, stream_messages = messages[0]
            for msg_id, data in stream_messages:
                _current_msg_id = msg_id
                process_job(_rdb, msg_id, data)
                _current_msg_id = None
        except redis_lib.exceptions.ConnectionError:
            log.error("Redis connection lost, retrying in 5s")
            import time
            time.sleep(5)
        except Exception:
            log.exception("FFmpeg worker loop error")
            import time
            time.sleep(2)


if __name__ == "__main__":
    main()
