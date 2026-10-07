"""Poster theme specifications and Beamerposter style file generator.

Generates beamerthemegemini.sty and beamercolorthemegemini.sty customized
to the selected academic color palette.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict

from ..shared.tokens import ColorPalette, THEME_PALETTES, resolve_palette

POSTER_THEMES: Dict[str, str] = {
    "classic_navy": "Classic Navy",
    "modern_teal": "Modern Teal",
    "academic_burgundy": "Academic Burgundy",
    "clean_slate": "Clean Slate",
    "vibrant_indigo": "Vibrant Indigo",
    "teal_emerald": "Biomedical Emerald",
    "crimson_burgundy": "Crimson Academic",
    "slate_indigo": "Slate Modern",
    "amber_earth": "Earth Amber",
}

POSTER_LAYOUTS = [
    "structured_grid",
    "takeaway_led",
    "workflow_led",
]


def generate_gemini_theme_sty(palette: ColorPalette) -> str:
    """Generate beamerthemegemini.sty package definition."""
    return rf"""% Gemini poster theme for SARAL AI
\ProvidesPackage{{beamerthemegemini}}

\mode<presentation>

\RequirePackage{{tikz}}
\RequirePackage{{xcolor}}

% Palette colors
\definecolor{{geminiprimary}}{{HTML}}{{{palette.primary.lstrip('#')}}}
\definecolor{{geminisecondary}}{{HTML}}{{{palette.secondary.lstrip('#')}}}
\definecolor{{geminiaccent}}{{HTML}}{{{palette.accent.lstrip('#')}}}
\definecolor{{geminibg}}{{HTML}}{{{palette.bg_canvas.lstrip('#')}}}
\definecolor{{geminisurface}}{{HTML}}{{{palette.surface.lstrip('#')}}}
\definecolor{{geminiborder}}{{HTML}}{{{palette.border.lstrip('#')}}}
\definecolor{{geminialert}}{{HTML}}{{{palette.alert_primary.lstrip('#')}}}
\definecolor{{geminialertbg}}{{HTML}}{{{palette.alert_surface.lstrip('#')}}}

% Theme color bindings
\setbeamercolor{{headline}}{{fg=white,bg=geminiprimary}}
\setbeamercolor{{footline}}{{fg=white,bg=geminiprimary}}
\setbeamercolor{{block title}}{{fg=white,bg=geminiprimary}}
\setbeamercolor{{block body}}{{fg=black,bg=geminisurface}}
\setbeamercolor{{block title alerted}}{{fg=white,bg=geminialert}}
\setbeamercolor{{block body alerted}}{{fg=black,bg=geminialertbg}}
\setbeamercolor{{title}}{{fg=white}}
\setbeamercolor{{author}}{{fg=white!95}}
\setbeamercolor{{institute}}{{fg=white!80}}
\setbeamercolor{{itemize item}}{{fg=geminisecondary}}
\setbeamercolor{{itemize subitem}}{{fg=geminiaccent}}
\setbeamercolor{{enumerate item}}{{fg=geminiprimary}}

% Typography
\setbeamerfont{{headline title}}{{size=\VeryHuge,series=\bfseries}}
\setbeamerfont{{headline author}}{{size=\Large}}
\setbeamerfont{{headline institute}}{{size=\normalsize}}
\setbeamerfont{{block title}}{{size=\large,series=\bfseries}}
\setbeamerfont{{block body}}{{size=\normalsize}}

% Itemize templates
\setbeamertemplate{{itemize item}}{{\small\raisebox{{0.2ex}}{{$\bullet$}}}}
\setbeamertemplate{{itemize subitem}}{{\footnotesize\raisebox{{0.2ex}}{{$\circ$}}}}
\setbeamertemplate{{enumerate item}}{{\insertenumlabel.}}

% Standard Block
\setbeamertemplate{{block begin}}{{
  \vskip0.75em
  \begin{{beamercolorbox}}[rounded=true,shadow=false,leftskip=1.2em,rightskip=1.2em,colsep*=.75ex]{{block title}}%
    \usebeamerfont{{block title}}\insertblocktitle
  \end{{beamercolorbox}}%
  \vskip-0.4em
  \begin{{beamercolorbox}}[rounded=true,shadow=false,leftskip=1.2em,rightskip=1.2em,colsep*=.75ex,vmode]{{block body}}%
    \usebeamerfont{{block body}}%
    \vskip0.4em
}}
\setbeamertemplate{{block end}}{{
    \vskip0.4em
  \end{{beamercolorbox}}
  \vskip0.75em
}}

