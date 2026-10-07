"""LaTeX utility functions for safe character escaping, math preservation,
and multilingual Indic script font support.
"""

from __future__ import annotations

import functools
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
from typing import Tuple

log = logging.getLogger(__name__)

# Core characters requiring escaping in standard LaTeX text
LATEX_TEXT_SPECIALS = {
    "&": r"\&",
    "%": r"\%",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}

# Currency pattern: $ followed directly by digits and optional units/commas/decimals
# Requires trailing boundary (space, punctuation, end of string) to avoid corrupting math like $10^9$
CURRENCY_PATTERN = re.compile(r"(?<!\\)\$(\d+[\d,.]*(?:[kKmMbBtT]|%)?)(?=\s|[\.,;:!\?\)\}\]]|$)")

# Regex to detect math environments and inline math expressions
MATH_PATTERN = re.compile(
    r"("
    r"\\\[.*?\\\]|"
    r"\\\(.*?\\\)|\$\$.*?\$\$|"
    r"\\begin\{(?:equation|align|gather)\*?\}.*?\\end\{(?:equation|align|gather)\*?\}|"
    r"(?<!\\)\$(?:[^\$\n\\]|\\.)+(?<!\\)\$"
    r")",
    re.DOTALL,
)

# Dangerous LaTeX commands that must never execute
DANGEROUS_LATEX_COMMANDS = (
    r"\immediate",
    r"\write18",
    r"\openin",
    r"\openout",
    r"\input",
    r"\include",
    r"\catcode",
    r"\csname",
)


def _sanitize_untrusted_latex(text: str) -> str:
    """Disarm potentially dangerous LaTeX commands in untrusted input."""
    for cmd in DANGEROUS_LATEX_COMMANDS:
        if cmd in text:
            # Disarm command by breaking the macro name with empty braces
            safe_rep = cmd[:2] + "{}" + cmd[2:]
            text = text.replace(cmd, safe_rep)
    return text


def _escape_plain_text(text: str) -> str:
    """Escape LaTeX special characters in plain non-math text."""
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\\":
            # Check if followed by already-escaped character or a macro
            if i + 1 < n and text[i + 1] in "&%#_{}~^$":
                out.append(text[i : i + 2])
                i += 2
                continue
            elif i + 1 < n and text[i + 1].isalpha():
                # Allow recognized common formatting macros like \textbf, \textit, \ldots
                out.append(ch)
                i += 1
                continue
            else:
                out.append(r"\textbackslash{}")
                i += 1
                continue
        elif ch in LATEX_TEXT_SPECIALS:
            out.append(LATEX_TEXT_SPECIALS[ch])
            i += 1
        elif ch == "$":
            out.append(r"\$")
            i += 1
        else:
            out.append(ch)
            i += 1

    return "".join(out)


def escape_latex(text: str, preserve_math: bool = True) -> str:
    """Escapes LaTeX special characters in *text*, while optionally preserving math mode.

    Parameters
    ----------
    text : str
        Input string to escape.
    preserve_math : bool
        If True, inline math ($...$, \\(...\\)) and display equations
        are kept intact without destroying formulas or symbols.
    """
    if not text:
        return ""

    text = _sanitize_untrusted_latex(text)

    # Pre-process currency symbols ($100 -> \$100) so they don't pair into false math spans
    text = CURRENCY_PATTERN.sub(lambda m: r"\$" + m.group(1), text)

    if not preserve_math:
        return _escape_plain_text(text).replace("\n", "\n\n")

    parts = []
    last_idx = 0
    for match in MATH_PATTERN.finditer(text):
        start, end = match.span()
        # Non-math text before this math span
        if start > last_idx:
            plain_part = _escape_plain_text(text[last_idx:start])
            parts.append(plain_part.replace("\n", "\n\n"))
        # Keep math expression untouched without inserting blank lines that cause \par in math mode
        math_str = match.group(0)
        clean_math = re.sub(r"\n\s*\n+", "\n", math_str)
        parts.append(clean_math)
        last_idx = end

    if last_idx < len(text):
        plain_part = _escape_plain_text(text[last_idx:])
        parts.append(plain_part.replace("\n", "\n\n"))

    return "".join(parts)


def normalise_bullets(bullets: list[str], preserve_math: bool = True) -> list[str]:
    """Clean and escape bullet points for slide or poster rendering."""
    items = []
    for bullet in bullets:
        cleaned = re.sub(r"\s+", " ", bullet or "").strip()
        if cleaned:
            items.append(escape_latex(cleaned, preserve_math=preserve_math))
    return items


# ---------------------------------------------------------------------------
# Multilingual and Indic Script Font Mapping
# ---------------------------------------------------------------------------

