"""Poster composition layouts for SARAL AI.

Provides three distinct academic poster layouts:
1. structured_grid: Classical balanced 3-column academic conference poster.
2. takeaway_led: Focal takeaway / central claim hero banner leading into evidence.
3. workflow_led: Methodological architecture & systems pipeline emphasis.
"""

from __future__ import annotations

import logging
import math
from typing import Any, List, Optional, Tuple

from ..shared.latex_utils import escape_latex, wrap_script_runs

log = logging.getLogger(__name__)


def _block(
    title: str,
    content: str,
    is_alert: bool = False,
    font_wrapper: str = "",
    font_script: str = "",
) -> str:
    """Generate a standard or alerted text block."""
    block_type = "alertblock" if is_alert else "block"
    safe_title = escape_latex(title, preserve_math=True)
    if font_wrapper and safe_title:
        safe_title = wrap_script_runs(safe_title, font_wrapper, font_script)
    safe_content = escape_latex(content, preserve_math=True)
    if font_wrapper and safe_content:
        safe_content = wrap_script_runs(safe_content, font_wrapper, font_script)
    return (
        f"\\begin{{{block_type}}}{{{safe_title}}}\n"
        f"{safe_content}\n"
        f"\\end{{{block_type}}}\n\n"
    )


def _bullet_block(
    title: str,
    bullets: List[str],
    is_alert: bool = False,
    font_wrapper: str = "",
    font_script: str = "",
) -> str:
    """Generate a block containing itemized bullet points."""
    if not bullets:
        return ""
    block_type = "alertblock" if is_alert else "block"
    safe_title = escape_latex(title, preserve_math=True)
    if font_wrapper and safe_title:
        safe_title = wrap_script_runs(safe_title, font_wrapper, font_script)
    lines = [
        f"\\begin{{{block_type}}}{{{safe_title}}}",
        "\\begin{itemize}",
        "  \\setlength{\\itemsep}{0.6ex}",
        "  \\setlength{\\parsep}{0.2ex}",
    ]
    for bullet in bullets:
        safe_bullet = escape_latex(bullet, preserve_math=True)
        if font_wrapper and safe_bullet:
            safe_bullet = wrap_script_runs(safe_bullet, font_wrapper, font_script)
        lines.append(f"  \\item {safe_bullet}")
    lines += ["\\end{itemize}", f"\\end{{{block_type}}}", ""]
    return "\n".join(lines) + "\n"


def _figure_block(
    image_path: str,
    caption: str = "Key Figure",
    height_cm: float = 16.0,
    font_wrapper: str = "",
    font_script: str = "",
) -> str:
    """Generate a framed figure with caption."""
    safe_caption = escape_latex(caption, preserve_math=True)
    if font_wrapper and safe_caption:
        safe_caption = wrap_script_runs(safe_caption, font_wrapper, font_script)
    lines = [
        "\\begin{figure}",
        "\\centering",
        f"\\includegraphics[width=0.96\\textwidth,height={height_cm:.1f}cm,keepaspectratio]{{{image_path}}}",
        f"\\caption{{{safe_caption}}}",
        "\\end{figure}",
        "",
    ]
    return "\n".join(lines) + "\n"


def _references_block(
    refs: List[str],
    font_wrapper: str = "",
    font_script: str = "",
) -> str:
    """Generate a formatted academic references block."""
    if not refs:
        return ""
    lines = [
        "\\begin{block}{References}",
        "\\footnotesize",
        "\\begin{enumerate}",
        "  \\setlength{\\itemsep}{0.6ex}",
    ]
    for ref in refs:
        safe_ref = escape_latex(ref, preserve_math=True)
        if font_wrapper and safe_ref:
            safe_ref = wrap_script_runs(safe_ref, font_wrapper, font_script)
        lines.append(f"  \\item {safe_ref}")
    lines += ["\\end{enumerate}", "\\end{block}", ""]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Dynamic Content-Aware Height Estimation & Spacing Helpers
# ---------------------------------------------------------------------------

