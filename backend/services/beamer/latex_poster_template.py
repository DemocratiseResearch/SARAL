from __future__ import annotations

import logging
from pathlib import Path

from latex_template import escape_latex  # reuse from sibling module

log = logging.getLogger(__name__)


def create_theme_files(workdir: Path) -> None:

    gemini_theme = r"""% Gemini theme
% Simplified version without Cambridge branding

\ProvidesPackage{beamerthemegemini}

\mode<presentation>

% Requirement
\RequirePackage{tikz}
\RequirePackage{xcolor}

% Colors
\definecolor{geminiblue}{HTML}{355C7D}
\definecolor{geminiaccent}{HTML}{6C5B7B}
\definecolor{geminibg}{HTML}{F5F5F5}

% Set colors
\setbeamercolor{headline}{fg=white,bg=geminiblue}
\setbeamercolor{footline}{fg=white,bg=geminiblue}
\setbeamercolor{block title}{fg=white,bg=geminiblue}
\setbeamercolor{block body}{fg=black,bg=white}
\setbeamercolor{title}{fg=white}
\setbeamercolor{author}{fg=white}
\setbeamercolor{itemize item}{fg=geminiblue}
\setbeamercolor{itemize subitem}{fg=geminiaccent}

% Fonts
\setbeamerfont{headline title}{size=\VeryHuge,series=\bfseries}
\setbeamerfont{headline author}{size=\Large}
\setbeamerfont{block title}{size=\large,series=\bfseries}
\setbeamerfont{block body}{size=\normalsize}

% Itemize
\setbeamertemplate{itemize item}{\textbullet}
\setbeamertemplate{itemize subitem}{\textbullet}

% Block
\setbeamertemplate{block begin}{
  \vskip1em
  \begin{beamercolorbox}[rounded=true,shadow=false,leftskip=1em,rightskip=1em,colsep*=.75ex]{block title}%
    \usebeamerfont{block title}\insertblocktitle
  \end{beamercolorbox}%
  \vskip-0.5em
  \begin{beamercolorbox}[rounded=true,shadow=false,leftskip=1em,rightskip=1em,colsep*=.75ex,vmode]{block body}%
    \usebeamerfont{block body}%
}
\setbeamertemplate{block end}{
  \end{beamercolorbox}
  \vskip1em
}

% Alert block
\setbeamercolor{block title alerted}{fg=white,bg=geminiaccent}
\setbeamertemplate{block alerted begin}{
  \vskip1em
  \begin{beamercolorbox}[rounded=true,shadow=false,leftskip=1em,rightskip=1em,colsep*=.75ex]{block title alerted}%
    \usebeamerfont{block title}\insertblocktitle
  \end{beamercolorbox}%
  \vskip-0.5em
  \begin{beamercolorbox}[rounded=true,shadow=false,leftskip=1em,rightskip=1em,colsep*=.75ex,vmode]{block body}%
    \usebeamerfont{block body}%
}
\setbeamertemplate{block alerted end}{
  \end{beamercolorbox}
  \vskip1em
}

% Headline
\setbeamertemplate{headline}{
  \leavevmode
  \begin{beamercolorbox}[wd=\paperwidth]{headline}
    \centering
    \vskip2ex
    \usebeamerfont{headline title}\usebeamercolor[fg]{title}\inserttitle\\[1ex]
    \usebeamerfont{headline author}\usebeamercolor[fg]{author}\insertauthor\\[1ex]
    \usebeamerfont{headline institutr}\usebeamercolor[fg]{author}\insertinstitute
    \vskip2ex
  \end{beamercolorbox}
}

\mode<all>
"""

    gemini_color = r"""% Gemini color theme
\ProvidesPackage{beamercolorthemegemini}

\mode<presentation>

\definecolor{geminiblue}{HTML}{355C7D}
\definecolor{geminiaccent}{HTML}{6C5B7B}
\definecolor{geminibg}{HTML}{FFFFFF}

\setbeamercolor{background canvas}{bg=geminibg}
\setbeamercolor{headline}{fg=white,bg=geminiblue}
\setbeamercolor{footline}{fg=white,bg=geminiblue}
\setbeamercolor{title}{fg=white}
\setbeamercolor{author}{fg=white}
\setbeamercolor{block title}{fg=white,bg=geminiblue}
\setbeamercolor{block body}{fg=black,bg=white}
\setbeamercolor{itemize item}{fg=geminiblue}
\setbeamercolor{itemize subitem}{fg=geminiaccent}
\setbeamercolor{enumerate item}{fg=geminiblue}

\mode<all>
"""

    (workdir / "beamerthemegemini.sty").write_text(gemini_theme, encoding="utf-8")
    (workdir / "beamercolorthemegemini.sty").write_text(gemini_color, encoding="utf-8")


# ---------------------------------------------------------------------------
# Poster dimensions — match poster_template.go defaults exactly.
# ---------------------------------------------------------------------------
_WIDTH_CM  = 120
_HEIGHT_CM = 72
_NUM_COLS  = 3
# colWidth = (100 - (NumColumns+1) * 2.5) / NumColumns / 100  →  0.300
_COL_WIDTH = (100.0 - (_NUM_COLS + 1) * 2.5) / _NUM_COLS / 100.0


# ---------------------------------------------------------------------------
# Helpers — mirror PosterTemplate methods from poster_template.go exactly.
# ---------------------------------------------------------------------------

