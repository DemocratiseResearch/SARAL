from __future__ import annotations

import functools
import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from pdf2image import convert_from_path

log = logging.getLogger(__name__)


LATEX_SPECIALS = {
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
}


def escape_latex(text: str) -> str:
    escaped = "".join(LATEX_SPECIALS.get(ch, ch) for ch in text)
    escaped = escaped.replace("\n", "\n\n")
    return escaped


def normalise_bullets(bullets: list[str]) -> list[str]:
    items = []
    for bullet in bullets:
        bullet = re.sub(r"\s+", " ", bullet or "").strip()
        if bullet:
            items.append(escape_latex(bullet))
    return items


LANGUAGE_FONT_MAP: dict[str, tuple[str, str, str]] = {
    # Core 10 Indic languages (Sarvam mayura:v1 / Bhashini MT)
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
    # Extended 8 languages (Sarvam sarvam-translate:v1, Bhashini TTS)
    "as-IN":  ("assamese",  "Noto Serif Bengali",    "Bengali"),    # Assamese uses Bengali script
    "brx-IN": ("bodo",      "Noto Serif Devanagari", "Devanagari"),
    "doi-IN": ("dogri",     "Noto Serif Devanagari", "Devanagari"),
    "kok-IN": ("konkani",  "Noto Serif Devanagari", "Devanagari"),
    "mai-IN": ("maithili",  "Noto Serif Devanagari", "Devanagari"),
    "mni-IN": ("meeteibengali", "Noto Serif Bengali",   "Bengali"),
    "ne-IN":  ("nepali",    "Noto Serif Devanagari", "Devanagari"),
    "sa-IN":  ("sanskrit",  "Noto Serif Devanagari", "Devanagari"),
    "sat-IN": ("olchiki",   "Noto Sans Ol Chiki",    "OlChiki"),  # only Sans variant 
    "ur-IN":  ("urdu",      "Noto Nastaliq Urdu",    "Arabic"),
}



_fontspec_unsupported_scripts: frozenset[str] = frozenset({"MeeteiMayek", "OlChiki"})

SCRIPT_UNICODE_CLASS: dict[str, str] = {
    "Devanagari": r"\u0900-\u097F\uA8E0-\uA8FF",
    "Bengali": r"\u0980-\u09FF",
    "Tamil": r"\u0B80-\u0BFF",
    "Telugu": r"\u0C00-\u0C7F",
    "Kannada": r"\u0C80-\u0CFF",
    "Malayalam": r"\u0D00-\u0D7F",
    "Gujarati": r"\u0A80-\u0AFF",
    "Gurmukhi": r"\u0A00-\u0A7F",
    "Oriya": r"\u0B00-\u0B7F",
    "MeeteiMayek": r"\uABC0-\uABFF",
    "OlChiki": r"\u1C50-\u1C7F",
    "Arabic": r"\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF",
}