def _calculate_available_column_height(
    poster_content: dict,
    layout_type: str = "structured_grid",
    scale: float = 1.7,
    poster_height_cm: float = 72.0,
) -> float:
    """Calculate usable vertical height (in virtual cm) available for column content.

    Accounts for:
    - Slide virtual height (poster_height_cm / scale)
    - Headline: title line-wrapping, authors, institute, rules and vskips
    - Top spacing before columns (\\vspace{0.2cm})
    - Footer height: footline banner, rules and text padding
    - Takeaway hero banner (for takeaway_led layout)
    - Beamer frame overhead & safety margin to prevent bottom clipping
    """
    virtual_h = poster_height_cm / scale  # ~42.35 cm

    # Headline height estimation
    title = poster_content.get("title", "")
    authors = poster_content.get("authors", "")
    institute = poster_content.get("institute", "")

    # Title in \\VeryHuge on ~67cm usable width fits ~50 chars/line
    title_lines = max(1, math.ceil(len(title) / 50)) if title else 1
    headline_h = 1.6 + title_lines * 1.5
    if authors:
        auth_lines = max(1, math.ceil(len(authors) / 75))
        headline_h += auth_lines * 0.9 + 0.25
    if institute:
        inst_lines = max(1, math.ceil(len(institute) / 90))
        headline_h += inst_lines * 0.65 + 0.2
    headline_h += 0.7  # rules and bottom vskip

    top_spacing = 0.2  # engine.py top spacing
    footer_h = 1.8     # footline banner + padding
    frame_overhead_and_safety = 2.5  # frame padding and safety buffer

    usable_h = virtual_h - headline_h - top_spacing - footer_h - frame_overhead_and_safety

    if layout_type == "takeaway_led":
        results = poster_content.get("results", [])
        abstract = poster_content.get("abstract", "")
        conclusion = poster_content.get("conclusion", [])
        if results:
            takeaway_text = results[0]
        elif abstract:
            takeaway_text = abstract.split(".")[0] + "."
        elif conclusion:
            takeaway_text = conclusion[0]
        else:
            takeaway_text = "Key research contribution and empirical findings."
        # Hero card width is full text width (~67cm), \\Large\\bfseries ~75 chars/line
        hero_lines = max(1, math.ceil(len(takeaway_text) / 75))
        hero_h = 2.4 + hero_lines * 0.8 + 0.35  # block chrome + text lines + \\vskip0.6em
        usable_h -= hero_h

    return max(15.0, round(usable_h, 1))


def _estimate_block_height(
    block_type: str,
    content: Any,
    title: str = "",
    figure_height: float = 0.0,
) -> float:
    """Estimate rendered block height in virtual cm at scale=1.7.

    Accounts for:
    - Block title wrapping (titles at \\colwidth wrap every ~26 chars at \\LARGE)
    - Block chrome, header/body margins and padding
    - Line wrapping (~38 chars/line for itemize with bullets, ~44 for text)
    - Item separation and list environment overhead
    - Figure and caption height
    """
    if block_type == "figure":
        fig_h = figure_height if figure_height > 0 else (float(content) if isinstance(content, (int, float)) else 12.0)
        return fig_h + 2.2

    if not content:
        return 0.0

    # Base overhead for block container (chrome, margins, padding)
    title_lines = max(1, math.ceil(len(title) / 26)) if title else 1
    header_h = 0.6 + title_lines * 0.75
    body_padding = 0.6

    if block_type == "text":
        lines = max(1, math.ceil(len(str(content)) / 44))
        return header_h + body_padding + lines * 0.65

    elif block_type == "bullets":
        if not isinstance(content, list):
            content = [str(content)]
        bullet_lines_total = 0
        for b in content:
            lines = max(1, math.ceil(len(str(b)) / 38))
            bullet_lines_total += lines
        bullets_h = bullet_lines_total * 0.62 + len(content) * 0.25 + 0.35
        return header_h + body_padding + bullets_h

    elif block_type == "references":
        ref_items = content if isinstance(content, list) else [str(content)]
        ref_h = 0.5
        for ref in ref_items:
            lines = max(1, math.ceil(len(str(ref)) / 65))
            ref_h += lines * 0.45 + 0.25
        return header_h + body_padding + ref_h

    return 5.0


