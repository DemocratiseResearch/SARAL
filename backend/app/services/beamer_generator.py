# import os
# import json
# from typing import Dict, List
# from pathlib import Path
# from app.utils.timing import track_performance


# @track_performance
# def create_beamer_presentation(paper_id: str, scripts_data: dict, metadata: dict, image_assignments: dict = None):
#     """Create a complete Beamer presentation with bullet points - Fixed slide length issue."""
    
#     # Load scripts data
#     sections = scripts_data.get("sections", {})
#     title_intro = scripts_data.get("title_intro_script", "")
    
#     # Create LaTeX content
#     latex_content = generate_beamer_latex(metadata, sections, title_intro, image_assignments or {})
    
#     # Save LaTeX file
#     latex_dir = f"temp/latex/{paper_id}"
#     os.makedirs(latex_dir, exist_ok=True)
#     latex_file = os.path.join(latex_dir, f"{paper_id}_presentation.tex")
    
#     with open(latex_file, 'w', encoding='utf-8') as f:
#         f.write(latex_content)
    
#     return latex_file

# @track_performance
# def generate_beamer_latex(metadata: dict, sections: dict, title_intro: str, image_assignments: dict):
#     """Generate complete Beamer LaTeX with bullet points - FIXED: No longer creates 30+ slides."""
    
#     latex_content = f"""\\documentclass[aspectratio=169]{{beamer}}

# % Theme and packages
# \\usepackage{{graphicx}}
# \\usepackage{{amsmath}}
# \\usepackage{{amsfonts}}
# \\usepackage{{amssymb}}
# \\usepackage[utf8]{{inputenc}}
# \\usepackage[T1]{{fontenc}}

# % Use theme - try to load from multiple locations
# \\makeatletter
# \\@ifpackagelater{{}} {{}} {{}}
# \\makeatother

# % Try different theme paths
# \\IfFileExists{{beamerthemeSimpleDarkBlue.sty}}{{\\usetheme{{SimpleDarkBlue}}}}{{
# \\IfFileExists{{temp/latex_template/beamerthemeSimpleDarkBlue.sty}}{{
# \\usepackage{{temp/latex_template/beamerthemeSimpleDarkBlue}}
# }}{{
# % Fallback to default theme
# \\usetheme{{Madrid}}
# \\usecolortheme{{seahorse}}
# }}
# }}

# % Title information
# \\title{{{escape_latex(metadata.get('title', 'Research Presentation'))}}}
# \\author{{{escape_latex(metadata.get('authors', 'Author'))}}}
# \\date{{{escape_latex(metadata.get('date', '2024'))}}}

# \\begin{{document}}

# % Title slide
# \\begin{{frame}}
# \\titlepage
# \\end{{frame}}

# """

#     # Add section slides - FIXED: Removed overlay specifications that create multiple slides
#     # section_order = ["Introduction", "Methodology", "Results", "Discussion", "Conclusion"]
    
#     # for section_name in section_order:
#     #     if section_name in sections:
#     #         section_data = sections[section_name]
            
#     #         # Handle both old and new data structures
#     #         if isinstance(section_data, dict):
#     #             bullet_points = section_data.get("bullet_points", [])
#     #             assigned_image = section_data.get("assigned_image")
#     #         else:
#     #             bullet_points = []
#     #             assigned_image = None
            
#     #         latex_content += f"""

#     section_order = list(sections.keys())
    
#     for section_name in section_order:
#         if section_name in sections:
#             section_data = sections[section_name]
            
#             if isinstance(section_data, dict):
#                 bullet_points = section_data.get("bullet_points", [])
#                 assigned_image = section_data.get("assigned_image")
#             else:
#                 bullet_points = []
#                 assigned_image = None
            
#             latex_content += f"""

# % {section_name} slide
# \\begin{{frame}}{{{section_name}}}
# """
            
