"""Poster document builder and rendering engine for SARAL AI.

Builds production-quality academic conference posters (120cm x 72cm) featuring:
- Multiple layout compositions (structured_grid, takeaway_led, workflow_led).
- Dynamic column balancing eliminating awkward whitespace when figures are absent.
- Preserved mathematical notation and scientific fidelity.
- Multilingual Indic script font support.
- Fully integrated with SARAL's poster worker and ZIP bundling pipeline.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

from ..shared.latex_utils import escape_latex, font_commands, wrap_script_runs
from .layouts import (
    generate_structured_grid_layout,
    generate_takeaway_led_layout,
    generate_workflow_led_layout,
)
from .themes import create_theme_files

log = logging.getLogger(__name__)

# Standard academic poster dimensions (Landscape 3:2 aspect ratio)
_WIDTH_CM = 120
_HEIGHT_CM = 72
_NUM_COLS = 3
_COL_WIDTH = (100.0 - (_NUM_COLS + 1) * 2.5) / _NUM_COLS / 100.0


def _generate_preamble(lang: str = "en-IN") -> str:
    """Generate LaTeX document preamble with font specifications and poster packages."""
    font_decl, _, _ = font_commands(lang)

    lines = [
        r"\documentclass[final]{beamer}",
        "",
        r"%%%% Poster Geometry & Packages %%%%",
        rf"\usepackage[size=custom,width={_WIDTH_CM},height={_HEIGHT_CM},scale=1.2]{{beamerposter}}",
        r"\usetheme{gemini}",
        r"\usecolortheme{gemini}",
        r"\usepackage{fontspec}",
        r"\usepackage{graphicx}",
        r"\usepackage{booktabs}",
        r"\usepackage{tikz}",
        r"\usepackage{pgfplots}",
        r"\pgfplotsset{compat=1.14}",
        r"\usepackage{anyfontsize}",
        r"\usepackage{ragged2e}",
        "",
        r"%%%% Column Grid Dimensions %%%%",
        r"\newlength{\sepwidth}",
        r"\newlength{\colwidth}",
        r"\setlength{\sepwidth}{0.025\paperwidth}",
        rf"\setlength{{\colwidth}}{{{_COL_WIDTH:.3f}\paperwidth}}",
        "",
        r"\newcommand{\separatorcolumn}{\begin{column}{\sepwidth}\end{column}}",
        "",
    ]

    if font_decl:
        lines.append(font_decl)
        lines.append("")

    return "\n".join(lines)


def _generate_title_block(
    title: str,
    authors: str,
    font_wrapper: str = "",
    font_script: str = "",
) -> str:
    """Generate conference title, author, and institutional affiliation block."""
    raw_title = title if title else "Research Poster"
    safe_title = escape_latex(raw_title, preserve_math=True)
    if font_wrapper and safe_title:
        safe_title = wrap_script_runs(safe_title, font_wrapper, font_script)

    raw_authors = authors if authors else "Author(s) $\\cdot$ Research Team"
    safe_authors = escape_latex(raw_authors, preserve_math=True)
    if font_wrapper and safe_authors:
        safe_authors = wrap_script_runs(safe_authors, font_wrapper, font_script)

    return (
        "%%%% Title & Authors %%%%\n"
        f"\\title{{{safe_title}}}\n"
        f"\\author{{{safe_authors}}}\n"
        "\\institute[]{Democratising Research $\\cdot$ SARAL AI}\n\n"
    )


def build_poster_document(
    poster_content: dict,
    image_local_paths: List[str],
    theme: Optional[str] = None,
    layout: Optional[str] = None,
) -> str:
    """Generate complete LaTeX document for a research poster.

    Parameters
    ----------
    poster_content : dict
        Structured poster content containing title, authors, abstract,
        introduction, methodology, results, conclusion, references.
    image_local_paths : list of str
        Paths to downloaded figures relative to workdir.
    theme : str, optional
        Color theme name ('classic_navy', 'teal_emerald', 'crimson_burgundy', etc.).
    layout : str, optional
        Layout archetype ('structured_grid', 'takeaway_led', 'workflow_led').
    """
    # Resolve language and fonts
    lang = poster_content.get("language") or "en-IN"
    _, font_wrapper, font_script = font_commands(lang)

    title = poster_content.get("title", "Research Poster")
    authors = poster_content.get("authors", "")

    # Resolve layout archetype
    selected_layout = (
        layout
        or poster_content.get("layout")
        or "structured_grid"
    ).strip().lower()

    doc = _generate_preamble(lang)
    doc += _generate_title_block(title, authors, font_wrapper, font_script)
    doc += "\\begin{document}\n"
    doc += "\\begin{frame}[t]\n"

    # Select layout generator
    if selected_layout in ("takeaway_led", "takeaway", "headline"):
        doc += generate_takeaway_led_layout(
            poster_content, image_local_paths, font_wrapper=font_wrapper, font_script=font_script
        )
    else:
        doc += "\\begin{columns}[t]\n"
        doc += "\\separatorcolumn\n\n"
        if selected_layout in ("workflow_led", "workflow", "systems", "pipeline"):
            doc += generate_workflow_led_layout(
                poster_content, image_local_paths, font_wrapper=font_wrapper, font_script=font_script
            )
        else:
            # Default: classical balanced 3-column academic conference grid
            doc += generate_structured_grid_layout(
                poster_content, image_local_paths, font_wrapper=font_wrapper, font_script=font_script
            )
        doc += "\\separatorcolumn\n"
        doc += "\\end{columns}\n"

    doc += "\\end{frame}\n"
    doc += "\\end{document}\n"

    return doc