def _compute_inter_block_spacing(
    block_specs: List[Tuple[Any, ...]],
    target_usable_height: float = 26.0,
    min_gap: float = 0.0,
    max_gap: float = 2.5,
) -> float:
    """Compute content-aware vertical spacing between blocks to avoid overflow and bottom whitespace.

    Parameters
    ----------
    block_specs : list of tuples
        Either (block_type, content) or (block_type, title, content).
    target_usable_height : float
        Available vertical height in virtual cm.
    min_gap : float
        Minimum separation gap in cm. If remaining space is tight (<=0.4cm),
        gap drops to 0.0cm to prevent clipping.
    max_gap : float
        Maximum separation gap in cm to prevent disconnected layouts.
    """
    valid_blocks = []
    for spec in block_specs:
        if len(spec) == 3:
            btype, btitle, bcontent = spec
        elif len(spec) == 2:
            btype, bcontent = spec
            btitle = ""
        else:
            continue
        if bcontent:
            valid_blocks.append((btype, btitle, bcontent))

    n_blocks = len(valid_blocks)
    if n_blocks <= 1:
        return 0.0

    total_content_height = sum(
        _estimate_block_height(
            btype,
            bcontent,
            title=btitle,
            figure_height=bcontent if btype == "figure" and isinstance(bcontent, (int, float)) else 0.0,
        )
        for btype, btitle, bcontent in valid_blocks
    )

    remaining_space = target_usable_height - total_content_height
    n_gaps = n_blocks - 1

    # Prioritize keeping every block fully visible over filling the poster vertically:
    # If remaining space is tight or negative, gap must drop to 0.0cm (blocks naturally have ~0.8em margin).
    if remaining_space <= 0.4:
        return 0.0

    raw_gap = remaining_space / n_gaps
    safe_gap = max(min_gap, min(max_gap, raw_gap))
    return round(safe_gap, 1)


# ---------------------------------------------------------------------------
# Layout 1: Structured Academic Grid (Dynamic Column Balancing)
# ---------------------------------------------------------------------------

