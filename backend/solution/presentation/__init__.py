"""Presentation modules for SARAL research defense templates."""

from .archetypes import SlideArchetype, classify_slide
from .engine import (
    BEAMER_THEMES,
    build_beamer_document,
    compile_latex,
    convert_pdf_to_images,
)

__all__ = [
    "SlideArchetype",
    "classify_slide",
    "BEAMER_THEMES",
    "build_beamer_document",
    "compile_latex",
    "convert_pdf_to_images",
]
