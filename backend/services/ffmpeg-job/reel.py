"""Reel render mode: 480x850 vertical video (animated gradient title background +
per-turn avatar overlays + optional Lottie accent + per-turn captions)."""

import json
import logging
import tempfile
from pathlib import Path

from saral_shared import storage_client as storage
from saral_shared import webhook_client as wh

from config import GROUP, STREAM
from ffmpeg_utils import (
    _ASSETS_DIR,
    _ffmpeg_has_subtitles_filter,
    _probe_duration,
    _run,
)
from imaging import Image, ImageDraw, _PIL_AVAILABLE, _load_font
from media_io import _download_avatars
from subtitles import _format_ass_timestamp, _split_narration_into_cues

log = logging.getLogger("ffmpeg-worker")

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
