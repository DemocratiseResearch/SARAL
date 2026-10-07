"""Design tokens and theme specifications for SARAL research presentations and posters.

These tokens define the visual identity for academic communication:
- High contrast, legible typography.
- Professional, evidence-focused color palettes.
- Structured card and grid geometry.
- Semantic mapping between content roles and visual presentation.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class ColorPalette:
    """Color palette definition with hex and LaTeX RGB color values."""
    name: str
    primary: str          # Main brand/header color (Hex)
    primary_rgb: str      # LaTeX format: "R,G,B" (0-255)
    secondary: str        # Supporting structural color
    secondary_rgb: str
    accent: str           # Accent / highlight color (for key claims, alerts, badges)
    accent_rgb: str
    bg_canvas: str        # Slide/poster overall canvas background
    bg_canvas_rgb: str
    surface: str          # Card / block surface color
    surface_rgb: str
    surface_alt: str      # Alternating / secondary card background
    surface_alt_rgb: str
    border: str           # Clean border outline
    border_rgb: str
    text_primary: str     # Main readable text
    text_primary_rgb: str
    text_muted: str       # Secondary text, captions, metadata
    text_muted_rgb: str
    alert_primary: str    # Primary color for alert/takeaway blocks
    alert_primary_rgb: str
    alert_surface: str    # Tinted background for alert/takeaway blocks
    alert_surface_rgb: str


# Pre-defined academic color themes
THEME_PALETTES: Dict[str, ColorPalette] = {
    # Default SARAL Classic: Navy, Royal Blue, Warm Amber
    "saral": ColorPalette(
        name="SARAL Classic Navy",
        primary="#0F2741",
        primary_rgb="15,39,65",
        secondary="#1E3A8A",
        secondary_rgb="30,58,138",
        accent="#D97706",
        accent_rgb="217,119,6",
        bg_canvas="#FFFFFF",
        bg_canvas_rgb="255,255,255",
        surface="#F8FAFC",
        surface_rgb="248,250,252",
        surface_alt="#F1F5F9",
        surface_alt_rgb="241,245,249",
        border="#CBD5E1",
        border_rgb="203,213,225",
        text_primary="#0F172A",
        text_primary_rgb="15,23,42",
        text_muted="#475569",
        text_muted_rgb="71,85,105",
        alert_primary="#B45309",
        alert_primary_rgb="180,83,9",
        alert_surface="#FFFBEB",
        alert_surface_rgb="255,251,235",
    ),
    # Modern Slate: Dark Charcoal, Indigo Accent, Ice Grey
    "metropolis": ColorPalette(
        name="Slate Modern",
        primary="#1E293B",
        primary_rgb="30,41,59",
        secondary="#334155",
        secondary_rgb="51,65,85",
        accent="#4F46E5",
        accent_rgb="79,70,229",
        bg_canvas="#FAFAFA",
        bg_canvas_rgb="250,250,250",
        surface="#FFFFFF",
        surface_rgb="255,255,255",
        surface_alt="#F1F5F9",
        surface_alt_rgb="241,245,249",
        border="#E2E8F0",
        border_rgb="226,232,240",
        text_primary="#0F172A",
        text_primary_rgb="15,23,42",
        text_muted="#64748B",
        text_muted_rgb="100,116,139",
        alert_primary="#4338CA",
        alert_primary_rgb="67,56,202",
        alert_surface="#EEF2FF",
        alert_surface_rgb="238,242,255",
    ),
    # Light Sidebar / Academic Seahorse
    "berkeley": ColorPalette(
        name="Academic Steel & Cobalt",
        primary="#1E3A8A",
        primary_rgb="30,58,138",
        secondary="#2563EB",
        secondary_rgb="37,99,235",
        accent="#0284C7",
        accent_rgb="2,132,199",
        bg_canvas="#FFFFFF",
        bg_canvas_rgb="255,255,255",
        surface="#F8FAFC",
        surface_rgb="248,250,252",
        surface_alt="#EFF6FF",
        surface_alt_rgb="239,246,255",
        border="#BFDBFE",
        border_rgb="191,219,254",
        text_primary="#1E293B",
        text_primary_rgb="30,41,59",
        text_muted="#475569",
        text_muted_rgb="71,85,105",
        alert_primary="#0369A1",
        alert_primary_rgb="3,105,161",
        alert_surface="#F0F9FF",
        alert_surface_rgb="240,249,255",
    ),
    # Cambridge Crimson: Crimson header, Rose accent, Warm Sand
    "cambridgeus": ColorPalette(
        name="Crimson Academic",
        primary="#881337",
        primary_rgb="136,19,55",
        secondary="#9F1239",
        secondary_rgb="159,18,57",
        accent="#BE123C",
        accent_rgb="190,18,60",
        bg_canvas="#FFFFFF",
        bg_canvas_rgb="255,255,255",
        surface="#FFF1F2",
        surface_rgb="255,241,242",
        surface_alt="#FFE4E6",
        surface_alt_rgb="255,228,230",
        border="#FECDD3",
        border_rgb="254,205,211",
        text_primary="#1C1917",
        text_primary_rgb="28,25,23",
        text_muted="#78716C",
        text_muted_rgb="120,113,108",
        alert_primary="#9F1239",
        alert_primary_rgb="159,18,57",
        alert_surface="#FFF1F2",
        alert_surface_rgb="255,241,242",
    ),
    # Palo Alto Navy: Deep Navy Sidebar, Cyan accent
    "paloalto": ColorPalette(
        name="Palo Alto Deep Navy",
        primary="#0A2540",
        primary_rgb="10,37,64",
        secondary="#004D80",
        secondary_rgb="0,77,128",
        accent="#0070F3",
        accent_rgb="0,112,243",
        bg_canvas="#FFFFFF",
        bg_canvas_rgb="255,255,255",
        surface="#F4F8FA",
        surface_rgb="244,248,250",
        surface_alt="#E8F1F5",
        surface_alt_rgb="232,241,245",
        border="#D1E2EC",
        border_rgb="209,226,236",
        text_primary="#0F172A",
        text_primary_rgb="15,23,42",
        text_muted="#5B7083",
        text_muted_rgb="91,112,131",
        alert_primary="#0070F3",
        alert_primary_rgb="0,112,243",
        alert_surface="#E6F4FF",
        alert_surface_rgb="230,244,255",
    ),
    # Emerald / Biomedical
    "teal_emerald": ColorPalette(
        name="Biomedical Emerald",
        primary="#064E3B",
        primary_rgb="6,78,59",
        secondary="#047857",
        secondary_rgb="4,120,87",
        accent="#059669",
        accent_rgb="5,150,105",
        bg_canvas="#FFFFFF",
        bg_canvas_rgb="255,255,255",
        surface="#ECFDF5",
        surface_rgb="236,253,245",
        surface_alt="#D1FAE5",
        surface_alt_rgb="209,250,229",
        border="#A7F3D0",
        border_rgb="167,243,208",
        text_primary="#062017",
        text_primary_rgb="6,32,23",
        text_muted="#374151",
        text_muted_rgb="55,65,81",
        alert_primary="#047857",
        alert_primary_rgb="4,120,87",
        alert_surface="#ECFDF5",
        alert_surface_rgb="236,253,245",
    ),
    # Earth Amber / Warm Earth
    "amber_earth": ColorPalette(
        name="Earth Amber",
        primary="#78350F",
        primary_rgb="120,53,15",
        secondary="#92400E",
        secondary_rgb="146,64,14",
        accent="#D97706",
        accent_rgb="217,119,6",
        bg_canvas="#FFFFFF",
        bg_canvas_rgb="255,255,255",
        surface="#FEF3C7",
        surface_rgb="254,243,199",
        surface_alt="#FDE68A",
        surface_alt_rgb="253,230,138",
        border="#FCD34D",
        border_rgb="252,211,77",
        text_primary="#451A03",
        text_primary_rgb="69,26,3",
        text_muted="#78350F",
        text_muted_rgb="120,53,15",
        alert_primary="#B45309",
        alert_primary_rgb="180,83,9",
        alert_surface="#FEF3C7",
        alert_surface_rgb="254,243,199",
    ),
}

# Theme Aliases for backwards compatibility
THEME_ALIASES: Dict[str, str] = {
    "default": "saral",
    "template-saral": "saral",
    "classic-blue": "saral",
    "gemini": "saral",
    "classic_navy": "saral",
    "slate-modern": "metropolis",
    "slate_indigo": "metropolis",
    "modern": "metropolis",
    "clean_slate": "metropolis",
    "light-sidebar": "berkeley",
    "crimson": "cambridgeus",
    "crimson_burgundy": "cambridgeus",
    "academic_burgundy": "cambridgeus",
    "navy-sidebar": "paloalto",
    "vibrant_indigo": "paloalto",
    "emerald": "teal_emerald",
    "teal": "teal_emerald",
    "modern_teal": "teal_emerald",
    "amber": "amber_earth",
    "amber_earth": "amber_earth",
}


def resolve_palette(theme_name: str | None) -> ColorPalette:
    """Resolve a theme name or alias to a valid ColorPalette.
    
    Falls back gracefully to 'saral' if theme is unknown or empty.
    """
    if not theme_name:
        return THEME_PALETTES["saral"]
    key = theme_name.strip().lower()
    canonical = THEME_ALIASES.get(key, key)
    return THEME_PALETTES.get(canonical, THEME_PALETTES["saral"])