#             # Add image if assigned
#             if assigned_image:
#                 latex_content += f"""\\begin{{columns}}
# \\begin{{column}}{{0.6\\textwidth}}
# """
            
#             # Add bullet points - REMOVED [<+->] overlay to prevent slide multiplication
#             if bullet_points:
#                 latex_content += """\\begin{itemize}
# """
#                 for bullet in bullet_points:
#                     # Ensure bullet is a string and escape it properly
#                     bullet_text = str(bullet) if bullet else "No content"
#                     latex_content += f"\\item {escape_latex(bullet_text)}\n"
                    
#                 latex_content += """\\end{itemize}
# """
#             else:
#                 # Fallback content if no bullet points
#                 latex_content += f"""\\begin{{itemize}}
# \\item Key points about {section_name.lower()} will be presented here
# \\end{{itemize}}
# """
            
#             # Close columns and add image
#             if assigned_image:
#                 latex_content += f"""\\end{{column}}
# \\begin{{column}}{{0.4\\textwidth}}
# \\begin{{center}}
# \\includegraphics[width=\\textwidth,height=0.7\\textheight,keepaspectratio]{{images/{assigned_image}}}
# \\end{{center}}
# \\end{{column}}
# \\end{{columns}}
# """
            
#             latex_content += """\\end{frame}

# """

#     latex_content += """\\end{document}"""
    
#     return latex_content


# @track_performance
# def escape_latex(text: str) -> str:
#     """Escape special LaTeX characters properly."""
#     if not text:
#         return ""
    
#     text = str(text)  # Ensure it's a string
    
#     # Order matters for replacements
#     replacements = [
#         ('\\', '\\textbackslash{}'),
#         ('{', '\\{'),
#         ('}', '\\}'),
#         ('$', '\\$'),
#         ('&', '\\&'),
#         ('%', '\\%'),
#         ('#', '\\#'),
#         ('^', '\\textasciicircum{}'),
#         ('_', '\\_'),
#         ('~', '\\textasciitilde{}'),
#     ]
    
#     for char, replacement in replacements:
#         text = text.replace(char, replacement)
    
#     return text














import os
import re
import json
from typing import Dict, List
from pathlib import Path
from app.utils.timing import track_performance


# ---------------------------------------------------------------------------
# Noto font path resolution: keep Linux hardcode as default, fall back to macOS
# ---------------------------------------------------------------------------
_LINUX_NOTO_PATH = "/usr/share/fonts/truetype/noto/"
_MAC_NOTO_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/",
    "/System/Library/Fonts/",
    "/Library/Fonts/",
    os.path.expanduser("~/Library/Fonts/"),
]


def _resolve_noto_path() -> str:
    """
    Return the directory that contains NotoSans-Regular.ttf (or the variable-font
    equivalent). Defaults to the hardcoded Linux path; falls back to known macOS
    locations when the Linux path does not exist on the current machine.
    """
    probes = ["NotoSans-Regular.ttf", "NotoSans[wdth,wght].ttf", "NotoSans[wght].ttf"]
    if any(os.path.exists(os.path.join(_LINUX_NOTO_PATH, p)) for p in probes):
        return _LINUX_NOTO_PATH
    for candidate in _MAC_NOTO_CANDIDATES:
        if any(os.path.exists(os.path.join(candidate, p)) for p in probes):
            print(f"[beamer_generator] Noto fonts found at macOS path: {candidate}")
            return candidate
    # Neither found — return the hardcoded Linux path anyway so the error
    # message from fontspec is meaningful rather than silently using nullfont.
    print(f"[beamer_generator] Warning: NotoSans-Regular.ttf not found in known paths. Defaulting to {_LINUX_NOTO_PATH}")
    return _LINUX_NOTO_PATH