% Alert Block (e.g. Key Takeaway / Central Claim)
\setbeamertemplate{{block alerted begin}}{{
  \vskip0.75em
  \begin{{beamercolorbox}}[rounded=true,shadow=false,leftskip=1.2em,rightskip=1.2em,colsep*=.75ex]{{block title alerted}}%
    \usebeamerfont{{block title}}\insertblocktitle
  \end{{beamercolorbox}}%
  \vskip-0.4em
  \begin{{beamercolorbox}}[rounded=true,shadow=false,leftskip=1.2em,rightskip=1.2em,colsep*=.75ex,vmode]{{block body alerted}}%
    \usebeamerfont{{block body}}%
    \vskip0.4em
}}
\setbeamertemplate{{block alerted end}}{{
    \vskip0.4em
  \end{{beamercolorbox}}
  \vskip0.75em
}}

% Headline Banner
\setbeamertemplate{{headline}}{{
  \leavevmode
  \begin{{beamercolorbox}}[wd=\paperwidth]{{headline}}
    \centering
    \vskip2.5ex
    {{\usebeamerfont{{headline title}}\usebeamercolor[fg]{{title}}\inserttitle}}\\[1.5ex]
    {{\usebeamerfont{{headline author}}\usebeamercolor[fg]{{author}}\insertauthor}}\\[1ex]
    {{\usebeamerfont{{headline institute}}\usebeamercolor[fg]{{institute}}\insertinstitute}}
    \vskip2.5ex
    {{\color{{geminiaccent}}\rule{{\paperwidth}}{{4pt}}}}
  \end{{beamercolorbox}}
}}

% Footline Banner
\setbeamertemplate{{footline}}{{
  \leavevmode
  \begin{{beamercolorbox}}[wd=\paperwidth]{{footline}}
    \vskip1ex
    \hspace*{{3em}}
    {{\footnotesize\bfseries SARAL AI $\cdot$ Democratising Research Communication}}
    \hfill
    {{\footnotesize Academic Conference Presentation Poster}}
    \hspace*{{3em}}
    \vskip1ex
  \end{{beamercolorbox}}
}}

\mode<all>
"""


def generate_gemini_color_sty(palette: ColorPalette) -> str:
    """Generate beamercolorthemegemini.sty package definition."""
    return rf"""% Gemini color theme for SARAL AI
\ProvidesPackage{{beamercolorthemegemini}}

\mode<presentation>

\definecolor{{geminiblue}}{{HTML}}{{{palette.primary.lstrip('#')}}}
\definecolor{{geminiaccent}}{{HTML}}{{{palette.accent.lstrip('#')}}}
\definecolor{{geminibg}}{{HTML}}{{{palette.bg_canvas.lstrip('#')}}}
\definecolor{{geminisurface}}{{HTML}}{{{palette.surface.lstrip('#')}}}

\setbeamercolor{{background canvas}}{{bg=geminibg}}
\setbeamercolor{{headline}}{{fg=white,bg=geminiblue}}
\setbeamercolor{{footline}}{{fg=white,bg=geminiblue}}
\setbeamercolor{{title}}{{fg=white}}
\setbeamercolor{{author}}{{fg=white}}
\setbeamercolor{{institute}}{{fg=white!85}}
\setbeamercolor{{block title}}{{fg=white,bg=geminiblue}}
\setbeamercolor{{block body}}{{fg=black,bg=geminisurface}}
\setbeamercolor{{itemize item}}{{fg=geminiblue}}
\setbeamercolor{{itemize subitem}}{{fg=geminiaccent}}
\setbeamercolor{{enumerate item}}{{fg=geminiblue}}

\mode<all>
"""


def create_theme_files(workdir: Path, theme: str | None = None) -> None:
    """Create .sty theme files in *workdir* corresponding to *theme*."""
    palette = resolve_palette(theme)
    theme_sty = generate_gemini_theme_sty(palette)
    color_sty = generate_gemini_color_sty(palette)

    (workdir / "beamerthemegemini.sty").write_text(theme_sty, encoding="utf-8")
    (workdir / "beamercolorthemegemini.sty").write_text(color_sty, encoding="utf-8")
