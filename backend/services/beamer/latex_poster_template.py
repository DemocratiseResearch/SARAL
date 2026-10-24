"""LaTeX Beamerposter template builder for SARAL AI.

Integrated with the redesigned poster engine in solution/poster/engine.py.
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

from solution.poster.engine import build_poster_document
from solution.poster.themes import create_theme_files
from solution.shared.latex_utils import escape_latex

__all__ = [
    "create_theme_files",
    "build_poster_document",
    "escape_latex",
]