def generate_structured_grid_layout(
    poster_content: dict,
    image_paths: List[str],
    font_wrapper: str = "",
    font_script: str = "",
) -> str:
    """Generate balanced 3-column layout.

    Dynamically distributes sections according to image count so that Column 2
    is never left empty or sparse when images are absent.
    """
    abstract = poster_content.get("abstract", "")
    intro = poster_content.get("introduction", [])
    method = poster_content.get("methodology", [])
    results = poster_content.get("results", [])
    conclusion = poster_content.get("conclusion", [])
    references = poster_content.get("references", [])

    usable_h = _calculate_available_column_height(poster_content, layout_type="structured_grid")
    parts = []

    if not image_paths:
        # Case A: 0 Images -> Distribute content evenly across 3 columns
        col1_gap = _compute_inter_block_spacing(
            [("text", "Abstract", abstract), ("bullets", "Introduction & Motivation", intro)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.5,
        )
        col2_gap = _compute_inter_block_spacing(
            [("bullets", "Methodology & System Design", method), ("bullets", "Key Results & Empirical Findings", results)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.2,
        )
        col3_gap = _compute_inter_block_spacing(
            [("bullets", "Conclusion & Significance", conclusion), ("references", "References", references)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.5,
        )

        # Col 1: Abstract + Introduction
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if abstract:
            parts.append(_block("Abstract", abstract, font_wrapper=font_wrapper, font_script=font_script))
        if intro:
            if abstract and col1_gap > 0.05:
                parts.append(f"\\vspace{{{col1_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Introduction & Motivation", intro, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 2: Methodology + Results (Alerted)
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if method:
            parts.append(_bullet_block("Methodology & System Design", method, font_wrapper=font_wrapper, font_script=font_script))
        if results:
            if method and col2_gap > 0.05:
                parts.append(f"\\vspace{{{col2_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Key Results & Empirical Findings", results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 3: Conclusion + References
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if conclusion:
            parts.append(_bullet_block("Conclusion & Significance", conclusion, font_wrapper=font_wrapper, font_script=font_script))
        if references:
            if conclusion and col3_gap > 0.05:
                parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
            parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n")

    elif len(image_paths) == 1:
        # Case B: 1 Image -> Figure sits prominently in Column 2
        col1_gap = _compute_inter_block_spacing(
            [("text", "Abstract", abstract), ("bullets", "Introduction", intro), ("bullets", "Methodology", method)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.0,
        )
        col2_gap = _compute_inter_block_spacing(
            [("bullets", "Empirical Results", results), ("figure", "Key Figure", 13.0)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.2,
        )
        col3_gap = _compute_inter_block_spacing(
            [("bullets", "Conclusion & Future Work", conclusion), ("references", "References", references)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.5,
        )

        # Col 1: Abstract + Introduction + Methodology
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if abstract:
            parts.append(_block("Abstract", abstract, font_wrapper=font_wrapper, font_script=font_script))
        if intro:
            if abstract and col1_gap > 0.05:
                parts.append(f"\\vspace{{{col1_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Introduction", intro, font_wrapper=font_wrapper, font_script=font_script))
        if method:
            if (intro or abstract) and col1_gap > 0.05:
                parts.append(f"\\vspace{{{col1_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Methodology", method, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 2: Results + Primary Figure
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if results:
            parts.append(_bullet_block("Empirical Results", results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
            if col2_gap > 0.05:
                parts.append(f"\\vspace{{{col2_gap:.1f}cm}}\n\n")
        parts.append(_figure_block(image_paths[0], caption="Key Figure / System Overview", height_cm=13.0, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 3: Conclusion + References
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if conclusion:
            parts.append(_bullet_block("Conclusion & Future Work", conclusion, font_wrapper=font_wrapper, font_script=font_script))
        if references:
            if conclusion and col3_gap > 0.05:
                parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
            parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n")

    else:
        # Case C: 2+ Images -> Figures in Column 2 and Column 3
        col1_gap = _compute_inter_block_spacing(
            [("text", "Abstract", abstract), ("bullets", "Introduction", intro), ("bullets", "Methodology", method)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=0.8,
        )
        col2_gap = _compute_inter_block_spacing(
            [("bullets", "Results & Evaluation", results), ("figure", "Figure 1", 12.0)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.0,
        )
        col3_gap = _compute_inter_block_spacing(
            [("figure", "Figure 2", 10.0), ("bullets", "Conclusion", conclusion), ("references", "References", references)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=0.8,
        )

        # Col 1: Abstract + Introduction + Methodology
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if abstract:
            parts.append(_block("Abstract", abstract, font_wrapper=font_wrapper, font_script=font_script))
        if intro:
            if abstract and col1_gap > 0.05:
                parts.append(f"\\vspace{{{col1_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Introduction", intro, font_wrapper=font_wrapper, font_script=font_script))
        if method:
            if (intro or abstract) and col1_gap > 0.05:
                parts.append(f"\\vspace{{{col1_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Methodology", method, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 2: Results + Figure 1
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if results:
            parts.append(_bullet_block("Results & Evaluation", results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
            if col2_gap > 0.05:
                parts.append(f"\\vspace{{{col2_gap:.1f}cm}}\n\n")
        parts.append(_figure_block(image_paths[0], caption="Figure 1: Main Evaluation", height_cm=12.0, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 3: Figure 2 + Conclusion + References
        parts.append("\\begin{column}{\\colwidth}\n\n")
        parts.append(_figure_block(image_paths[1], caption="Figure 2: Architecture / Analysis", height_cm=10.0, font_wrapper=font_wrapper, font_script=font_script))
        if conclusion:
            if col3_gap > 0.05:
                parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Conclusion", conclusion, font_wrapper=font_wrapper, font_script=font_script))
        if references:
            if (conclusion or len(image_paths) > 1) and col3_gap > 0.05:
                parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
            parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n")

    return "".join(parts)


# ---------------------------------------------------------------------------
# Layout 2: Takeaway-Led Poster (Hero Headline / Core Finding)
# ---------------------------------------------------------------------------

def generate_takeaway_led_layout(
    poster_content: dict,
    image_paths: List[str],
    font_wrapper: str = "",
    font_script: str = "",
) -> str:
    """Generate poster layout centered around a prominent key takeaway."""
    abstract = poster_content.get("abstract", "")
    intro = poster_content.get("introduction", [])
    method = poster_content.get("methodology", [])
    results = poster_content.get("results", [])
    conclusion = poster_content.get("conclusion", [])
    references = poster_content.get("references", [])

    # Extract prime takeaway
    takeaway_text = ""
    if results:
        takeaway_text = results[0]
    elif abstract:
        takeaway_text = abstract.split(".")[0] + "."
    elif conclusion:
        takeaway_text = conclusion[0]
    else:
        takeaway_text = "Key research contribution and empirical findings."

    safe_takeaway = escape_latex(takeaway_text, preserve_math=True)
    if font_wrapper and safe_takeaway:
        safe_takeaway = wrap_script_runs(safe_takeaway, font_wrapper, font_script)

    usable_h = _calculate_available_column_height(poster_content, layout_type="takeaway_led")
    parts = []

    # 1. Full-width Hero Takeaway Card
    parts.append(
        "\\begin{alertblock}{CENTRAL FINDING \\& TAKEAWAY}\n"
        f"\\centering\\Large\\bfseries {safe_takeaway}\n"
        "\\end{alertblock}\n\n"
        "\\vskip0.6em\n"
        "\\begin{columns}[t]\n"
        "\\separatorcolumn\n\n"
    )

    if not image_paths:
        # Case A: 0 Images -> Distribute content evenly across 3 columns
        col1_gap = _compute_inter_block_spacing(
            [("text", "Context & Motivation", abstract), ("bullets", "Problem Statement", intro)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.2,
        )
        col2_gap = _compute_inter_block_spacing(
            [("bullets", "Proposed Approach", method), ("bullets", "Empirical Validation", results[1:] if len(results) > 1 else results)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.0,
        )
        col3_gap = _compute_inter_block_spacing(
            [("bullets", "Significance & Implications", conclusion), ("references", "References", references)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.2,
        )

        # Col 1: Context & Problem
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if abstract:
            parts.append(_block("Context & Motivation", abstract, font_wrapper=font_wrapper, font_script=font_script))
        if intro:
            if abstract and col1_gap > 0.05:
                parts.append(f"\\vspace{{{col1_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Problem Statement", intro, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 2: Approach & Validation
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if method:
            parts.append(_bullet_block("Proposed Approach", method, font_wrapper=font_wrapper, font_script=font_script))
        rem_results = results[1:] if len(results) > 1 else results
        if rem_results:
            if method and col2_gap > 0.05:
                parts.append(f"\\vspace{{{col2_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Empirical Validation", rem_results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 3: Significance & References
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if conclusion:
            parts.append(_bullet_block("Significance & Implications", conclusion, font_wrapper=font_wrapper, font_script=font_script))
        if references:
            if conclusion and col3_gap > 0.05:
                parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
            parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n")

    elif len(image_paths) == 1:
        # Case B: 1 Image -> Figure sits in Column 2 with Proposed Approach
        col1_gap = _compute_inter_block_spacing(
            [("text", "Context & Motivation", abstract), ("bullets", "Problem Statement", intro)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.2,
        )
        col2_gap = _compute_inter_block_spacing(
            [("bullets", "Proposed Approach", method), ("figure", "Primary Experimental Result", 13.0)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.0,
        )
        rem_results = results[1:] if len(results) > 1 else results
        col3_gap = _compute_inter_block_spacing(
            [("bullets", "Empirical Validation", rem_results), ("bullets", "Significance & Implications", conclusion), ("references", "References", references)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=0.8,
        )

        # Col 1
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if abstract:
            parts.append(_block("Context & Motivation", abstract, font_wrapper=font_wrapper, font_script=font_script))
        if intro:
            if abstract and col1_gap > 0.05:
                parts.append(f"\\vspace{{{col1_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Problem Statement", intro, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 2
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if method:
            parts.append(_bullet_block("Proposed Approach", method, font_wrapper=font_wrapper, font_script=font_script))
            if col2_gap > 0.05:
                parts.append(f"\\vspace{{{col2_gap:.1f}cm}}\n\n")
        parts.append(_figure_block(image_paths[0], caption="Primary Experimental Result", height_cm=13.0, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 3
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if rem_results:
            parts.append(_bullet_block("Empirical Validation", rem_results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
        if conclusion:
            if rem_results and col3_gap > 0.05:
                parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Significance & Implications", conclusion, font_wrapper=font_wrapper, font_script=font_script))
        if references:
            if (conclusion or rem_results) and col3_gap > 0.05:
                parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
            parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n")

    else:
        # Case C: 2+ Images -> Figure 1 in Col 2, Figure 2 in Col 3
        col1_gap = _compute_inter_block_spacing(
            [("text", "Context & Motivation", abstract), ("bullets", "Problem Statement", intro)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.2,
        )
        col2_gap = _compute_inter_block_spacing(
            [("bullets", "Proposed Approach", method), ("figure", "Primary Experimental Result", 13.0)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=1.0,
        )
        col3_gap = _compute_inter_block_spacing(
            [("figure", "Ablation / Additional Analysis", 10.0), ("bullets", "Significance & Implications", conclusion), ("references", "References", references)],
            target_usable_height=usable_h,
            min_gap=0.0,
            max_gap=0.8,
        )

        # Col 1
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if abstract:
            parts.append(_block("Context & Motivation", abstract, font_wrapper=font_wrapper, font_script=font_script))
        if intro:
            if abstract and col1_gap > 0.05:
                parts.append(f"\\vspace{{{col1_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Problem Statement", intro, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 2
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if method:
            parts.append(_bullet_block("Proposed Approach", method, font_wrapper=font_wrapper, font_script=font_script))
            if col2_gap > 0.05:
                parts.append(f"\\vspace{{{col2_gap:.1f}cm}}\n\n")
        parts.append(_figure_block(image_paths[0], caption="Primary Experimental Result", height_cm=13.0, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 3
        parts.append("\\begin{column}{\\colwidth}\n\n")
        parts.append(_figure_block(image_paths[1], caption="Ablation / Additional Analysis", height_cm=10.0, font_wrapper=font_wrapper, font_script=font_script))
        if conclusion:
            if col3_gap > 0.05:
                parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
            parts.append(_bullet_block("Significance & Implications", conclusion, font_wrapper=font_wrapper, font_script=font_script))
        if references:
            if (conclusion or len(image_paths) > 1) and col3_gap > 0.05:
                parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
            parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n")

    parts.append("\\separatorcolumn\n\\end{columns}\n")
    return "".join(parts)


# ---------------------------------------------------------------------------
# Layout 3: Workflow-Led Poster (Pipeline & Architecture Focus)
# ---------------------------------------------------------------------------

def generate_workflow_led_layout(
    poster_content: dict,
    image_paths: List[str],
    font_wrapper: str = "",
    font_script: str = "",
) -> str:
    """Generate systems/workflow-led poster layout."""
    abstract = poster_content.get("abstract", "")
    intro = poster_content.get("introduction", [])
    method = poster_content.get("methodology", [])
    results = poster_content.get("results", [])
    conclusion = poster_content.get("conclusion", [])
    references = poster_content.get("references", [])

    usable_h = _calculate_available_column_height(poster_content, layout_type="workflow_led")
    parts = []

    col1_gap = _compute_inter_block_spacing(
        [("text", "Abstract & Overview", abstract), ("bullets", "Motivation & Background", intro)],
        target_usable_height=usable_h,
        min_gap=0.0,
        max_gap=1.2,
    )

    col2_specs = []
    if method:
        col2_specs.append(("bullets", "System Pipeline & Methodology", method))
    if image_paths:
        col2_specs.append(("figure", "System Architecture & Workflow", 13.0))
    col2_gap = _compute_inter_block_spacing(col2_specs, target_usable_height=usable_h, min_gap=0.0, max_gap=1.0)

    col3_specs = []
    if results:
        col3_specs.append(("bullets", "Empirical Evaluation", results))
    if len(image_paths) > 1:
        col3_specs.append(("figure", "Performance Benchmark", 10.0))
    if conclusion:
        col3_specs.append(("bullets", "Verdict & Future Systems", conclusion))
    if references:
        col3_specs.append(("references", "References", references))
    col3_gap = _compute_inter_block_spacing(col3_specs, target_usable_height=usable_h, min_gap=0.0, max_gap=0.8)

    # Column 1: Foundations & Motivation
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if abstract:
        parts.append(_block("Abstract & Overview", abstract, font_wrapper=font_wrapper, font_script=font_script))
    if intro:
        if abstract and col1_gap > 0.05:
            parts.append(f"\\vspace{{{col1_gap:.1f}cm}}\n\n")
        parts.append(_bullet_block("Motivation & Background", intro, font_wrapper=font_wrapper, font_script=font_script))
    parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

    # Column 2: System Architecture & Pipeline Workflow
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if method:
        parts.append(_bullet_block("System Pipeline & Methodology", method, font_wrapper=font_wrapper, font_script=font_script))
    if image_paths:
        if method and col2_gap > 0.05:
            parts.append(f"\\vspace{{{col2_gap:.1f}cm}}\n\n")
        parts.append(_figure_block(image_paths[0], caption="System Architecture & Workflow", height_cm=13.0, font_wrapper=font_wrapper, font_script=font_script))
    parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

    # Column 3: Empirical Validation & Verdict
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if results:
        parts.append(_bullet_block("Empirical Evaluation", results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
    if len(image_paths) > 1:
        if results and col3_gap > 0.05:
            parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
        parts.append(_figure_block(image_paths[1], caption="Performance Benchmark", height_cm=10.0, font_wrapper=font_wrapper, font_script=font_script))
    if conclusion:
        if (results or len(image_paths) > 1) and col3_gap > 0.05:
            parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
        parts.append(_bullet_block("Verdict & Future Systems", conclusion, font_wrapper=font_wrapper, font_script=font_script))
    if references:
        if (conclusion or results or len(image_paths) > 1) and col3_gap > 0.05:
            parts.append(f"\\vspace{{{col3_gap:.1f}cm}}\n\n")
        parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
    parts.append("\\end{column}\n\n")

    return "".join(parts)