@functools.lru_cache(maxsize=64)
def _font_is_installed(font_name: str) -> bool:
    try:
        proc = subprocess.run(
            ["fc-list", f":family={font_name}", "family"],
            capture_output=True, text=True, timeout=3,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # fc-list missing → can't tell; assume yes and let xelatex try.
        return True
    return bool(proc.stdout.strip())


def _font_commands(lang: str) -> tuple[str, str, str]:

    if lang in LANGUAGE_FONT_MAP:
        macro, font, script = LANGUAGE_FONT_MAP[lang]
        if not _font_is_installed(font):
            log.warning(
                "[latex_template] font %r for lang=%s not installed; falling back to default font (script will not render correctly). Install %r in fontconfig to fix.",
                font, lang, font,
            )
            return "", "", ""

        if script in _fontspec_unsupported_scripts:
            decl = rf"\newfontfamily\{macro}font{{{font}}}"
        else:
            decl = rf"\newfontfamily\{macro}font[Script={script}]{{{font}}}"
        wrapper = rf"\{macro}font"
        return decl, wrapper, script
    return "", "", ""


def wrap_indic(text: str, wrapper: str) -> str:
    if not wrapper or not text:
        return text
    return rf"{{{wrapper} {text}}}"


def wrap_script_runs(text: str, wrapper: str, script: str) -> str:

    if not wrapper or not text or not script:
        return text
    unicode_class = SCRIPT_UNICODE_CLASS.get(script)
    if not unicode_class:
        return wrap_indic(text, wrapper)
    pattern = re.compile(rf"([{unicode_class}]+)")
    return pattern.sub(lambda m: rf"{{{wrapper} {m.group(1)}}}", text)



BEAMER_THEMES: dict[str, list[str]] = {
    "saral": [
        r"\IfFileExists{beamerthemeSimpleDarkBlue.sty}{\usetheme{SimpleDarkBlue}}{",
        r"  \usetheme{Madrid}",
        r"  \usecolortheme{seahorse}",
        r"}",
        r"\definecolor{sblue}{RGB}{0,84,166}",
        r"\setbeamercolor{frametitle}{bg=sblue,fg=white}",
        r"\setbeamercolor{title}{fg=white}",
        r"\setbeamercolor{palette primary}{bg=sblue,fg=white}",
        r"\setbeamercolor{palette secondary}{bg=sblue!80,fg=white}",
        r"\setbeamercolor{palette tertiary}{bg=sblue!60,fg=white}",
    ],
    "metropolis": [
        r"\usetheme{metropolis}",
        # sectionpage=none suppresses the auto-divider slide Metropolis would
        # otherwise insert before every \section{} (which we now emit so
        # Frankfurt's mini-TOC and Berkeley's sidebar populate).
        r"\metroset{progressbar=frametitle, numbering=fraction, block=fill, sectionpage=none}",
    ],
    "berkeley": [
        r"\usetheme{Berkeley}",
        r"\usecolortheme{seahorse}",
    ],
    # CambridgeUS: bold crimson title strip + footer. Unmistakable red branding.
    "cambridgeus": [
        r"\usetheme{CambridgeUS}",
    ],
    # PaloAlto: full-height deep navy left sidebar with section list. Strong color block.
    "paloalto": [
        r"\usetheme{PaloAlto}",
    ],
}


def _resolve_theme(theme: str | None) -> str:

    if not theme or theme.strip().lower() in ("template-saral", "saral", "default"):
        return "saral"
    key = theme.strip().lower()
    return key if key in BEAMER_THEMES else "saral"


def build_beamer_document(script: dict, image_assignments: dict[str, str], theme: str | None = None) -> str:

    theme_key = _resolve_theme(theme or script.get("ppt_template"))
    lang = script.get("language") or "en-IN"
    font_decl, font_wrapper, font_script = _font_commands(lang)

    # Real paper title from script metadata (populated by script-gen Gemini extraction)
    title_text = escape_latex(script.get("title") or "Research Paper Presentation")
    if font_wrapper:
        title_text = wrap_script_runs(title_text, font_wrapper, font_script)

    # Real authors and date
    author_text = escape_latex(script.get("authors") or "")
    date_text = escape_latex(script.get("date") or "")

    sections = script.get("sections", [])

    slides = [
        r"\begin{frame}",
        r"\titlepage",
        r"\end{frame}",
    ]

    for idx, section in enumerate(sections):
        sec_id = section.get("id") or str(idx)
        raw_title = section.get("title") or f"Section {idx + 1}"
        title = escape_latex(raw_title)
        if font_wrapper:
            title = wrap_script_runs(title, font_wrapper, font_script)

        raw_bullets_input = section.get("bullets") or []
        bullets = normalise_bullets(raw_bullets_input)
        if not raw_bullets_input:
            log.warning("section %r (idx=%d) has no bullets — slide will be empty", raw_title, idx)
        elif not bullets:
            log.warning(
                "section %r (idx=%d) bullets normalised to empty (raw count=%d)",
                raw_title, idx, len(raw_bullets_input),
            )
        if font_wrapper:
            bullets = [wrap_script_runs(b, font_wrapper, font_script) for b in bullets]

        # Summary goes to speaker notes only — not displayed on slide
        raw_summary = (section.get("summary") or "").strip()

        image_local = image_assignments.get(sec_id, "")
        image_block = ""
        if image_local:
            relative_path = Path(image_local).as_posix()
            image_block = (
                r"\begin{column}{0.40\textwidth}" "\n"
                r"\centering" "\n"
                rf"\includegraphics[width=\linewidth,height=0.55\textheight,keepaspectratio]{{{relative_path}}}" "\n"
                r"\end{column}"
            )

        col_width = "0.58" if image_block else "1.0"


        if len(raw_title) <= 22:
            short_title = title  # short enough → reuse the full wrapped title
        else:
            short_plain = escape_latex(raw_title[:20].rstrip()) + r"\ldots{}"
            short_title = (
                wrap_script_runs(short_plain, font_wrapper, font_script)
                if font_wrapper
                else short_plain
            )
        slides.append(r"\section[" + short_title + "]{" + title + "}")
        slides.append(r"\begin{frame}[t]{" + title + "}")
        slides.append(r"\begin{columns}[T,onlytextwidth]")
        slides.append(r"\begin{column}{" + col_width + r"\textwidth}")
        slides.append(r"\begin{itemize}")
        for bullet in bullets or [title]:
            slides.append(r"\item " + bullet)
        slides.append(r"\end{itemize}")
        slides.append(r"\end{column}")
        if image_block:
            slides.append(image_block)
        slides.append(r"\end{columns}")
        if raw_summary:
            note_text = escape_latex(raw_summary)
            if font_wrapper:
                note_text = wrap_script_runs(note_text, font_wrapper, font_script)
            slides.append(r"\note{" + note_text + r"}")
        slides.append(r"\end{frame}")

    preamble = [
        r"\documentclass[aspectratio=169]{beamer}",
        r"\usepackage{fontspec}",
        r"\usepackage{graphicx}",
        r"\usepackage{ragged2e}",
        r"\usepackage{hyperref}",
        r"\usepackage{pgfpages}",
        *BEAMER_THEMES[theme_key],
        r"\setbeamertemplate{navigation symbols}{}",
    ]
    if font_decl:
        preamble.append(font_decl)
    preamble += [
        r"\title{" + title_text + r"}",
        r"\subtitle{Generated using SARAL AI}",
        r"\author{" + author_text + r"}",
        r"\date{" + date_text + r"}",
        r"\begin{document}",
    ]

    return "\n".join(preamble + slides + [r"\end{document}"])


def compile_latex(tex_file: str, output_dir: str) -> str:
    tex_file = os.path.abspath(tex_file)
    tex_dir = os.path.dirname(tex_file)
    tex_filename = os.path.basename(tex_file)

    os.makedirs(output_dir, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        shutil.copy2(tex_file, temp_path / tex_filename)

        for item in os.listdir(tex_dir):
            source_item = Path(tex_dir) / item
            dest_item = temp_path / item
            if source_item.resolve() == Path(tex_file).resolve():
                continue
            try:
                if source_item.is_file() and not dest_item.exists():
                    shutil.copy2(source_item, dest_item)
                elif source_item.is_dir() and not dest_item.exists():
                    shutil.copytree(source_item, dest_item)
            except Exception:
                continue

        for pass_num in range(2):
            proc = subprocess.run(
                [
                    "xelatex",
                    "-interaction=nonstopmode",
                    f"-output-directory={temp_dir}",
                    tex_filename,
                ],
                cwd=temp_dir,
                capture_output=True,
                text=True,
            )
            # Log notable xelatex output to help diagnose font/rendering issues
            if proc.stdout:
                notable = [
                    line for line in proc.stdout.splitlines()
                    if any(kw in line for kw in (
                        "Error", "error", "Warning", "warning",
                        "not found", "Missing", "Font", "font",
                        "undefined",
                    ))
                ]
                if notable:
                    log.warning("xelatex pass %d notable output:\n%s", pass_num + 1, "\n".join(notable[-60:]))
                else:
                    log.info("xelatex pass %d: no errors/warnings detected", pass_num + 1)
                # Detect font-not-found even on exit 0 (xelatex renders blanks and exits 0)
                font_errors = [
                    line for line in proc.stdout.splitlines()
                    if "not found" in line and ("font" in line.lower() or "Font" in line)
                ]
                if font_errors:
                    log.error(
                        "xelatex pass %d: FONT NOT FOUND — slides will render blank! Errors:\n%s",
                        pass_num + 1, "\n".join(font_errors)
                    )
            if proc.stderr:
                log.warning("xelatex pass %d stderr: %s", pass_num + 1, proc.stderr[-2000:])
            if proc.returncode != 0:
                raise RuntimeError(f"xelatex failed (exit {proc.returncode}): {proc.stdout[-4000:]}")

        pdf_name = Path(tex_filename).with_suffix(".pdf").name
        pdf_path = temp_path / pdf_name
        if not pdf_path.exists() or pdf_path.stat().st_size == 0:
            raise RuntimeError("xelatex did not produce a valid PDF")

        output_pdf = Path(output_dir) / pdf_name
        shutil.copy2(pdf_path, output_pdf)
        return str(output_pdf)


def convert_pdf_to_images(pdf_file: str, output_dir: str, dpi: int = 220) -> list[str]:
    os.makedirs(output_dir, exist_ok=True)
    images_dir = Path(output_dir) / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    image_paths: list[str] = []
    for idx, image in enumerate(convert_from_path(pdf_file, dpi=dpi)):
        image_path = images_dir / f"slide_{idx:03d}.png"
        image.save(image_path, "PNG")
        image_paths.append(str(image_path))
    return image_paths
