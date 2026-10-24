"""Shared modules for SARAL presentation and poster template redesign."""

from .tokens import ColorPalette, THEME_PALETTES, THEME_ALIASES, resolve_palette
from .latex_utils import (
    escape_latex,
    normalise_bullets,
    font_commands,
    wrap_script_runs,
    LANGUAGE_FONT_MAP,
)

__all__ = [
    "ColorPalette",
    "THEME_PALETTES",
    "THEME_ALIASES",
    "resolve_palette",
    "escape_latex",
    "normalise_bullets",
    "font_commands",
    "wrap_script_runs",
    "LANGUAGE_FONT_MAP",
]