LANGUAGE_FONT_MAP: dict[str, tuple[str, str, str]] = {
    # Core 10 Indic languages
    "hi-IN": ("devanagari", "Noto Serif Devanagari", "Devanagari"),
    "mr-IN": ("devanagari", "Noto Serif Devanagari", "Devanagari"),
    "bn-IN": ("bengali",    "Noto Serif Bengali",    "Bengali"),
    "ta-IN": ("tamil",      "Noto Serif Tamil",      "Tamil"),
    "te-IN": ("telugu",     "Noto Serif Telugu",     "Telugu"),
    "kn-IN": ("kannada",    "Noto Serif Kannada",    "Kannada"),
    "ml-IN": ("malayalam",  "Noto Serif Malayalam",  "Malayalam"),
    "gu-IN": ("gujarati",   "Noto Serif Gujarati",   "Gujarati"),
    "pa-IN": ("gurmukhi",   "Noto Serif Gurmukhi",   "Gurmukhi"),
    "od-IN": ("oriya",      "Noto Serif Oriya",      "Oriya"),
    # Extended Indic languages
    "as-IN":  ("assamese",     "Noto Serif Bengali",    "Bengali"),
    "brx-IN": ("bodo",         "Noto Serif Devanagari", "Devanagari"),
    "doi-IN": ("dogri",        "Noto Serif Devanagari", "Devanagari"),
    "kok-IN": ("konkani",      "Noto Serif Devanagari", "Devanagari"),
    "mai-IN": ("maithili",     "Noto Serif Devanagari", "Devanagari"),
    "mni-IN": ("meeteibengali", "Noto Serif Bengali",   "Bengali"),
    "ne-IN":  ("nepali",       "Noto Serif Devanagari", "Devanagari"),
    "sa-IN":  ("sanskrit",     "Noto Serif Devanagari", "Devanagari"),
    "sat-IN": ("olchiki",      "Noto Sans Ol Chiki",    "OlChiki"),
    "ur-IN":  ("urdu",         "Noto Nastaliq Urdu",    "Arabic"),
}

_fontspec_unsupported_scripts: frozenset[str] = frozenset({"MeeteiMayek", "OlChiki"})

SCRIPT_UNICODE_CLASS: dict[str, str] = {
    "Devanagari": r"\u0900-\u097F\uA8E0-\uA8FF",
    "Bengali":    r"\u0980-\u09FF",
    "Tamil":      r"\u0B80-\u0BFF",
    "Telugu":     r"\u0C00-\u0C7F",
    "Kannada":    r"\u0C80-\u0CFF",
    "Malayalam":  r"\u0D00-\u0D7F",
    "Gujarati":   r"\u0A80-\u0AFF",
    "Gurmukhi":   r"\u0A00-\u0A7F",
    "Oriya":      r"\u0B00-\u0B7F",
    "MeeteiMayek": r"\uABC0-\uABFF",
    "OlChiki":    r"\u1C50-\u1C7F",
    "Arabic":     r"\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF",
}


# System font directories across macOS and Linux
_SYSTEM_FONT_DIRS = (
    Path("/System/Library/Fonts"),
    Path("/System/Library/Fonts/Supplemental"),
    Path("/Library/Fonts"),
    Path("/usr/share/fonts"),
    Path("/usr/local/share/fonts"),
    Path.home() / "Library/Fonts",
    Path.home() / ".fonts",
    Path.home() / ".local/share/fonts",
)

# Fallback font candidates ordered by preference for each script
SCRIPT_FALLBACK_FONTS: dict[str, list[str]] = {
    "Devanagari": [
        "Noto Serif Devanagari",
        "Noto Sans Devanagari",
        "Devanagari MT",
        "Devanagari Sangam MN",
        "ITF Devanagari",
        "Lohit Devanagari",
    ],
    "Bengali": [
        "Noto Serif Bengali",
        "Noto Sans Bengali",
        "Bangla Sangam MN",
        "Bangla MN",
        "Kohinoor Bangla",
        "Lohit Bengali",
    ],
    "Tamil": [
        "Noto Serif Tamil",
        "Noto Sans Tamil",
        "Tamil Sangam MN",
        "Tamil MN",
        "Lohit Tamil",
    ],
    "Telugu": [
        "Noto Serif Telugu",
        "Noto Sans Telugu",
        "Telugu Sangam MN",
        "Telugu MN",
        "Kohinoor Telugu",
        "Lohit Telugu",
    ],
    "Kannada": [
        "Noto Serif Kannada",
        "Noto Sans Kannada",
        "Kannada Sangam MN",
        "Kannada MN",
        "Lohit Kannada",
    ],
    "Malayalam": [
        "Noto Serif Malayalam",
        "Noto Sans Malayalam",
        "Malayalam Sangam MN",
        "Malayalam MN",
        "Lohit Malayalam",
    ],
    "Gujarati": [
        "Noto Serif Gujarati",
        "Noto Sans Gujarati",
        "Gujarati Sangam MN",
        "Gujarati MT",
        "Kohinoor Gujarati",
        "Lohit Gujarati",
    ],
    "Gurmukhi": [
        "Noto Serif Gurmukhi",
        "Noto Sans Gurmukhi",
        "Gurmukhi Sangam MN",
        "Gurmukhi MN",
        "Gurmukhi",
        "Lohit Gurmukhi",
    ],
    "Oriya": [
        "Noto Serif Oriya",
        "Noto Sans Oriya",
        "Oriya Sangam MN",
        "Oriya MN",
        "Lohit Oriya",
    ],
    "Arabic": [
        "Noto Nastaliq Urdu",
        "Noto Nastaliq",
        "Geeza Pro",
        "Noto Sans Arabic",
        "Damascus",
        "Baghdad",
    ],
    "OlChiki": [
        "Noto Sans Ol Chiki",
        "Ol Chiki",
    ],
    "MeeteiMayek": [
        "Noto Sans Meetei Mayek",
    ],
}


