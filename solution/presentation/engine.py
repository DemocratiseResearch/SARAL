"""Presentation generation engine for SARAL AI.

Produces production-quality Beamer research presentations featuring:
- Content-driven slide archetypes (Problem, Question, Methodology, Results, Comparison, Limitations, Conclusion).
- Professional typography, high-contrast palette, and card-based visual rhythm.
- LaTeX math preservation ($...$, equations).
- Multilingual Indic script font support and Unicode run wrapping.
- Clean 16:9 widescreen layout with consistent footline and navigation.
- Full backwards compatibility with all SARAL theme keys and aliases.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional

from ..shared.latex_utils import (
    escape_latex,
    font_commands,
    normalise_bullets,
    wrap_script_runs,
)
from ..shared.tokens import THEME_PALETTES, resolve_palette
from .archetypes import SlideArchetype, classify_slide

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Base Beamer Themes Configurations
# ---------------------------------------------------------------------------

BEAMER_THEMES: Dict[str, List[str]] = {
    "saral": [
        r"\IfFileExists{beamerthemeSimpleDarkBlue.sty}{\usetheme{SimpleDarkBlue}}{",
        r"  \usetheme{Madrid}",
        r"  \usecolortheme{seahorse}",
        r"}",
        r"\setbeamercolor{frametitle}{bg=saralprimary,fg=white}",
        r"\setbeamercolor{title}{fg=white,bg=saralprimary}",
        r"\setbeamercolor{palette primary}{bg=saralprimary,fg=white}",
        r"\setbeamercolor{palette secondary}{bg=saralsecondary,fg=white}",
        r"\setbeamercolor{palette tertiary}{bg=saralprimary!70,fg=white}",
    ],
    "metropolis": [
        r"\usetheme{metropolis}",
        r"\metroset{progressbar=frametitle, numbering=fraction, block=fill, sectionpage=none}",
        r"\setbeamercolor{frametitle}{bg=saralprimary,fg=white}",
    ],
    "berkeley": [
        r"\usetheme{Berkeley}",
        r"\usecolortheme{seahorse}",
        r"\setbeamercolor{frametitle}{bg=saralprimary,fg=white}",
        r"\setbeamercolor{sidebar}{bg=saralsurface,fg=saraltext}",
    ],
    "cambridgeus": [
        r"\usetheme{CambridgeUS}",
        r"\setbeamercolor{frametitle}{bg=saralprimary,fg=white}",
        r"\setbeamercolor{title}{bg=saralprimary,fg=white}",
        r"\setbeamercolor{palette primary}{bg=saralprimary,fg=white}",
    ],
    "paloalto": [
        r"\usetheme{PaloAlto}",
        r"\setbeamercolor{frametitle}{bg=saralprimary,fg=white}",
        r"\setbeamercolor{sidebar}{bg=saralprimary,fg=white}",
    ],
}


def _resolve_theme_key(theme: Optional[str]) -> str:
    """Normalize and resolve theme name to one of the 5 canonical Beamer themes."""
    if not theme or theme.strip().lower() in ("template-saral", "saral", "default", "classic_navy"):
        return "saral"
    key = theme.strip().lower()
    if key in BEAMER_THEMES:
        return key
    from ..shared.tokens import THEME_ALIASES
    canonical = THEME_ALIASES.get(key, "saral")
    return canonical if canonical in BEAMER_THEMES else "saral"


# ---------------------------------------------------------------------------
# Slide Rendering Helpers by Archetype
# ---------------------------------------------------------------------------

def _render_title_slide(
    title: str,
    authors: str,
    date: str,
    font_wrapper: str,
    font_script: str,
) -> List[str]:
    """Generate high-contrast academic defense title slide."""
    lines = [
        r"\begin{frame}[plain]",
        r"\begin{tikzpicture}[remember picture,overlay]",
        r"  \fill[saralprimary] (current page.south west) rectangle (current page.north east);",
        r"  \fill[saralsecondary] (current page.north west) rectangle ([yshift=-1.2cm]current page.north east);",
        r"  \fill[saralaccent] ([yshift=-1.2cm]current page.north west) rectangle ([yshift=-1.28cm]current page.north east);",
        r"\end{tikzpicture}",
        r"\vspace{1.2cm}",
        r"\begin{center}",
        r"  {\color{saralaccent}\footnotesize\bfseries\scshape RESEARCH DEFENSE \& PRESENTATION}\\[0.6ex]",
        r"  {\color{white}\LARGE\bfseries " + title + r"}\\[1.5ex]",
        r"  \rule{0.4\textwidth}{0.8pt}\\[1.5ex]",
    ]

    if authors:
        lines.append(r"  {\color{white!90}\large " + authors + r"}\\[0.8ex]")
    if date:
        lines.append(r"  {\color{white!70}\footnotesize " + date + r"}\\[1.2ex]")

    lines += [
        r"  \vfill",
        r"  {\color{saralaccent}\scriptsize Generated using SARAL AI $\cdot$ Democratising Research}",
        r"\end{center}",
        r"\end{frame}",
    ]
    return lines


def _render_problem_slide(
    title: str,
    bullets: List[str],
    image_block: str,
) -> List[str]:
    """Render Problem & Motivation slide with context card and highlighted challenge card."""
    lines = []
    if image_block:
        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.54\textwidth}")
    
    if len(bullets) >= 2:
        context_bullets = bullets[:-1]
        challenge_bullet = bullets[-1]

        lines.append(r"\begin{saralcard}{Context \& Background}")
        lines.append(r"\begin{itemize}")
        for b in context_bullets:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralcard}")

        lines.append(r"\vspace{0.2em}")
        lines.append(r"\begin{saralalertcard}{Core Challenge / Research Problem}")
        lines.append(r"  " + challenge_bullet)
        lines.append(r"\end{saralalertcard}")
    else:
        lines.append(r"\begin{saralalertcard}{Core Problem Statement}")
        for b in bullets:
            lines.append(r"  " + b + r"\par\vskip3pt")
        lines.append(r"\end{saralalertcard}")

    if image_block:
        lines.append(r"\end{column}")
        lines.append(image_block)
        lines.append(r"\end{columns}")

    return lines


def _render_question_slide(
    title: str,
    bullets: List[str],
    image_block: str,
) -> List[str]:
    """Render Research Question / Hypothesis slide with large center-stage card."""
    lines = []
    if image_block:
        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.54\textwidth}")

    core_q = bullets[0] if bullets else title
    supporting = bullets[1:] if len(bullets) > 1 else []

    lines.append(r"\begin{saralaccentcard}{Central Research Question / Hypothesis}")
    lines.append(r"  \centering\large\bfseries\color{saralprimary} ``" + core_q + r"''\par")
    lines.append(r"\end{saralaccentcard}")

    if supporting:
        lines.append(r"\vspace{0.3em}")
        lines.append(r"\begin{saralcard}{Key Objectives \& Hypotheses}")
        lines.append(r"\begin{itemize}")
        for b in supporting:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralcard}")

    if image_block:
        lines.append(r"\end{column}")
        lines.append(image_block)
        lines.append(r"\end{columns}")

    return lines


def _render_methodology_slide(
    title: str,
    bullets: List[str],
    image_block: str,
) -> List[str]:
    """Render Methodology / Pipeline slide with stepped process cards."""
    lines = []
    if image_block:
        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.54\textwidth}")

    if 2 <= len(bullets) <= 3 and not image_block:
        # Balanced 2 or 3-step sequential cards across slide
        lines.append(r"\begin{columns}[T,onlytextwidth]")
        col_w = f"{0.96 / len(bullets):.2f}"
        for idx, bullet in enumerate(bullets):
            lines.append(r"\begin{column}{" + col_w + r"\textwidth}")
            step_num = f"{idx + 1:02d}"
            lines.append(r"\begin{saralstepbox}{" + step_num + r"}{Phase " + str(idx + 1) + r"}")
            lines.append(r"  " + bullet)
            lines.append(r"\end{saralstepbox}")
            lines.append(r"\end{column}")
        lines.append(r"\end{columns}")
    else:
        # Stepped cards with badges in vertical stack
        for idx, bullet in enumerate(bullets):
            step_num = f"{idx + 1:02d}"
            lines.append(r"\begin{saralcard}{Stage " + step_num + r"}")
            lines.append(r"  " + bullet)
            lines.append(r"\end{saralcard}")
            if idx < len(bullets) - 1:
                lines.append(r"\vspace{0.15em}")

    if image_block:
        lines.append(r"\end{column}")
        lines.append(image_block)
        lines.append(r"\end{columns}")

    return lines


def _render_results_slide(
    title: str,
    bullets: List[str],
    image_block: str,
) -> List[str]:
    """Render Results slide highlighting empirical evidence and figures."""
    lines = []
    if image_block:
        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.52\textwidth}")
        lines.append(r"\begin{saralcard}{Key Findings \& Metrics}")
        lines.append(r"\begin{itemize}")
        for b in bullets:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralcard}")
        lines.append(r"\end{column}")
        lines.append(image_block)
        lines.append(r"\end{columns}")
    else:
        if len(bullets) >= 2:
            top_result = bullets[0]
            rest_results = bullets[1:]
            lines.append(r"\begin{saralalertcard}{Primary Empirical Finding}")
            lines.append(r"  \large " + top_result)
            lines.append(r"\end{saralalertcard}")
            lines.append(r"\vspace{0.2em}")
            lines.append(r"\begin{saralcard}{Supporting Evidence \& Validation}")
            lines.append(r"\begin{itemize}")
            for b in rest_results:
                lines.append(r"  \item " + b)
            lines.append(r"\end{itemize}")
            lines.append(r"\end{saralcard}")
        else:
            lines.append(r"\begin{saralcard}{Experimental Results}")
            lines.append(r"\begin{itemize}")
            for b in bullets:
                lines.append(r"  \item " + b)
            lines.append(r"\end{itemize}")
            lines.append(r"\end{saralcard}")

    return lines


def _render_comparison_slide(
    title: str,
    bullets: List[str],
    image_block: str,
) -> List[str]:
    """Render Comparative Analysis slide in side-by-side contrasting cards."""
    lines = []
    if image_block:
        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.54\textwidth}")

    if len(bullets) >= 2 and not image_block:
        mid = len(bullets) // 2
        col1_bullets = bullets[:mid]
        col2_bullets = bullets[mid:]

        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.48\textwidth}")
        lines.append(r"\begin{saralcard}{Baseline / Prior Approaches}")
        lines.append(r"\begin{itemize}")
        for b in col1_bullets:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralcard}")
        lines.append(r"\end{column}")

        lines.append(r"\begin{column}{0.48\textwidth}")
        lines.append(r"\begin{saralaccentcard}{Proposed / Present Work}")
        lines.append(r"\begin{itemize}")
        for b in col2_bullets:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralaccentcard}")
        lines.append(r"\end{column}")
        lines.append(r"\end{columns}")
    else:
        lines.append(r"\begin{saralcard}{Comparative Evaluation}")
        lines.append(r"\begin{itemize}")
        for b in bullets:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralcard}")

    if image_block:
        lines.append(r"\end{column}")
        lines.append(image_block)
        lines.append(r"\end{columns}")

    return lines


def _render_limitations_slide(
    title: str,
    bullets: List[str],
    image_block: str,
) -> List[str]:
    """Render Limitations & Open Questions slide."""
    lines = []
    if image_block:
        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.54\textwidth}")

    if len(bullets) >= 2 and not image_block:
        mid = len(bullets) // 2
        lims = bullets[:mid]
        futures = bullets[mid:]

        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.48\textwidth}")
        lines.append(r"\begin{saralalertcard}{Scope \& Limitations}")
        lines.append(r"\begin{itemize}")
        for b in lims:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralalertcard}")
        lines.append(r"\end{column}")

        lines.append(r"\begin{column}{0.48\textwidth}")
        lines.append(r"\begin{saralcard}{Future Directions \& Open Questions}")
        lines.append(r"\begin{itemize}")
        for b in futures:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralcard}")
        lines.append(r"\end{column}")
        lines.append(r"\end{columns}")
    else:
        lines.append(r"\begin{saralalertcard}{Scope, Constraints \& Next Steps}")
        lines.append(r"\begin{itemize}")
        for b in bullets:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralalertcard}")

    if image_block:
        lines.append(r"\end{column}")
        lines.append(image_block)
        lines.append(r"\end{columns}")

    return lines


def _render_conclusion_slide(
    title: str,
    bullets: List[str],
    image_block: str,
) -> List[str]:
    """Render Conclusion & Takeaways slide."""
    lines = []
    if image_block:
        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.54\textwidth}")

    if bullets:
        verdict = bullets[0]
        points = bullets[1:]
        lines.append(r"\begin{saralaccentcard}{Central Verdict \& Contribution}")
        lines.append(r"  \large\bfseries " + verdict)
        lines.append(r"\end{saralaccentcard}")

        if points:
            lines.append(r"\vspace{0.2em}")
            lines.append(r"\begin{saralcard}{Summary of Contributions}")
            lines.append(r"\begin{itemize}")
            for b in points:
                lines.append(r"  \item " + b)
            lines.append(r"\end{itemize}")
            lines.append(r"\end{saralcard}")
    else:
        lines.append(r"\begin{saralcard}{Conclusion}")
        lines.append(r"  " + title)
        lines.append(r"\end{saralcard}")

    if image_block:
        lines.append(r"\end{column}")
        lines.append(image_block)
        lines.append(r"\end{columns}")

    return lines


def _render_general_slide(
    title: str,
    bullets: List[str],
    image_block: str,
) -> List[str]:
    """Render generic structured cards slide."""
    lines = []
    if image_block:
        lines.append(r"\begin{columns}[T,onlytextwidth]")
        lines.append(r"\begin{column}{0.54\textwidth}")
        lines.append(r"\begin{saralcard}{Overview}")
        lines.append(r"\begin{itemize}")
        for b in bullets or [title]:
            lines.append(r"  \item " + b)
        lines.append(r"\end{itemize}")
        lines.append(r"\end{saralcard}")
        lines.append(r"\end{column}")
        lines.append(image_block)
        lines.append(r"\end{columns}")
    else:
        if len(bullets) >= 4:
            mid = (len(bullets) + 1) // 2
            col1 = bullets[:mid]
            col2 = bullets[mid:]
            lines.append(r"\begin{columns}[T,onlytextwidth]")
            lines.append(r"\begin{column}{0.48\textwidth}")
            lines.append(r"\begin{saralcard}{Key Insights (Part I)}")
            lines.append(r"\begin{itemize}")
            for b in col1:
                lines.append(r"  \item " + b)
            lines.append(r"\end{itemize}")
            lines.append(r"\end{saralcard}")
            lines.append(r"\end{column}")

            lines.append(r"\begin{column}{0.48\textwidth}")
            lines.append(r"\begin{saralcard}{Key Insights (Part II)}")
            lines.append(r"\begin{itemize}")
            for b in col2:
                lines.append(r"  \item " + b)
            lines.append(r"\end{itemize}")
            lines.append(r"\end{saralcard}")
            lines.append(r"\end{column}")
            lines.append(r"\end{columns}")
        else:
            lines.append(r"\begin{saralcard}{" + title + r"}")
            lines.append(r"\begin{itemize}")
            for b in bullets or [title]:
                lines.append(r"  \item " + b)
            lines.append(r"\end{itemize}")
            lines.append(r"\end{saralcard}")

    return lines


# ---------------------------------------------------------------------------
# Master Document Builder
# ---------------------------------------------------------------------------

def build_beamer_document(
    script: dict,
    image_assignments: dict[str, str],
    theme: Optional[str] = None,
) -> str:
    """Build a complete, compilable XeLaTeX Beamer presentation document.

    Parameters
    ----------
    script : dict
        Presentation structure containing title, authors, date, language, sections.
    image_assignments : dict[str, str]
        Mapping of section IDs to local image paths.
    theme : str, optional
        Theme key (e.g. 'saral', 'metropolis', 'berkeley', 'cambridgeus', 'paloalto').
    """
    theme_key = _resolve_theme_key(theme or script.get("ppt_template"))
    palette = resolve_palette(theme_key)

    lang = script.get("language") or "en-IN"
    font_decl, font_wrapper, font_script = font_commands(lang)

    # Clean & escape paper metadata while preserving math
    raw_title = script.get("title") or "Research Paper Presentation"
    title_text = escape_latex(raw_title, preserve_math=True)
    if font_wrapper:
        title_text = wrap_script_runs(title_text, font_wrapper, font_script)

    raw_authors = script.get("authors") or ""
    author_text = escape_latex(raw_authors, preserve_math=True)
    if font_wrapper and author_text:
        author_text = wrap_script_runs(author_text, font_wrapper, font_script)

    raw_date = script.get("date") or ""
    date_text = escape_latex(raw_date, preserve_math=True)
    if font_wrapper and date_text:
        date_text = wrap_script_runs(date_text, font_wrapper, font_script)

    # 1. Title Slide
    slides: List[str] = _render_title_slide(
        title_text,
        author_text,
        date_text,
        font_wrapper,
        font_script,
    )

    sections = script.get("sections", [])
    total_sections = len(sections)

    # 2. Content Slides
    for idx, section in enumerate(sections):
        sec_id = section.get("id") or str(idx)
        raw_sec_title = section.get("title") or f"Section {idx + 1}"
        sec_title = escape_latex(raw_sec_title, preserve_math=True)
        if font_wrapper:
            sec_title = wrap_script_runs(sec_title, font_wrapper, font_script)

        raw_bullets = section.get("bullets") or []
        bullets = normalise_bullets(raw_bullets, preserve_math=True)
        if font_wrapper:
            bullets = [wrap_script_runs(b, font_wrapper, font_script) for b in bullets]

        raw_summary = (section.get("summary") or "").strip()

        # Check assigned figure
        image_local = image_assignments.get(sec_id, "")
        image_block = ""
        has_image = bool(image_local)
        if has_image:
            rel_path = Path(image_local).as_posix()
            image_block = (
                r"\begin{column}{0.44\textwidth}" "\n"
                r"\centering" "\n"
                r"\begin{saralframebox}" "\n"
                rf"  \includegraphics[width=\linewidth,height=0.62\textheight,keepaspectratio]{{{rel_path}}}" "\n"
                r"\end{saralframebox}" "\n"
                r"\end{column}"
            )

        # Classify slide into content-driven archetype
        archetype = classify_slide(
            title=raw_sec_title,
            bullets=raw_bullets,
            has_image=has_image,
            section_index=idx,
            total_sections=total_sections,
        )

        # Breadcrumb / Section Header
        if len(raw_sec_title) <= 22:
            short_title = sec_title
        else:
            short_plain = escape_latex(raw_sec_title[:20].rstrip(), preserve_math=True) + r"\ldots{}"
            short_title = wrap_script_runs(short_plain, font_wrapper, font_script) if font_wrapper else short_plain

        # Check if slide contains code or verbatim to avoid XeLaTeX compilation failure
        has_code = any(
            any(kw in b for kw in (r"\verb", r"\begin{verbatim}", r"\begin{lstlisting}"))
            for b in raw_bullets
        )
        frame_opts = "[t,fragile]" if has_code else "[t]"
        slides.append(r"\section[" + short_title + "]{" + sec_title + "}")
        slides.append(r"\begin{frame}" + frame_opts + "{" + sec_title + "}")

        # Render layout according to archetype
        if archetype == SlideArchetype.PROBLEM:
            slides.extend(_render_problem_slide(sec_title, bullets, image_block))
        elif archetype == SlideArchetype.QUESTION:
            slides.extend(_render_question_slide(sec_title, bullets, image_block))
        elif archetype == SlideArchetype.METHODOLOGY:
            slides.extend(_render_methodology_slide(sec_title, bullets, image_block))
        elif archetype == SlideArchetype.RESULTS:
            slides.extend(_render_results_slide(sec_title, bullets, image_block))
        elif archetype == SlideArchetype.COMPARISON:
            slides.extend(_render_comparison_slide(sec_title, bullets, image_block))
        elif archetype == SlideArchetype.LIMITATIONS:
            slides.extend(_render_limitations_slide(sec_title, bullets, image_block))
        elif archetype == SlideArchetype.CONCLUSION:
            slides.extend(_render_conclusion_slide(sec_title, bullets, image_block))
        else:
            slides.extend(_render_general_slide(sec_title, bullets, image_block))

        # Speaker notes
        if raw_summary:
            note_text = escape_latex(raw_summary, preserve_math=True)
            if font_wrapper:
                note_text = wrap_script_runs(note_text, font_wrapper, font_script)
            slides.append(r"\note{" + note_text + r"}")

        slides.append(r"\end{frame}")

    # Safe footline title: truncate raw title BEFORE escaping and font wrapping
    # to avoid cutting through math delimiters ($...$) or font wrappers ({\...font ...})
    if len(raw_title) <= 35:
        footline_title = title_text
    else:
        footline_plain = escape_latex(raw_title[:32].rstrip(), preserve_math=True) + r"\ldots{}"
        footline_title = wrap_script_runs(footline_plain, font_wrapper, font_script) if font_wrapper else footline_plain

    # Build Preamble with Design Tokens and Robust Fallbacks
    preamble = [
        r"\documentclass[aspectratio=169,10pt]{beamer}",
        r"\usepackage{fontspec}",
        r"\usepackage{graphicx}",
        r"\usepackage{booktabs}",
        r"\usepackage{ragged2e}",
        r"\usepackage{hyperref}",
        r"\usepackage{pgfpages}",
        r"\usepackage{tikz}",
        r"\usetikzlibrary{calc,shapes.geometric}",
        # Colors from design tokens
        rf"\definecolor{{saralprimary}}{{RGB}}{{{palette.primary_rgb}}}",
        rf"\definecolor{{saralsecondary}}{{RGB}}{{{palette.secondary_rgb}}}",
        rf"\definecolor{{saralaccent}}{{RGB}}{{{palette.accent_rgb}}}",
        rf"\definecolor{{saralcanvas}}{{RGB}}{{{palette.bg_canvas_rgb}}}",
        rf"\definecolor{{saralsurface}}{{RGB}}{{{palette.surface_rgb}}}",
        rf"\definecolor{{saralsurfacealt}}{{RGB}}{{{palette.surface_alt_rgb}}}",
        rf"\definecolor{{saralborder}}{{RGB}}{{{palette.border_rgb}}}",
        rf"\definecolor{{saraltext}}{{RGB}}{{{palette.text_primary_rgb}}}",
        rf"\definecolor{{saraltextmuted}}{{RGB}}{{{palette.text_muted_rgb}}}",
        rf"\definecolor{{saralalertprimary}}{{RGB}}{{{palette.alert_primary_rgb}}}",
        rf"\definecolor{{saralalertsurface}}{{RGB}}{{{palette.alert_surface_rgb}}}",
        # Custom card environments with tcolorbox or native beamercolorbox fallback
        r"\IfFileExists{tcolorbox.sty}{",
        r"  \usepackage{tcolorbox}",
        r"  \newtcolorbox{saralcard}[1]{colback=saralsurface,colframe=saralborder,coltitle=saralprimary,fonttitle=\bfseries\footnotesize,title={#1},boxrule=0.8pt,arc=3pt,left=6pt,right=6pt,top=4pt,bottom=4pt,boxsep=1pt}",
        r"  \newtcolorbox{saralalertcard}[1]{colback=saralalertsurface,colframe=saralalertprimary,coltitle=saralalertprimary,fonttitle=\bfseries\footnotesize,title={#1},boxrule=1.0pt,arc=3pt,left=6pt,right=6pt,top=4pt,bottom=4pt,boxsep=1pt}",
        r"  \newtcolorbox{saralaccentcard}[1]{colback=saralsurfacealt,colframe=saralaccent,coltitle=saralprimary,fonttitle=\bfseries\footnotesize,title={#1},boxrule=0.9pt,arc=3pt,left=6pt,right=6pt,top=4pt,bottom=4pt,boxsep=1pt}",
        r"  \newtcolorbox{saralstepbox}[2]{colback=saralsurface,colframe=saralsecondary,coltitle=white,fonttitle=\bfseries\scriptsize,title={#1 $\cdot$ #2},boxrule=0.8pt,arc=3pt,left=5pt,right=5pt,top=4pt,bottom=4pt,boxsep=1pt}",
        r"  \newtcolorbox{saralframebox}{colback=white,colframe=saralborder,boxrule=0.6pt,arc=2pt,left=2pt,right=2pt,top=2pt,bottom=2pt,boxsep=0pt}",
        r"}{",
        r"  \newenvironment{saralcard}[1]{\begin{beamercolorbox}[rounded=true,shadow=false,sep=4pt,wd=\linewidth]{block body}\textbf{\color{saralprimary}#1}\par\vskip2pt}{\end{beamercolorbox}\vskip3pt}",
        r"  \newenvironment{saralalertcard}[1]{\begin{beamercolorbox}[rounded=true,shadow=false,sep=4pt,wd=\linewidth]{block body alerted}\textbf{\color{saralalertprimary}#1}\par\vskip2pt}{\end{beamercolorbox}\vskip3pt}",
        r"  \newenvironment{saralaccentcard}[1]{\begin{beamercolorbox}[rounded=true,shadow=false,sep=4pt,wd=\linewidth]{block body}\textbf{\color{saralaccent}#1}\par\vskip2pt}{\end{beamercolorbox}\vskip3pt}",
        r"  \newenvironment{saralstepbox}[2]{\begin{beamercolorbox}[rounded=true,shadow=false,sep=4pt,wd=\linewidth]{block title}\textbf{#1 $\cdot$ #2}\par\vskip2pt\normalfont}{\end{beamercolorbox}\vskip3pt}",
        r"  \newenvironment{saralframebox}{\begin{beamercolorbox}[rounded=false,shadow=false,sep=1pt,wd=\linewidth]{block body}}{\end{beamercolorbox}}",
        r"}",
        # Theme configuration
        *BEAMER_THEMES[theme_key],
        r"\setbeamertemplate{navigation symbols}{}",
        # Clean footline
        r"\setbeamertemplate{footline}{",
        r"  \leavevmode\hbox{",
        r"  \begin{beamercolorbox}[wd=.6\paperwidth,ht=2.5ex,dp=1.1ex,left]{palette primary}",
        r"    \hspace*{2ex}\scriptsize\color{white!80} SARAL AI $\cdot$ " + footline_title,
        r"  \end{beamercolorbox}",
        r"  \begin{beamercolorbox}[wd=.4\paperwidth,ht=2.5ex,dp=1.1ex,right]{palette primary}",
        r"    \scriptsize\color{white!80}\insertframenumber{} / \inserttotalframenumber\hspace*{2ex}",
        r"  \end{beamercolorbox}}",
        r"  \vskip0pt",
        r"}",
    ]

    if font_decl:
        preamble.append(font_decl)

    preamble += [
        r"\title{" + title_text + r"}",
        r"\subtitle{SARAL AI Academic Research Presentation}",
        r"\author{" + author_text + r"}",
        r"\date{" + date_text + r"}",
        r"\begin{document}",
    ]

    return "\n".join(preamble + slides + [r"\end{document}"])


# ---------------------------------------------------------------------------
# Compilation and Frame Conversion Helpers
# ---------------------------------------------------------------------------

def compile_latex(tex_file: str, output_dir: str) -> str:
    """Compile a TeX document to PDF with XeLaTeX."""
    tex_file = os.path.abspath(tex_file)
    tex_dir = os.path.dirname(tex_file)
    tex_filename = os.path.basename(tex_file)

    os.makedirs(output_dir, exist_ok=True)

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        shutil.copy2(tex_file, temp_path / tex_filename)

        for item in os.listdir(tex_dir):
            src_item = Path(tex_dir) / item
            dst_item = temp_path / item
            if src_item.resolve() == Path(tex_file).resolve():
                continue
            try:
                if src_item.is_file() and not dst_item.exists():
                    shutil.copy2(src_item, dst_item)
                elif src_item.is_dir() and not dst_item.exists():
                    shutil.copytree(src_item, dst_item)
            except Exception:
                continue

        for pass_num in range(2):
            proc = subprocess.run(
                ["xelatex", "-interaction=nonstopmode", f"-output-directory={temp_dir}", tex_filename],
                cwd=temp_dir,
                capture_output=True,
                text=True,
            )
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
    """Convert compiled PDF into PNG slide frames."""
    try:
        from pdf2image import convert_from_path
    except ImportError:
        log.warning("[engine] pdf2image not installed; slide frame conversion unavailable.")
        return []

    os.makedirs(output_dir, exist_ok=True)
    images_dir = Path(output_dir) / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    image_paths: list[str] = []
    for idx, image in enumerate(convert_from_path(pdf_file, dpi=dpi)):
        image_path = images_dir / f"slide_{idx:03d}.png"
        image.save(image_path, "PNG")
        image_paths.append(str(image_path))
    return image_paths
