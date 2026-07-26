"""Narration → time-distributed ASS subtitle cues, shared by the slide and reel
render modes (the reel adds its own styled ASS header/writer)."""

import re
import textwrap
from pathlib import Path

_SUBTITLE_WORDS_PER_CUE = 8  # words per subtitle cue for slide videos
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
