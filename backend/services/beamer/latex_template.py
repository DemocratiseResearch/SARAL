"""LaTeX Beamer presentation template builder for SARAL AI.

Integrated with the redesigned presentation engine in solution/presentation/engine.py.
Preserves all legacy exports and interfaces.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# Dynamically locate solution package across parent directory tree
for parent in Path(__file__).resolve().parents:
    if (parent / "solution").is_dir() and str(parent) not in sys.path:
        sys.path.insert(0, str(parent))
        break

# Also check /app in Docker
if Path("/app/solution").is_dir() and "/app" not in sys.path:
    sys.path.insert(0, "/app")

log = logging.getLogger(__name__)

from solution.presentation.engine import (
    BEAMER_THEMES,
    build_beamer_document,
    compile_latex,
    convert_pdf_to_images,
)
from solution.shared.latex_utils import (
    LANGUAGE_FONT_MAP,
    LATEX_TEXT_SPECIALS as LATEX_SPECIALS,
    SCRIPT_UNICODE_CLASS,
    escape_latex,
    font_commands as _font_commands,
    normalise_bullets,
    wrap_indic,
    wrap_script_runs,
)
from solution.presentation.engine import _resolve_theme_key as _resolve_theme

__all__ = [
    "LATEX_SPECIALS",
    "escape_latex",
    "normalise_bullets",
    "LANGUAGE_FONT_MAP",
    "SCRIPT_UNICODE_CLASS",
    "wrap_indic",
    "wrap_script_runs",
    "BEAMER_THEMES",
    "build_beamer_document",
    "compile_latex",
    "convert_pdf_to_images",
    "_resolve_theme",
]