def _resolve_font_file(noto_path: str, static_name: str, variable_patterns: list) -> str:
    """
    Return the filename to pass to fontspec for a given Noto font.
    Prefers the static filename (Linux); falls back to the variable-font
    filename that Homebrew installs on macOS.
    """
    if os.path.exists(os.path.join(noto_path, static_name)):
        return static_name
    for pat in variable_patterns:
        if os.path.exists(os.path.join(noto_path, pat)):
            print(f"[beamer_generator] Using variable font file: {pat}")
            return pat
    # Nothing found — return static name so fontspec error is explicit
    return static_name


# LANGUAGE → (latex_font_command, unicode_regex_range)
LANGUAGE_FONT_MAP = {
    "hindi":     ("\\devanagarifont", r"[\u0900-\u097F]"),
    "marathi":   ("\\devanagarifont", r"[\u0900-\u097F]"),
    "nepali":    ("\\devanagarifont", r"[\u0900-\u097F]"),
    "sanskrit":  ("\\devanagarifont", r"[\u0900-\u097F]"),
    "telugu":    ("\\telugufont",     r"[\u0C00-\u0C7F]"),
    "tamil":     ("\\tamilfont",      r"[\u0B80-\u0BFF]"),
    "kannada":   ("\\kannadafont",    r"[\u0C80-\u0CFF]"),
    "malayalam": ("\\malayalamfont",  r"[\u0D00-\u0D7F]"),
    "gujarati":  ("\\gujaratifont",   r"[\u0A80-\u0AFF]"),
    "punjabi":   ("\\gurmukhifont",   r"[\u0A00-\u0A7F]"),
    "bengali":   ("\\bengalifont",    r"[\u0980-\u09FF]"),
    "assamese":  ("\\bengalifont",    r"[\u0980-\u09FF]"),
    "odia":      ("\\odiafont",       r"[\u0B00-\u0B7F]"),
}

# Languages with confirmed polyglossia .ldf support on TeX Live 2022
# Gujarati, Punjabi removed — their .ldf files are missing
# Urdu removed — requires bidi.sty separately
POLYGLOSSIA_SUPPORTED = [
    "hindi", "telugu", "tamil", "kannada",
    "malayalam", "bengali", "assamese"
]


def wrap_indic(text: str, language: str) -> str:
    """
    Detect script-specific Unicode characters and wrap them with
    the correct LaTeX font command. Latin/English parts are escaped normally.
    """
    if not text:
        return ""

    lang_key = language.strip().lower()
    if lang_key not in LANGUAGE_FONT_MAP:
        return escape_latex(text)

    font_cmd, unicode_range = LANGUAGE_FONT_MAP[lang_key]
    pattern = re.compile(f"({unicode_range}+(?:\\s*{unicode_range}+)*)")

    parts = pattern.split(text)
    result = ""
    for part in parts:
        if not part:
            continue
        if pattern.match(part):
            result += f"{{{font_cmd} {part}}}"
        else:
            result += escape_latex(part)
    return result


def escape_latex(text: str) -> str:
    """Escape special LaTeX characters."""
    if not text:
        return ""
    text = str(text)
    replacements = [
        ('\\', '\\textbackslash{}'),
        ('{',  '\\{'),
        ('}',  '\\}'),
        ('$',  '\\$'),
        ('&',  '\\&'),
        ('%',  '\\%'),
        ('#',  '\\#'),
        ('^',  '\\textasciicircum{}'),
        ('_',  '\\_'),
        ('~',  '\\textasciitilde{}'),
    ]
    for char, replacement in replacements:
        text = text.replace(char, replacement)
    return text


@track_performance
def create_beamer_presentation(
    paper_id: str,
    scripts_data: dict,
    metadata: dict,
    image_assignments: dict = None,
    language: str = "English"
):
    """Create a complete Beamer presentation with multi-language support."""

    sections    = scripts_data.get("sections", {})
    title_intro = scripts_data.get("title_intro_script", "")

    latex_content = generate_beamer_latex(
        metadata, sections, title_intro,
        image_assignments or {},
        language
    )

    latex_dir  = f"temp/latex/{paper_id}"
    os.makedirs(latex_dir, exist_ok=True)
    latex_file = os.path.join(latex_dir, f"{paper_id}_presentation.tex")

    with open(latex_file, 'w', encoding='utf-8') as f:
        f.write(latex_content)

    return latex_file