@functools.lru_cache(maxsize=1)
def _get_installed_font_stems() -> set[str]:
    """Scan standard system font directories and return normalized file stems and names."""
    stems = set()
    for font_dir in _SYSTEM_FONT_DIRS:
        try:
            if font_dir.is_dir():
                for p in font_dir.rglob("*"):
                    if p.is_file() and p.suffix.lower() in {".ttf", ".ttc", ".otf", ".dfont"}:
                        stems.add(p.stem.lower().replace(" ", "").replace("-", ""))
                        stems.add(p.name.lower().replace(" ", "").replace("-", ""))
        except (PermissionError, OSError):
            continue
    return stems


@functools.lru_cache(maxsize=128)
def font_is_installed(font_name: str) -> bool:
    """Check if font family is available via fontconfig (fc-list) or local system font directories."""
    if not font_name:
        return False

    # 1. Check via fontconfig (fc-list) if utility is available
    fc_list_bin = shutil.which("fc-list")
    if fc_list_bin:
        try:
            proc = subprocess.run(
                [fc_list_bin, f":family={font_name}", "family"],
                capture_output=True, text=True, timeout=2,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                return True
        except (subprocess.TimeoutExpired, PermissionError, OSError):
            pass

    # 2. Check local font file collections (e.g. macOS /System/Library/Fonts, Linux /usr/share/fonts)
    normalized = font_name.lower().replace(" ", "").replace("-", "")
    stems = _get_installed_font_stems()
    if normalized in stems:
        return True
    for s in stems:
        if s.startswith(normalized):
            return True

    return False


def resolve_font(script: str, preferred_font: str = "") -> str:
    """Resolve a verified installed font for *script*, preferring *preferred_font*."""
    if preferred_font and font_is_installed(preferred_font):
        return preferred_font

    fallbacks = SCRIPT_FALLBACK_FONTS.get(script, [])
    for candidate in fallbacks:
        if candidate != preferred_font and font_is_installed(candidate):
            return candidate

    return ""


def font_commands(lang: str) -> Tuple[str, str, str]:
    """Return font declaration, macro wrapper, and script name for *lang*.

    Resolves the preferred font if installed, or falls back to an installed
    alternative for the language script. Returns empty strings if no font is available.
    """
    if lang in LANGUAGE_FONT_MAP:
        macro, configured_font, script = LANGUAGE_FONT_MAP[lang]
        resolved_font = resolve_font(script, configured_font)

        if not resolved_font:
            log.warning(
                "[latex_utils] No installed font found for lang=%s (script=%s, preferred=%r); font wrapping disabled.",
                lang, script, configured_font,
            )
            return "", "", ""

        if script in _fontspec_unsupported_scripts:
            decl = rf"\newfontfamily\{macro}font{{{resolved_font}}}"
        else:
            decl = rf"\newfontfamily\{macro}font[Script={script}]{{{resolved_font}}}"
        wrapper = rf"\{macro}font"
        return decl, wrapper, script
    return "", "", ""


def wrap_indic(text: str, wrapper: str) -> str:
    """Wrap entire text block in the language font wrapper macro."""
    if not wrapper or not text:
        return text
    return rf"{{{wrapper} {text}}}"


def wrap_script_runs(text: str, wrapper: str, script: str) -> str:
    """Wrap only the Indic Unicode runs inside *text* with *wrapper*."""
    if not wrapper or not text or not script:
        return text
    unicode_class = SCRIPT_UNICODE_CLASS.get(script)
    if not unicode_class:
        return wrap_indic(text, wrapper)
    pattern = re.compile(rf"([{unicode_class}]+)")
    return pattern.sub(lambda m: rf"{{{wrapper} {m.group(1)}}}", text)