def _generate_preamble() -> str:
    return (
        "\\documentclass[final]{beamer}\n\n"
        "%%%% Packages %%%%\n"
        f"\\usepackage[size=custom,width={_WIDTH_CM},height={_HEIGHT_CM},scale=1.2]{{beamerposter}}\n"
        "\\usetheme{gemini}\n"
        "\\usecolortheme{gemini}\n"
        "\\usepackage{graphicx}\n"
        "\\usepackage{booktabs}\n"
        "\\usepackage{tikz}\n"
        "\\usepackage{pgfplots}\n"
        "\\pgfplotsset{compat=1.14}\n"
        "\\usepackage{anyfontsize}\n"
        "\\usepackage{ragged2e}\n\n"
        "%%%% Lengths %%%%\n"
        "\\newlength{\\sepwidth}\n"
        "\\newlength{\\colwidth}\n"
        "\\setlength{\\sepwidth}{0.025\\paperwidth}\n"
        f"\\setlength{{\\colwidth}}{{{_COL_WIDTH:.3f}\\paperwidth}}\n\n"
        "\\newcommand{\\separatorcolumn}{\\begin{column}{\\sepwidth}\\end{column}}\n\n"
    )


def _generate_title_block(title: str, authors: str) -> str:
    t = escape_latex(title) if title else "Research Poster"
    a = escape_latex(authors) if authors else "Anonymous"
    return (
        "%%%% Title %%%%\n"
        f"\\title{{{t}}}\n"
        f"\\author{{{a}}}\n"
        "\\institute[]{}\n\n"
    )


def _generate_block(title: str, content: str, is_alert: bool = False) -> str:
    block_type = "alertblock" if is_alert else "block"
    return (
        f"\\begin{{{block_type}}}{{{title}}}\n"
        f"{escape_latex(content)}\n"
        f"\\end{{{block_type}}}\n\n"
    )


def _generate_bullet_block(title: str, bullets: list[str]) -> str:
    lines = [
        f"\\begin{{block}}{{{title}}}",
        "\\begin{itemize}",
    ]
    for bullet in bullets:
        lines.append(f"  \\item {escape_latex(bullet)}")
    lines += ["\\end{itemize}", "\\end{block}", ""]
    return "\n".join(lines) + "\n"


def _generate_results_block(results: list[str], image_paths: list[str]) -> str:
    lines = ["\\begin{block}{Results}", "\\begin{itemize}"]
    for result in results:
        lines.append(f"  \\item {escape_latex(result)}")
    lines.append("\\end{itemize}")
    if image_paths:
        lines += [
            "",
            "\\vspace{0.5em}",
            "\\begin{figure}",
            "\\centering",
            f"\\includegraphics[width=0.95\\textwidth,height=17.5cm,keepaspectratio]{{{image_paths[0]}}}",
            "\\caption{Key Figure}",
            "\\end{figure}",
        ]
    lines += ["\\end{block}", ""]
    return "\n".join(lines) + "\n"


def _generate_references_block(refs: list[str]) -> str:
    lines = [
        "\\begin{block}{References}",
        "\\footnotesize",
        "\\begin{enumerate}",
    ]
    for ref in refs:
        lines.append(f"  \\item {escape_latex(ref)}")
    lines += ["\\end{enumerate}", "\\end{block}", ""]
    return "\n".join(lines) + "\n"


def _generate_single_figure(image_path: str, fig_num: int) -> str:
    lines = [
        "\\vspace{0.5em}",
        "\\begin{figure}",
        "\\centering",
        f"\\includegraphics[width=0.95\\textwidth,height=17.5cm,keepaspectratio]{{{image_path}}}",
        f"\\caption{{Figure {fig_num}}}",
        "\\end{figure}",
        "",
    ]
    return "\n".join(lines) + "\n"


def _generate_three_column_layout(poster_content: dict, image_paths: list[str]) -> str:
    abstract   = poster_content.get("abstract", "")
    intro      = poster_content.get("introduction", [])
    method     = poster_content.get("methodology", [])
    results    = poster_content.get("results", [])
    conclusion = poster_content.get("conclusion", [])
    references = poster_content.get("references", [])

    parts = []

    # Column 1: Abstract, Introduction, Methodology
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if abstract:
        parts.append(_generate_block("Abstract", abstract))
    if intro:
        parts.append(_generate_bullet_block("Introduction", intro))
    if method:
        parts.append(_generate_bullet_block("Methodology", method))
    parts.append("\\end{column}\n\n")
    parts.append("\\separatorcolumn\n\n")

    # Column 2: Results with first image
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if results:
        parts.append(_generate_results_block(results, image_paths[:1] if image_paths else []))
    parts.append("\\end{column}\n\n")
    parts.append("\\separatorcolumn\n\n")

    # Column 3: Conclusion, References, second image
    parts.append("\\begin{column}{\\colwidth}\n\n")
    if conclusion:
        parts.append(_generate_bullet_block("Conclusion", conclusion))
    if references:
        parts.append(_generate_references_block(references))
    if len(image_paths) > 1:
        parts.append(_generate_single_figure(image_paths[1], 2))
    parts.append("\\end{column}\n\n")

    return "".join(parts)


def build_poster_document(poster_content: dict, image_local_paths: list[str]) -> str:
    title   = poster_content.get("title", "Research Poster")
    authors = poster_content.get("authors", "")

    doc  = _generate_preamble()
    doc += _generate_title_block(title, authors)
    doc += "\\begin{document}\n"
    doc += "\\begin{frame}[t]\n"
    doc += "\\begin{columns}[t]\n"
    doc += "\\separatorcolumn\n\n"
    doc += _generate_three_column_layout(poster_content, image_local_paths)
    doc += "\\separatorcolumn\n"
    doc += "\\end{columns}\n"
    doc += "\\end{frame}\n"
    doc += "\\end{document}\n"
    return doc