def generate_beamer_latex(
    metadata: dict,
    sections: dict,
    title_intro: str,
    image_assignments: dict,
    language: str = "English"
):
    """Generate complete Beamer LaTeX — same format as original, multi-language fonts."""

    lang_key = language.strip().lower()
    print(f"Generating LaTeX for language: {language} (key: {lang_key})")
    is_indic = lang_key in LANGUAGE_FONT_MAP
    print(f"Is Indic language: {is_indic}")

    noto_path = _resolve_noto_path()
    print(f"[beamer_generator] Using Noto font path: {noto_path}")

    # Resolve actual filenames on disk (static vs variable font packages)
    f_sans_reg  = _resolve_font_file(noto_path, "NotoSans-Regular.ttf",    ["NotoSans[wdth,wght].ttf", "NotoSans[wght].ttf"])
    f_sans_bold = _resolve_font_file(noto_path, "NotoSans-Bold.ttf",       ["NotoSans[wdth,wght].ttf", "NotoSans[wght].ttf"])
    f_sans_ital = _resolve_font_file(noto_path, "NotoSans-Italic.ttf",     ["NotoSans-Italic[wdth,wght].ttf", "NotoSans-Italic[wght].ttf"])
    f_sans_bdit = _resolve_font_file(noto_path, "NotoSans-BoldItalic.ttf", ["NotoSans-BoldItalic[wdth,wght].ttf", "NotoSans-BoldItalic[wght].ttf"])

    f_deva_reg  = _resolve_font_file(noto_path, "NotoSansDevanagari-Regular.ttf", ["NotoSansDevanagari[wdth,wght].ttf", "NotoSansDevanagari[wght].ttf"])
    f_deva_bold = _resolve_font_file(noto_path, "NotoSansDevanagari-Bold.ttf",    ["NotoSansDevanagari[wdth,wght].ttf", "NotoSansDevanagari[wght].ttf"])

    f_telu_reg  = _resolve_font_file(noto_path, "NotoSansTelugu-Regular.ttf", ["NotoSansTelugu[wdth,wght].ttf", "NotoSansTelugu[wght].ttf"])
    f_telu_bold = _resolve_font_file(noto_path, "NotoSansTelugu-Bold.ttf",    ["NotoSansTelugu[wdth,wght].ttf", "NotoSansTelugu[wght].ttf"])

    f_tamil_reg  = _resolve_font_file(noto_path, "NotoSansTamil-Regular.ttf", ["NotoSansTamil[wdth,wght].ttf", "NotoSansTamil[wght].ttf"])
    f_tamil_bold = _resolve_font_file(noto_path, "NotoSansTamil-Bold.ttf",    ["NotoSansTamil[wdth,wght].ttf", "NotoSansTamil[wght].ttf"])

    f_kanna_reg  = _resolve_font_file(noto_path, "NotoSansKannada-Regular.ttf", ["NotoSansKannada[wdth,wght].ttf", "NotoSansKannada[wght].ttf"])
    f_kanna_bold = _resolve_font_file(noto_path, "NotoSansKannada-Bold.ttf",    ["NotoSansKannada[wdth,wght].ttf", "NotoSansKannada[wght].ttf"])

    f_maly_reg   = _resolve_font_file(noto_path, "NotoSansMalayalam-Regular.ttf", ["NotoSansMalayalam[wdth,wght].ttf", "NotoSansMalayalam[wght].ttf"])
    f_maly_bold  = _resolve_font_file(noto_path, "NotoSansMalayalam-Bold.ttf",    ["NotoSansMalayalam[wdth,wght].ttf", "NotoSansMalayalam[wght].ttf"])

    f_guja_reg   = _resolve_font_file(noto_path, "NotoSansGujarati-Regular.ttf", ["NotoSansGujarati[wdth,wght].ttf", "NotoSansGujarati[wght].ttf"])
    f_guja_bold  = _resolve_font_file(noto_path, "NotoSansGujarati-Bold.ttf",    ["NotoSansGujarati[wdth,wght].ttf", "NotoSansGujarati[wght].ttf"])

    f_guru_reg   = _resolve_font_file(noto_path, "NotoSansGurmukhi-Regular.ttf", ["NotoSansGurmukhi[wdth,wght].ttf", "NotoSansGurmukhi[wght].ttf"])
    f_guru_bold  = _resolve_font_file(noto_path, "NotoSansGurmukhi-Bold.ttf",    ["NotoSansGurmukhi[wdth,wght].ttf", "NotoSansGurmukhi[wght].ttf"])

    f_beng_reg   = _resolve_font_file(noto_path, "NotoSansBengali-Regular.ttf", ["NotoSansBengali[wdth,wght].ttf", "NotoSansBengali[wght].ttf"])
    f_beng_bold  = _resolve_font_file(noto_path, "NotoSansBengali-Bold.ttf",    ["NotoSansBengali[wdth,wght].ttf", "NotoSansBengali[wght].ttf"])

    f_odia_reg   = _resolve_font_file(noto_path, "NotoSansOriya-Regular.ttf", ["NotoSansOriya[wdth,wght].ttf", "NotoSansOriya[wght].ttf"])
    f_odia_bold  = _resolve_font_file(noto_path, "NotoSansOriya-Bold.ttf",    ["NotoSansOriya[wdth,wght].ttf", "NotoSansOriya[wght].ttf"])

    print(f"[beamer_generator] Devanagari font file: {f_deva_reg}")

    # Title/author — wrap indic chars if needed, else plain escape
    title  = wrap_indic(metadata.get('title',   'Research Presentation'), language) if is_indic else escape_latex(metadata.get('title',   'Research Presentation'))
    author = wrap_indic(metadata.get('authors', 'Author'),                language) if is_indic else escape_latex(metadata.get('authors', 'Author'))
    date   = escape_latex(metadata.get('date', '2024'))

    # Only add \setotherlanguage for languages polyglossia supports
    polyglossia_others = "\n".join(
        f"\\setotherlanguage{{{lang}}}"
        for lang in POLYGLOSSIA_SUPPORTED
        if lang != lang_key  # avoid duplicate if main lang is one of these
    )

    latex_content = f"""\\documentclass[aspectratio=169]{{beamer}}

\\PassOptionsToPackage{{unicode=true,hidelinks}}{{hyperref}}

\\usepackage{{fontspec}}
\\usepackage{{polyglossia}}

% Theme
\\IfFileExists{{beamerthemeSimpleDarkBlue.sty}}{{\\usetheme{{SimpleDarkBlue}}}}{{
  \\usetheme{{Madrid}}
  \\usecolortheme{{seahorse}}
}}

% PRIMARY FONT: Noto Sans (English/Latin)
\\setmainfont[
  Path={noto_path},
  BoldFont={f_sans_bold},
  ItalicFont={f_sans_ital},
  BoldItalicFont={f_sans_bdit}
]{{{f_sans_reg}}}

\\setsansfont[
  Path={noto_path},
  BoldFont={f_sans_bold},
  ItalicFont={f_sans_ital},
  BoldItalicFont={f_sans_bdit}
]{{{f_sans_reg}}}

\\renewcommand{{\\familydefault}}{{\\sfdefault}}

% INDIC FONTS — defined for all, used on demand via font commands

% Devanagari — Hindi, Marathi, Nepali, Sanskrit
\\newfontfamily\\devanagarifont[
  Script=Devanagari,
  Path={noto_path},
  BoldFont={f_deva_bold}
]{{{f_deva_reg}}}

% Telugu
\\newfontfamily\\telugufont[
  Script=Telugu,
  Path={noto_path},
  BoldFont={f_telu_bold}
]{{{f_telu_reg}}}

% Tamil
\\newfontfamily\\tamilfont[
  Script=Tamil,
  Path={noto_path},
  BoldFont={f_tamil_bold}
]{{{f_tamil_reg}}}

% Kannada
\\newfontfamily\\kannadafont[
  Script=Kannada,
  Path={noto_path},
  BoldFont={f_kanna_bold}
]{{{f_kanna_reg}}}

% Malayalam
\\newfontfamily\\malayalamfont[
  Script=Malayalam,
  Path={noto_path},
  BoldFont={f_maly_bold}
]{{{f_maly_reg}}}

% Gujarati (font only — no polyglossia .ldf on TeX Live 2022)
\\newfontfamily\\gujaratifont[
  Script=Gujarati,
  Path={noto_path},
  BoldFont={f_guja_bold}
]{{{f_guja_reg}}}

% Punjabi/Gurmukhi (font only — no polyglossia .ldf on TeX Live 2022)
\\newfontfamily\\gurmukhifont[
  Script=Gurmukhi,
  Path={noto_path},
  BoldFont={f_guru_bold}
]{{{f_guru_reg}}}

% Bengali / Assamese
\\newfontfamily\\bengalifont[
  Script=Bengali,
  Path={noto_path},
  BoldFont={f_beng_bold}
]{{{f_beng_reg}}}

% Odia
\\newfontfamily\\odiafont[
  Script=Oriya,
  Path={noto_path},
  BoldFont={f_odia_bold}
]{{{f_odia_reg}}}

% POLYGLOSSIA — only languages with confirmed .ldf support
\\setmainlanguage{{english}}
{polyglossia_others}

\\usepackage{{graphicx}}
\\usepackage{{amsmath}}

\\title{{{title}}}
\\author{{{author}}}
\\date{{{date}}}

\\begin{{document}}

\\begin{{frame}}
\\titlepage
\\end{{frame}}

"""

    section_order = list(sections.keys())

    for section_name in section_order:
        section_data = sections.get(section_name, {})

        if isinstance(section_data, dict):
            if is_indic:
                bullet_points = section_data.get("bullet_points_hindi",
                                section_data.get("bullet_points", []))
            else:
                bullet_points = section_data.get("bullet_points_english",
                                section_data.get("bullet_points", []))
            assigned_image = section_data.get("assigned_image")
        else:
            bullet_points  = []
            assigned_image = None

        # Section title — wrap indic if needed
        section_title = wrap_indic(section_name, language) if is_indic else escape_latex(section_name)

        latex_content += f"""
% {section_name} slide
\\begin{{frame}}{{{section_title}}}
"""

        if assigned_image:
            latex_content += "\\begin{columns}\n\\begin{column}{0.6\\textwidth}\n"

        # ---- BULLET POINTS — same \itemize format as original ----
        if bullet_points:
            latex_content += "\\begin{itemize}\n"
            for bullet in bullet_points:
                bullet_text = str(bullet).strip() if bullet else ""
                if bullet_text:
                    # wrap_indic handles font-switching + escaping per bullet
                    processed = wrap_indic(bullet_text, language) if is_indic else escape_latex(bullet_text)
                    latex_content += f"\\item {processed}\n"
            latex_content += "\\end{itemize}\n"
        else:
            latex_content += "\\begin{itemize}\n\\item Content coming soon.\n\\end{itemize}\n"

        if assigned_image:
            latex_content += f"""\\end{{column}}
\\begin{{column}}{{0.4\\textwidth}}
\\begin{{center}}
\\includegraphics[width=\\textwidth,height=0.7\\textheight,keepaspectratio]{{images/{assigned_image}}}
\\end{{center}}
\\end{{column}}
\\end{{columns}}
"""

        latex_content += "\\end{frame}\n"

    latex_content += "\n\\end{document}"
    return latex_content
