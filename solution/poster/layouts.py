"""Poster composition layouts for SARAL AI.

Provides three distinct academic poster layouts:
1. structured_grid: Classical balanced 3-column academic conference poster.
2. takeaway_led: Focal takeaway / central claim hero banner leading into evidence.
3. workflow_led: Methodological architecture & systems pipeline emphasis.
"""

from __future__ import annotations

import logging
from typing import List, Optional

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
    ]
    for ref in refs:
        safe_ref = escape_latex(ref, preserve_math=True)
        if font_wrapper and safe_ref:
            safe_ref = wrap_script_runs(safe_ref, font_wrapper, font_script)
        lines.append(f"  \\item {safe_ref}")
    lines += ["\\end{enumerate}", "\\end{block}", ""]
    return "\n".join(lines) + "\n"


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

    parts = []

    if not image_paths:
        # Case A: 0 Images -> Distribute content evenly across 3 columns
        # Col 1: Abstract + Introduction
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if abstract:
            parts.append(_block("Abstract", abstract, font_wrapper=font_wrapper, font_script=font_script))
        if intro:
            parts.append(_bullet_block("Introduction & Motivation", intro, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 2: Methodology + Results (Alerted)
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if method:
            parts.append(_bullet_block("Methodology & System Design", method, font_wrapper=font_wrapper, font_script=font_script))
        if results:
            parts.append(_bullet_block("Key Results & Empirical Findings", results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 3: Conclusion + References
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if conclusion:
            parts.append(_bullet_block("Conclusion & Significance", conclusion, font_wrapper=font_wrapper, font_script=font_script))
        if references:
            parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n")

    elif len(image_paths) == 1:
        # Case B: 1 Image -> Figure sits prominently in Column 2
        # Col 1: Abstract + Introduction + Methodology
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if abstract:
            parts.append(_block("Abstract", abstract, font_wrapper=font_wrapper, font_script=font_script))
        if intro:
            parts.append(_bullet_block("Introduction", intro, font_wrapper=font_wrapper, font_script=font_script))
        if method:
            parts.append(_bullet_block("Methodology", method, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 2: Results + Primary Figure
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if results:
            parts.append(_bullet_block("Empirical Results", results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
        parts.append(_figure_block(image_paths[0], caption="Key Figure / System Overview", height_cm=18.0, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 3: Conclusion + References
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if conclusion:
            parts.append(_bullet_block("Conclusion & Future Work", conclusion, font_wrapper=font_wrapper, font_script=font_script))
        if references:
            parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n")

    else:
        # Case C: 2+ Images -> Figures in Column 2 and Column 3
        # Col 1: Abstract + Introduction + Methodology
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if abstract:
            parts.append(_block("Abstract", abstract, font_wrapper=font_wrapper, font_script=font_script))
        if intro:
            parts.append(_bullet_block("Introduction", intro, font_wrapper=font_wrapper, font_script=font_script))
        if method:
            parts.append(_bullet_block("Methodology", method, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 2: Results + Figure 1
        parts.append("\\begin{column}{\\colwidth}\n\n")
        if results:
            parts.append(_bullet_block("Results & Evaluation", results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
        parts.append(_figure_block(image_paths[0], caption="Figure 1: Main Evaluation", height_cm=16.0, font_wrapper=font_wrapper, font_script=font_script))
        parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

        # Col 3: Figure 2 + Conclusion + References
        parts.append("\\begin{column}{\\colwidth}\n\n")
        parts.append(_figure_block(image_paths[1], caption="Figure 2: Architecture / Analysis", height_cm=14.0, font_wrapper=font_wrapper, font_script=font_script))
        if conclusion:
            parts.append(_bullet_block("Conclusion", conclusion, font_wrapper=font_wrapper, font_script=font_script))
        if references:
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

    parts = []

    # 1. Full-width Hero Takeaway Card
    parts.append(
        "\\begin{alertblock}{CENTRAL FINDING \\& TAKEAWAY}\n"
        f"\\centering\\Large\\bfseries {safe_takeaway}\n"
        "\\end{alertblock}\n\n"
        "\\vskip0.5em\n"
        "\\begin{columns}[t]\n"
        "\\separatorcolumn\n\n"
    )

    # 2. Evidence Column 1: Context, Problem & Proposed Methodology
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if abstract:
        parts.append(_block("Context & Motivation", abstract, font_wrapper=font_wrapper, font_script=font_script))
    if intro:
        parts.append(_bullet_block("Problem Statement", intro, font_wrapper=font_wrapper, font_script=font_script))
    if method:
        parts.append(_bullet_block("Proposed Approach", method, font_wrapper=font_wrapper, font_script=font_script))
    parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

    # 3. Evidence Column 2: Detailed Results & Primary Figure
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if len(results) > 1:
        parts.append(_bullet_block("Empirical Validation", results[1:], is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
    elif results:
        parts.append(_bullet_block("Empirical Validation", results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
    if image_paths:
        parts.append(_figure_block(image_paths[0], caption="Primary Experimental Result", height_cm=16.0, font_wrapper=font_wrapper, font_script=font_script))
    parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

    # 4. Evidence Column 3: Significance, Conclusion & References
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if len(image_paths) > 1:
        parts.append(_figure_block(image_paths[1], caption="Ablation / Additional Analysis", height_cm=13.0, font_wrapper=font_wrapper, font_script=font_script))
    if conclusion:
        parts.append(_bullet_block("Significance & Implications", conclusion, font_wrapper=font_wrapper, font_script=font_script))
    if references:
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

    parts = []

    # Column 1: Foundations & Motivation
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if abstract:
        parts.append(_block("Abstract & Overview", abstract, font_wrapper=font_wrapper, font_script=font_script))
    if intro:
        parts.append(_bullet_block("Motivation & Background", intro, font_wrapper=font_wrapper, font_script=font_script))
    parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

    # Column 2: System Architecture & Pipeline Workflow
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if method:
        parts.append(_bullet_block("System Pipeline & Methodology", method, font_wrapper=font_wrapper, font_script=font_script))
    if image_paths:
        parts.append(_figure_block(image_paths[0], caption="System Architecture & Workflow", height_cm=17.0, font_wrapper=font_wrapper, font_script=font_script))
    parts.append("\\end{column}\n\n\\separatorcolumn\n\n")

    # Column 3: Empirical Validation & Verdict
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if results:
        parts.append(_bullet_block("Empirical Evaluation", results, is_alert=True, font_wrapper=font_wrapper, font_script=font_script))
    if len(image_paths) > 1:
        parts.append(_figure_block(image_paths[1], caption="Performance Benchmark", height_cm=13.0, font_wrapper=font_wrapper, font_script=font_script))
    if conclusion:
        parts.append(_bullet_block("Verdict & Future Systems", conclusion, font_wrapper=font_wrapper, font_script=font_script))
    if references:
        parts.append(_references_block(references, font_wrapper=font_wrapper, font_script=font_script))
    parts.append("\\end{column}\n\n")

    return "".join(parts)
