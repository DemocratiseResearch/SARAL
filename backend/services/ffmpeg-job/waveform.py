"""Waveform (podcast) render mode: styled background PNG + animated showwaves."""

import logging
import os
import subprocess
import tempfile

from saral_shared import storage_client as storage
from saral_shared import webhook_client as wh

from config import GROUP, STREAM
from ffmpeg_utils import _ASSETS_DIR
from imaging import Image, ImageDraw, _PIL_AVAILABLE, _load_font

log = logging.getLogger("ffmpeg-worker")

_CANVAS_W = 1280
_CANVAS_H = 720
_WAVE_H = 160  # height of the waveform strip at the bottom

_DEFAULT_MIC_PATH = str(_ASSETS_DIR / "mic.png")


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
        rdb.xack(STREAM, GROUP, msg_id)
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
